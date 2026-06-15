import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { createExpiredFreeTrialWindow, isFreeTrialExpired } from '@/lib/utils/freeTrial';

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.uid) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    await connectDB();

    const user = await User.findOne({ firebaseUid: session.user.uid });
    if (!user) {
        return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    const profiles = user.allowedProfiles || [];
    const isFreeClient = profiles.includes('gratis') && !profiles.includes('cliente');
    if (!isFreeClient) {
        return NextResponse.json({
            isFreeClient: false,
            freeTrialExpiresAt: null,
            freeTrialExpired: false,
        });
    }

    let freeTrialExpiresAt = user.freeTrialExpiresAt ? new Date(user.freeTrialExpiresAt) : null;

    if (!freeTrialExpiresAt) {
        const freeTrial = createExpiredFreeTrialWindow();
        freeTrialExpiresAt = freeTrial.freeTrialExpiresAt;
        await User.findByIdAndUpdate(user._id, { $set: freeTrial });
    }

    return NextResponse.json({
        isFreeClient: true,
        freeTrialExpiresAt: freeTrialExpiresAt.toISOString(),
        freeTrialExpired: isFreeTrialExpired(freeTrialExpiresAt),
    });
}
