import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import Aviso from '@/models/Aviso';
import AvisoLeitura from '@/models/AvisoLeitura';
import { publicosDoPerfil } from '@/lib/utils/avisos';

export const dynamic = 'force-dynamic';

/** GET /api/avisos: avisos do público de quem está logado que ele ainda não fechou. */
export async function GET() {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email?.toLowerCase().trim();
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const publicos = publicosDoPerfil(session?.user?.profile);
    if (publicos.length === 0) return NextResponse.json({ avisos: [] });

    try {
        await connectDB();
        const agora = new Date();
        const avisos = await Aviso.find({
            ativo: true,
            publico: { $in: publicos },
            $and: [
                { $or: [{ inicio: null }, { inicio: { $lte: agora } }] },
                { $or: [{ fim: null }, { fim: { $gte: agora } }] },
            ],
        }).sort({ createdAt: -1 }).limit(10).lean();

        const lidos = new Set((await AvisoLeitura.find({ userEmail: email, avisoId: { $in: avisos.map(a => a._id) } }).select('avisoId').lean())
            .map(l => String(l.avisoId)));

        return NextResponse.json({
            avisos: avisos.filter(a => !lidos.has(String(a._id))).map(a => ({
                id: String(a._id),
                titulo: a.titulo,
                mensagem: a.mensagem,
                linkUrl: a.linkUrl || null,
                linkTexto: a.linkTexto || null,
                criadoEm: a.createdAt,
            })),
        });
    } catch (error: any) {
        console.error('[avisos] GET', error);
        return NextResponse.json({ avisos: [] });
    }
}
