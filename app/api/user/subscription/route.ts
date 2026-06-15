import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import Plan from '@/models/Plan';

const CANCELLED_STATUSES = new Set(['cancelled', 'canceled', 'paused']);

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.uid) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    await connectDB();

    const user = await User.findOne({ firebaseUid: session.user.uid }).lean();
    if (!user) {
        return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });
    }

    const subscription = user.subscription || {};
    const plan = subscription.planId ? await Plan.findById(subscription.planId).lean() : null;
    const mpPreapprovalStatus = String(subscription.mpPreapprovalStatus || '');
    const hasActiveRecurrence = Boolean(
        subscription.activationMethod === 'card'
        && subscription.mpPreapprovalId
        && !CANCELLED_STATUSES.has(mpPreapprovalStatus)
    );

    return NextResponse.json({
        ok: true,
        subscription: {
            planId: subscription.planId || null,
            planName: (plan as any)?.name || null,
            status: subscription.status || null,
            billingType: subscription.billingType || null,
            activationMethod: subscription.activationMethod || null,
            expiresAt: subscription.expiresAt ? new Date(subscription.expiresAt).toISOString() : null,
            nextPaymentDate: subscription.nextPaymentDate ? new Date(subscription.nextPaymentDate).toISOString() : null,
            mpPreapprovalStatus: subscription.mpPreapprovalStatus || null,
            recurrenceCancelledAt: subscription.recurrenceCancelledAt ? new Date(subscription.recurrenceCancelledAt).toISOString() : null,
            canCancel: hasActiveRecurrence,
        },
    });
}
