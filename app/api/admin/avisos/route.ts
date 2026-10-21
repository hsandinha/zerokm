import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import Aviso from '@/models/Aviso';
import AvisoLeitura from '@/models/AvisoLeitura';
import { PERFIS_AVISOS, lerAvisoDoCorpo } from '@/lib/utils/avisos';

export const dynamic = 'force-dynamic';

async function acesso() {
    const session = await getServerSession(authOptions);
    if (!session || !PERFIS_AVISOS.includes(session.user?.profile as string)) return null;
    return session;
}

/** GET /api/admin/avisos: lista com quantas pessoas já leram cada aviso. */
export async function GET() {
    if (!(await acesso())) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
    await connectDB();
    const avisos = await Aviso.find({}).sort({ createdAt: -1 }).limit(100).lean();
    const leituras = await AvisoLeitura.aggregate([
        { $match: { avisoId: { $in: avisos.map(a => a._id) } } },
        { $group: { _id: '$avisoId', total: { $sum: 1 } } },
    ]);
    const lidos = new Map(leituras.map(l => [String(l._id), l.total]));
    return NextResponse.json(avisos.map(a => ({
        id: String(a._id),
        titulo: a.titulo,
        mensagem: a.mensagem,
        publico: a.publico,
        linkUrl: a.linkUrl || '',
        linkTexto: a.linkTexto || '',
        ativo: a.ativo,
        inicio: a.inicio || null,
        fim: a.fim || null,
        criadoPor: a.criadoPor || null,
        criadoEm: a.createdAt,
        leituras: lidos.get(String(a._id)) || 0,
    })));
}

/** POST /api/admin/avisos: cria um aviso. */
export async function POST(request: Request) {
    const session = await acesso();
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    const lido = lerAvisoDoCorpo(body);
    if ('erro' in lido) return NextResponse.json({ error: lido.erro }, { status: 400 });
    await connectDB();
    const aviso = await Aviso.create({ ...lido.dados, criadoPor: session.user?.email || undefined });
    return NextResponse.json({ id: String(aviso._id) }, { status: 201 });
}
