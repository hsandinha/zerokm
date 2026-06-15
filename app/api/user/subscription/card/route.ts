import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import Plan from '@/models/Plan';
import Invite from '@/models/Invite';
import { validateCPF } from '@/lib/utils/cpf';
import { createPreapproval, updatePreapproval } from '@/lib/mercadopago';
import {
    activateSubscriptionAccess,
    addBillingPeriod,
    buildSubscriptionExternalReference,
    calculateSubscriptionAmount,
    getBillingPeriodConfig,
    getPublicBaseUrl,
    normalizeBillingType,
} from '@/lib/services/mercadoPagoSubscriptionService';

async function cancelPreviousPreapproval(preapprovalId?: string) {
    if (!preapprovalId) return;

    const firstTry = await updatePreapproval(preapprovalId, { status: 'cancelled' });
    if (!firstTry.ok) {
        await updatePreapproval(preapprovalId, { status: 'canceled' });
    }
}

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.uid) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const {
        planId,
        cardToken,
        billingType: rawBillingType,
        holderName,
        cpf,
        cardType,
        lastFour,
        brand,
        expirationMonth,
        expirationYear,
    } = body;

    if (!planId || typeof cardToken !== 'string' || cardToken.length === 0) {
        return NextResponse.json({ error: 'Faltam dados do plano ou token do cartão.' }, { status: 400 });
    }

    if (cardType === 'debit' || (typeof brand === 'string' && brand.startsWith('deb'))) {
        return NextResponse.json({ error: 'Assinatura recorrente aceita somente cartão de crédito.' }, { status: 400 });
    }

    const billingType = normalizeBillingType(rawBillingType);

    await connectDB();

    const user = await User.findOne({ firebaseUid: session.user.uid });
    if (!user) {
        return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });
    }

    if (!user.cpf || !validateCPF(user.cpf)) {
        return NextResponse.json({ error: 'Completar seu perfil com um CPF válido é obrigatório para assinatura.' }, { status: 400 });
    }

    const plan = await Plan.findById(planId);
    if (!plan || !plan.active || plan.type !== 'monthly') {
        return NextResponse.json({ error: 'Plano inválido para assinatura recorrente.' }, { status: 404 });
    }

    const activeInvitesCount = await Invite.countDocuments({
        inviterId: user._id,
        status: { $in: ['pending', 'accepted'] },
    });

    const { totalAmount } = calculateSubscriptionAmount(plan, billingType, activeInvitesCount);
    const externalReference = buildSubscriptionExternalReference(session.user.uid, plan._id.toString(), billingType);
    const { frequency, frequencyType } = getBillingPeriodConfig(billingType);
    const baseUrl = getPublicBaseUrl();
    const previousPreapprovalId = user.subscription?.mpPreapprovalId;

    const preapprovalRes = await createPreapproval({
        reason: `Assinatura ${plan.name} (${billingType === 'annual' ? 'Anual' : 'Mensal'})`,
        external_reference: externalReference,
        payer_email: user.email,
        card_token_id: cardToken,
        auto_recurring: {
            frequency,
            frequency_type: frequencyType,
            transaction_amount: totalAmount,
            currency_id: 'BRL',
        },
        back_url: `${baseUrl}/dashboard/cliente`,
        status: 'authorized',
    });

    if (!preapprovalRes.ok || !preapprovalRes.data?.id) {
        console.error('[subscription/card] MP recusou criação de preapproval:', {
            status: preapprovalRes.status,
            response: preapprovalRes.data,
        });
        const message = preapprovalRes.data?.cause?.[0]?.description
            || preapprovalRes.data?.message
            || preapprovalRes.data?.error
            || 'Não foi possível ativar a assinatura recorrente no cartão.';
        return NextResponse.json({ error: message }, { status: 400 });
    }

    const preapproval = preapprovalRes.data;
    const preapprovalId = String(preapproval.id);
    const preapprovalStatus = String(preapproval.status || 'pending');
    const nextPaymentDate = preapproval.next_payment_date ? new Date(preapproval.next_payment_date) : null;
    const cardId = preapproval.card_id ? String(preapproval.card_id) : undefined;
    const paymentMethodId = preapproval.payment_method_id || brand || undefined;

    if (
        previousPreapprovalId
        && previousPreapprovalId !== preapprovalId
        && user.subscription?.mpPreapprovalStatus !== 'cancelled'
    ) {
        try {
            await cancelPreviousPreapproval(previousPreapprovalId);
        } catch (err) {
            console.error('[subscription/card] Falha ao cancelar preapproval anterior:', err);
        }
    }

    const expiry = expirationMonth && expirationYear
        ? `${String(expirationMonth).padStart(2, '0')}/${expirationYear}`
        : undefined;

    await User.findByIdAndUpdate(user._id, {
        $set: {
            'subscription.planId': plan._id.toString(),
            'subscription.billingType': billingType,
            'subscription.activationMethod': 'card',
            'subscription.mpPreapprovalId': preapprovalId,
            'subscription.mpPreapprovalStatus': preapprovalStatus,
            ...(nextPaymentDate ? { 'subscription.nextPaymentDate': nextPaymentDate } : {}),
            ...(cardId || lastFour || paymentMethodId
                ? {
                    creditCard: {
                        holderName: holderName || user.creditCard?.holderName,
                        lastFour: lastFour || user.creditCard?.lastFour,
                        brand: paymentMethodId || user.creditCard?.brand,
                        expiry: expiry || user.creditCard?.expiry,
                        mpCardId: cardId || user.creditCard?.mpCardId,
                        cardType: 'credit',
                    },
                }
                : {}),
        },
    });

    const canActivateNow = preapprovalStatus === 'authorized' || !!cardId;
    if (canActivateNow) {
        const expiresAt = addBillingPeriod(new Date(), billingType);
        await activateSubscriptionAccess({
            userId: user._id,
            planId: plan._id.toString(),
            billingType,
            expiresAt,
            activationMethod: 'card',
            mpPreapprovalId: preapprovalId,
            mpPreapprovalStatus: preapprovalStatus,
            nextPaymentDate,
        });

        return NextResponse.json({
            ok: true,
            status: 'approved',
            preapprovalId,
        });
    }

    return NextResponse.json({
        ok: true,
        pending: true,
        status: preapprovalStatus,
        preapprovalId,
        redirectUrl: preapproval.init_point || null,
        message: 'Assinatura criada e aguardando autorização do Mercado Pago.',
    });
}
