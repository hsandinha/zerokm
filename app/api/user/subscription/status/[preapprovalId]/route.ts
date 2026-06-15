import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import Plan from '@/models/Plan';
import { getPreapproval } from '@/lib/mercadopago';
import {
    activateSubscriptionAccess,
    addBillingPeriod,
    normalizeBillingType,
    parseSubscriptionExternalReference,
} from '@/lib/services/mercadoPagoSubscriptionService';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ preapprovalId: string }> }) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.uid) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { preapprovalId } = await params;
    if (!preapprovalId) {
        return NextResponse.json({ error: 'Assinatura não informada.' }, { status: 400 });
    }

    await connectDB();

    const user = await User.findOne({
        firebaseUid: session.user.uid,
        'subscription.mpPreapprovalId': preapprovalId,
    });
    if (!user) {
        return NextResponse.json({ error: 'Assinatura não encontrada.' }, { status: 404 });
    }

    const preapprovalRes = await getPreapproval(preapprovalId);
    if (!preapprovalRes.ok) {
        return NextResponse.json({ error: 'Não foi possível consultar a assinatura.' }, { status: 502 });
    }

    const preapproval = preapprovalRes.data as any;
    const parsedRef = parseSubscriptionExternalReference(preapproval.external_reference);
    const planId = parsedRef?.planId || user.subscription?.planId;
    const billingType = normalizeBillingType(parsedRef?.billingType || user.subscription?.billingType);
    const preapprovalStatus = String(preapproval.status || 'pending');
    const nextPaymentDate = preapproval.next_payment_date ? new Date(preapproval.next_payment_date) : null;

    await User.findByIdAndUpdate(user._id, {
        $set: {
            'subscription.mpPreapprovalStatus': preapprovalStatus,
            ...(nextPaymentDate ? { 'subscription.nextPaymentDate': nextPaymentDate } : {}),
        },
    });

    const canActivate = preapprovalStatus === 'authorized' || !!preapproval.card_id;
    if (canActivate && planId) {
        const plan = await Plan.findById(planId);
        if (plan?.active && plan.type === 'monthly') {
            await activateSubscriptionAccess({
                userId: user._id,
                planId: String(planId),
                billingType,
                expiresAt: addBillingPeriod(new Date(), billingType),
                activationMethod: 'card',
                mpPreapprovalId: preapprovalId,
                mpPreapprovalStatus: preapprovalStatus,
                nextPaymentDate,
            });
            return NextResponse.json({ ok: true, status: 'approved', preapprovalId });
        }
    }

    if (preapprovalStatus === 'cancelled' || preapprovalStatus === 'canceled' || preapprovalStatus === 'paused') {
        return NextResponse.json({ ok: true, status: preapprovalStatus, preapprovalId });
    }

    return NextResponse.json({ ok: true, status: 'pending', preapprovalStatus, preapprovalId });
}
