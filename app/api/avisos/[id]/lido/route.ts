import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import AvisoLeitura from '@/models/AvisoLeitura';

/** POST /api/avisos/:id/lido: a pessoa fechou o aviso; não aparece mais para ela. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email?.toLowerCase().trim();
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'Aviso não encontrado' }, { status: 404 });
    await connectDB();
    await AvisoLeitura.updateOne(
        { avisoId: id, userEmail: email },
        { $setOnInsert: { avisoId: id, userEmail: email } },
        { upsert: true },
    );
    return NextResponse.json({ ok: true });
}
