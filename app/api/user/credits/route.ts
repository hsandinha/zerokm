import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/authOptions';
import connectDB from '../../../../lib/mongodb';
import User from '../../../../models/User';

// GET — retorna saldo atual de créditos
export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.uid) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    await connectDB();
    const user = await User.findOne({ firebaseUid: session.user.uid }).select('credits');
    if (!user) {
        return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    return NextResponse.json({ credits: user.credits ?? 0 });
}

// POST — deduz 1 crédito para ver localização
export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.uid) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    if (body.action !== 'use') {
        return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
    }

    await connectDB();

    // Atomically deduct 1 credit — only if credits > 0
    const updated = await User.findOneAndUpdate(
        { firebaseUid: session.user.uid, credits: { $gt: 0 } },
        { $inc: { credits: -1 } },
        { returnDocument: 'after', select: 'credits' }
    );

    if (!updated) {
        return NextResponse.json({ error: 'Créditos insuficientes', credits: 0 }, { status: 402 });
    }

    return NextResponse.json({ ok: true, credits: updated.credits });
}
