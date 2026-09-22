import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import { aplicarPlanoRepasse, desativarPlanoRepasse } from '@/lib/services/planoRepasseService';
import { serializePlanoRepasse } from '@/lib/utils/planoRepasse';

// Mesma regra da ativação manual de assinatura do lojista no CRM.
const PODE_ATIVAR = new Set(['administrador', 'admin']);

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH /api/admin/concessionarias/:id/plano-repasse
 *   { acao: 'ativar', planId, billingType: 'monthly'|'annual', metodo: 'manual'|'cortesia' }
 *   { acao: 'desativar' }
 *
 * Ativação manual: pagamento recebido fora do sistema, ou cortesia. Renovar
 * soma ao período atual se ainda estiver em dia.
 */
export async function PATCH(request: Request, { params }: Params) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !PODE_ATIVAR.has(session.user?.profile as string)) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
        }
        const { id } = await params;
        if (!mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ error: 'Concessionária não encontrada' }, { status: 404 });

        await connectDB();
        const body = await request.json().catch(() => ({}));
        const por = session.user?.email || undefined;

        if (body?.acao === 'desativar') {
            const conc = await desativarPlanoRepasse(id, por);
            if (!conc) return NextResponse.json({ error: 'Concessionária não encontrada' }, { status: 404 });
            return NextResponse.json({ plano: serializePlanoRepasse((conc as any).planoRepasse) });
        }

        if (body?.acao !== 'ativar') return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
        if (!body.planId || !mongoose.Types.ObjectId.isValid(body.planId)) {
            return NextResponse.json({ error: 'Escolha um plano de concessionária.' }, { status: 400 });
        }

        const result = await aplicarPlanoRepasse({
            concessionariaId: id,
            planId: body.planId,
            billingType: body.billingType === 'annual' ? 'annual' : 'monthly',
            metodo: body.metodo === 'cortesia' ? 'cortesia' : 'manual',
            por,
        });
        if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
        return NextResponse.json({ plano: serializePlanoRepasse(result.concessionaria.planoRepasse) });
    } catch (error: any) {
        console.error('[admin plano-repasse] PATCH', error);
        return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
    }
}
