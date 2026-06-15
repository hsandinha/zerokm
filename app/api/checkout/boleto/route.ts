import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import Plan from '@/models/Plan';
import User from '@/models/User';
import Invite from '@/models/Invite';
import Payment from '@/models/Payment';
import { validateCPF } from '@/lib/utils/cpf';
import { createBoletoPayment, getBoletoExpirationDate, validateBoletoProfile } from '@/lib/services/boletoService';
import { normalizeBillingType } from '@/lib/services/mercadoPagoSubscriptionService';

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.uid) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { planId, billingType: rawBillingType } = body;
    if (!planId) {
        return NextResponse.json({ error: 'planId obrigatório' }, { status: 400 });
    }

    const billingType = normalizeBillingType(rawBillingType);

    await connectDB();

    const plan = await Plan.findById(planId);
    if (!plan || !plan.active || plan.type !== 'monthly') {
        return NextResponse.json({ error: 'Plano não encontrado ou inativo' }, { status: 404 });
    }

    const user = await User.findOne({ firebaseUid: session.user.uid });
    if (!user) {
        return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    if (!user.cpf || !validateCPF(user.cpf)) {
        return NextResponse.json({ error: 'Completar seu perfil com um CPF válido é obrigatório para boleto.' }, { status: 400 });
    }

    const profileError = validateBoletoProfile(user);
    if (profileError) {
        return NextResponse.json({ error: profileError }, { status: 400 });
    }

    const inviteesCount = await Invite.countDocuments({
        inviterId: user._id,
        status: { $in: ['pending', 'accepted'] },
    });

    const clientIp = (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '').split(',')[0].trim();
    const externalReference = `${session.user.uid}:${plan._id.toString()}:${billingType}:boleto:${Date.now()}`;
    const preferredExpiration = user.subscription?.expiresAt ? new Date(user.subscription.expiresAt) : null;
    const expirationDate = getBoletoExpirationDate(preferredExpiration);

    const { payRes, totalAmount, boletoUrl, boletoBarcode } = await createBoletoPayment({
        user,
        plan,
        billingType,
        inviteesCount,
        externalReference,
        expirationDate,
        metadataType: 'boleto-inline',
        clientIp,
    });

    if (!payRes.ok) {
        console.error('Erro ao criar boleto:', JSON.stringify(payRes.data));
        return NextResponse.json({
            error: payRes.data?.message || 'Erro ao gerar boleto',
        }, { status: 400 });
    }

    try {
        await Payment.create({
            userId: user._id,
            planId: plan._id,
            mpPaymentId: payRes.data.id?.toString(),
            externalReference,
            method: 'bolbradesco',
            methodDetail: 'bolbradesco',
            status: payRes.data.status || 'pending',
            statusDetail: payRes.data.status_detail,
            amount: totalAmount,
            currency: 'BRL',
            billingType,
            payerEmail: user.email || session.user.email,
            payerName: user.displayName,
            boletoUrl,
            boletoBarcode,
            mpDateCreated: payRes.data.date_created ? new Date(payRes.data.date_created) : undefined,
        });
    } catch (err) {
        console.error('Erro ao registrar Payment boleto pendente:', err);
    }

    return NextResponse.json({
        ok: true,
        paymentId: payRes.data.id,
        boletoUrl,
        boletoBarcode,
        expiresAt: payRes.data.date_of_expiration || expirationDate.toISOString(),
        amount: totalAmount,
    });
}
