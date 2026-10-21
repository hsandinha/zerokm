import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import ClienteLogo from '@/models/ClienteLogo';
import { validarLogo } from '@/lib/utils/logoImagem';

export const dynamic = 'force-dynamic';

/** Só funcionário coloca ou troca a logo do lojista. */
const EQUIPE = new Set(['admin', 'administrador', 'administrativo', 'gerente', 'operador', 'operator', 'vendedor', 'marketing']);

async function acesso(params: Promise<{ id: string }>) {
    const session = await getServerSession(authOptions);
    if (!session?.user || !EQUIPE.has(session.user.profile as string)) {
        return { erro: NextResponse.json({ error: 'Somente a equipe do CNV pode alterar a logo do cliente.' }, { status: 403 }) };
    }
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) {
        return { erro: NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 }) };
    }
    await connectDB();
    return { session, id };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const a = await acesso(params);
    if (a.erro) return a.erro;
    const registro = await ClienteLogo.findOne({ userId: a.id }).lean() as any;
    return NextResponse.json({
        logo: registro?.logo || null,
        atualizadoPor: registro?.atualizadoPor || null,
        atualizadoEm: registro?.updatedAt || null,
    });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const a = await acesso(params);
    if (a.erro) return a.erro;

    const body = await request.json().catch(() => ({}));
    const valida = validarLogo(body?.logo);
    if (!valida.ok) return NextResponse.json({ error: valida.erro }, { status: 400 });

    const existe = await User.exists({ _id: a.id });
    if (!existe) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });

    const registro = await ClienteLogo.findOneAndUpdate(
        { userId: a.id },
        { $set: { logo: valida.logo, atualizadoPor: a.session?.user?.email || undefined } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    return NextResponse.json({ logo: registro.logo, atualizadoPor: registro.atualizadoPor, atualizadoEm: registro.updatedAt });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const a = await acesso(params);
    if (a.erro) return a.erro;
    await ClienteLogo.deleteOne({ userId: a.id });
    return NextResponse.json({ logo: null });
}
