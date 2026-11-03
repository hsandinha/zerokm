import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import Concessionaria from '@/models/Concessionaria';

// Mesma regra da ativação manual do plano de repasse.
const PODE_ALTERAR = new Set(['administrador', 'admin']);

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH /api/admin/concessionarias/:id/vitrine  { ocultar: boolean }
 *
 * Tira (ou devolve) o estoque da loja da vitrine do cliente final. Não mexe em
 * `ativo`, nos preços nem nos repasses: ao reexibir, tudo volta como estava,
 * já com o que a loja atualizou nesse meio tempo.
 */
export async function PATCH(request: Request, { params }: Params) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !PODE_ALTERAR.has(session.user?.profile as string)) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
        }
        const { id } = await params;
        if (!mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ error: 'Concessionária não encontrada' }, { status: 404 });

        const body = await request.json().catch(() => ({}));
        if (typeof body?.ocultar !== 'boolean') return NextResponse.json({ error: 'Informe ocultar: true ou false' }, { status: 400 });

        await connectDB();
        const conc = await Concessionaria.findByIdAndUpdate(
            id,
            body.ocultar
                ? { $set: { ocultarVitrine: true, vitrineOcultaEm: new Date(), vitrineOcultaPor: session.user?.email || undefined } }
                : { $set: { ocultarVitrine: false }, $unset: { vitrineOcultaEm: 1, vitrineOcultaPor: 1 } },
            { returnDocument: 'after' },
        ).lean();
        if (!conc) return NextResponse.json({ error: 'Concessionária não encontrada' }, { status: 404 });

        return NextResponse.json({
            ocultarVitrine: Boolean(conc.ocultarVitrine),
            vitrineOcultaEm: conc.vitrineOcultaEm ? new Date(conc.vitrineOcultaEm).toISOString() : null,
            vitrineOcultaPor: conc.vitrineOcultaPor || null,
        });
    } catch (error: any) {
        console.error('[admin vitrine concessionária] PATCH', error);
        return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
    }
}
