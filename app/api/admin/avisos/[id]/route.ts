import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import Aviso from '@/models/Aviso';
import AvisoLeitura from '@/models/AvisoLeitura';
import { PERFIS_AVISOS, lerAvisoDoCorpo } from '@/lib/utils/avisos';

async function acesso(params: Promise<{ id: string }>) {
    const session = await getServerSession(authOptions);
    if (!session || !PERFIS_AVISOS.includes(session.user?.profile as string)) {
        return { erro: NextResponse.json({ error: 'Não autorizado' }, { status: 403 }) };
    }
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return { erro: NextResponse.json({ error: 'Aviso não encontrado' }, { status: 404 }) };
    await connectDB();
    return { id };
}

/** PUT /api/admin/avisos/:id: edita. Com { ativo } apenas, liga ou desliga. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const a = await acesso(params);
    if (a.erro) return a.erro;
    const body = await request.json().catch(() => ({}));
    if (Object.keys(body).length === 1 && typeof body.ativo === 'boolean') {
        await Aviso.updateOne({ _id: a.id }, { $set: { ativo: body.ativo } });
        return NextResponse.json({ ok: true });
    }
    const lido = lerAvisoDoCorpo(body);
    if ('erro' in lido) return NextResponse.json({ error: lido.erro }, { status: 400 });
    const r = await Aviso.updateOne({ _id: a.id }, { $set: lido.dados });
    if (!r.matchedCount) return NextResponse.json({ error: 'Aviso não encontrado' }, { status: 404 });
    return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const a = await acesso(params);
    if (a.erro) return a.erro;
    await Promise.all([Aviso.deleteOne({ _id: a.id }), AvisoLeitura.deleteMany({ avisoId: a.id })]);
    return NextResponse.json({ ok: true });
}
