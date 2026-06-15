import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/authOptions';
import connectDB from '../../../../../lib/mongodb';
import { chargeCustomerCard } from '../../../../../lib/mercadopago';
import User from '../../../../../models/User';
import Plan from '../../../../../models/Plan';
import Payment from '../../../../../models/Payment';
import Transaction from '../../../../../models/Transaction';

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    const profile = (session?.user as any)?.profile;
    if (!profile || !['administrador', 'admin'].includes(profile)) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
    }

    const { userId } = await req.json().catch(() => ({}));
    if (!userId) return NextResponse.json({ error: 'userId obrigatório.' }, { status: 400 });

    await connectDB();

    const user = await User.findById(userId).lean() as any;
    if (!user) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });

    if (!user.creditCard?.mpCardId || !user.mpCustomerId) {
        return NextResponse.json({ error: 'Usuário não possui cartão cadastrado.' }, { status: 400 });
    }

    const planId = user.subscription?.planId;
    if (!planId) {
        return NextResponse.json({ error: 'Usuário não possui um plano associado.' }, { status: 400 });
    }

    const plan = await Plan.findById(planId).lean() as any;
    if (!plan) return NextResponse.json({ error: 'Plano não encontrado.' }, { status: 404 });

    // Cobrar via cartão salvo (usando CVV salvo)
    const payRes = await chargeCustomerCard({
        customerId: user.mpCustomerId,
        cardId: user.creditCard.mpCardId,
        paymentMethodId: user.creditCard.brand || 'visa',
        securityCode: user.creditCard.securityCode || undefined,
        email: user.email,
        amount: plan.price,
        description: `Renovação de plano: ${plan.name}`,
        metadata: { userId: userId.toString(), planId: planId.toString() },
    });

    const mpStatus: string | undefined = payRes.data?.status;
    const mpStatusDetail: string | undefined = payRes.data?.status_detail;
    const mpPaymentId = payRes.data?.id ? String(payRes.data.id) : '';

    if (!payRes.ok || !['approved', 'in_process', 'pending', 'authorized'].includes(mpStatus || '')) {
        const msg = mpStatusDetail
            || payRes.data?.message
            || 'Pagamento recusado.';
        return NextResponse.json({ error: msg }, { status: 400 });
    }

    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Aprovado → ativa assinatura + extrato "paid"
    if (mpStatus === 'approved') {
        const durationDays = plan.type === 'monthly' ? 30 : null;
        const expiresAt = durationDays
            ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000)
            : null;

        const profiles: string[] = user.allowedProfiles ?? [];
        const newProfiles = profiles.includes('cliente')
            ? profiles
            : [...profiles.filter((p: string) => p !== 'gratis'), 'cliente'];

        const updateFields: Record<string, any> = {
            'subscription.planId': planId,
            'subscription.status': 'active',
            allowedProfiles: newProfiles,
        };
        if (expiresAt) updateFields['subscription.expiresAt'] = expiresAt;

        let creditsToAdd = 0;
        if (plan.type === 'credits' && plan.credits) creditsToAdd = plan.credits;

        await User.findByIdAndUpdate(userId, {
            $set: updateFields,
            ...(creditsToAdd > 0 ? { $inc: { credits: creditsToAdd } } : {}),
        });

        await Payment.findOneAndUpdate(
            { mpPaymentId },
            {
                $set: {
                    userId: user._id,
                    planId,
                    mpPaymentId,
                    externalReference: `ADMIN-CHARGE-${userId}-${Date.now()}`,
                    method: 'credit_card',
                    status: 'approved',
                    statusDetail: mpStatusDetail,
                    amount: plan.price,
                    currency: 'BRL',
                    payerEmail: user.email,
                },
            },
            { upsert: true }
        );

        await Transaction.findOneAndUpdate(
            { referenceId: mpPaymentId },
            {
                $set: {
                    userId: user._id,
                    type: 'subscription',
                    description: `Cobrança Admin — ${plan.name} via Cartão`,
                    amount: plan.price,
                    referenceId: mpPaymentId,
                    month,
                    status: 'paid',
                },
            },
            { upsert: true }
        );

        return NextResponse.json({
            ok: true,
            paymentId: payRes.data.id,
            status: 'approved',
        });
    }

    // Em análise: registra Payment/Transaction como pending, sem ativar assinatura.
    // Webhook promove quando confirmar.
    await Payment.findOneAndUpdate(
        { mpPaymentId },
        {
            $set: {
                userId: user._id,
                planId,
                mpPaymentId,
                externalReference: `ADMIN-CHARGE-${userId}-${Date.now()}`,
                method: 'credit_card',
                status: mpStatus,
                statusDetail: mpStatusDetail,
                amount: plan.price,
                currency: 'BRL',
                payerEmail: user.email,
            },
        },
        { upsert: true }
    );

    await Transaction.findOneAndUpdate(
        { referenceId: mpPaymentId },
        {
            $set: {
                userId: user._id,
                type: 'subscription',
                description: `Cobrança Admin — ${plan.name} via Cartão (em análise)`,
                amount: plan.price,
                referenceId: mpPaymentId,
                month,
                status: 'pending',
            },
        },
        { upsert: true }
    );

    return NextResponse.json({
        ok: true,
        paymentId: payRes.data.id,
        status: mpStatus,
        pending: true,
        message: 'Pagamento em análise. A assinatura será ativada ao ser aprovado.',
    });
}
