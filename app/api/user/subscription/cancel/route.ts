import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { updatePreapproval } from '@/lib/mercadopago';

const CANCELLED_STATUSES = new Set(['cancelled', 'canceled', 'paused']);

async function cancelPreapproval(preapprovalId: string) {
    const canceledRes = await updatePreapproval(preapprovalId, { status: 'canceled' });
    if (canceledRes.ok) return canceledRes;

    const cancelledRes = await updatePreapproval(preapprovalId, { status: 'cancelled' });
    if (cancelledRes.ok) return cancelledRes;

    return canceledRes;
}

export async function POST() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.uid) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    await connectDB();

    const user = await User.findOne({ firebaseUid: session.user.uid });
    if (!user) {
        return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });
    }

    const preapprovalId = user.subscription?.mpPreapprovalId;
    if (!preapprovalId || user.subscription?.activationMethod !== 'card') {
        return NextResponse.json({ error: 'Não há assinatura recorrente no cartão para cancelar.' }, { status: 400 });
    }

    const currentPreapprovalStatus = String(user.subscription?.mpPreapprovalStatus || '');
    if (CANCELLED_STATUSES.has(currentPreapprovalStatus)) {
        return NextResponse.json({
            ok: true,
            alreadyCancelled: true,
            expiresAt: user.subscription?.expiresAt ? new Date(user.subscription.expiresAt).toISOString() : null,
        });
    }

    const cancelRes = await cancelPreapproval(preapprovalId);
    if (!cancelRes.ok) {
        console.error('[subscription/cancel] Mercado Pago recusou cancelamento:', {
            preapprovalId,
            status: cancelRes.status,
            response: cancelRes.data,
        });
        const message = cancelRes.data?.cause?.[0]?.description
            || cancelRes.data?.message
            || cancelRes.data?.error
            || 'Não foi possível cancelar a assinatura no Mercado Pago.';
        return NextResponse.json({ error: message }, { status: 400 });
    }

    const now = new Date();
    const currentExpiry = user.subscription?.expiresAt ? new Date(user.subscription.expiresAt) : null;
    const shouldKeepAccess = currentExpiry && currentExpiry.getTime() > now.getTime();
    const mpStatus = String(cancelRes.data?.status || 'cancelled');

    await User.findByIdAndUpdate(user._id, {
        $set: {
            'subscription.mpPreapprovalStatus': mpStatus,
            'subscription.recurrenceCancelledAt': now,
            'subscription.status': shouldKeepAccess ? 'active' : 'inactive',
        },
    });

    return NextResponse.json({
        ok: true,
        status: mpStatus,
        accessUntil: currentExpiry ? currentExpiry.toISOString() : null,
        keepsAccessUntilExpiry: Boolean(shouldKeepAccess),
    });
}
