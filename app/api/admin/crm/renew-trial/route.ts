import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { createRenewedFreeTrialWindow } from '@/lib/utils/freeTrial';

export async function POST(request: Request) {
    const session = await getServerSession(authOptions);
    const profile = (session?.user as any)?.profile;
    if (!profile || !['administrador', 'admin'].includes(profile)) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
    }

    let body: any;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Body inválido.' }, { status: 400 });
    }

    const { userId } = body;
    if (!userId) {
        return NextResponse.json({ error: 'userId é obrigatório.' }, { status: 400 });
    }

    try {
        await connectDB();

        const user = await User.findById(userId).lean() as any;
        if (!user) {
            return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });
        }

        const profiles: string[] = user.allowedProfiles ?? [];
        const isFreeClient = profiles.includes('gratis') && !profiles.includes('cliente');
        if (!isFreeClient) {
            return NextResponse.json({ error: 'Este usuário não é um cliente grátis.' }, { status: 400 });
        }

        const trial = createRenewedFreeTrialWindow();
        await User.findByIdAndUpdate(userId, { $set: trial });

        return NextResponse.json({
            ok: true,
            freeTrialExpiresAt: trial.freeTrialExpiresAt.toISOString(),
        });
    } catch (err: any) {
        console.error('POST /api/admin/crm/renew-trial error:', err);
        return NextResponse.json({ error: err?.message || 'Erro interno.' }, { status: 500 });
    }
}
