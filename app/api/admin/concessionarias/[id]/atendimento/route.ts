import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import Plan from '@/models/Plan';
import { WaStore } from '@wa/models/store';
import { storeAccess, storeOfConcessionaria } from '@wa/lib/store';
import { aplicarAssinaturaAtendimento, desativarAssinaturaAtendimento } from '@wa/lib/assinatura-atendimento';
import { recursosDaConta } from '@/lib/services/recursosConta';

export const dynamic = 'force-dynamic';

// Mesma regra da ativação manual do plano de repasse e de /api/wa/lojas/:id.
const PODE_ATIVAR = new Set(['administrador', 'admin']);

type Params = { params: Promise<{ id: string }> };

async function autorizado() {
    const session = await getServerSession(authOptions);
    return session && PODE_ATIVAR.has(session.user?.profile as string) ? session : null;
}

/**
 * Assinatura do atendimento por WhatsApp de uma concessionária, pela ficha.
 * A regra é a de /api/wa/lojas/:id (wa/lib/assinatura-atendimento.ts); a
 * diferença é chegar pela concessionária, e não pelo id da loja do
 * atendimento, que a ficha não conhece.
 *
 * GET   situação e planos de atendimento à venda.
 * PATCH { acao: 'ativar', planId, billingType, metodo: 'manual'|'cortesia' } | { acao: 'desativar' }
 */
export async function GET(_request: Request, { params }: Params) {
    try {
        if (!(await autorizado())) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
        const { id } = await params;
        if (!mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ error: 'Concessionária não encontrada' }, { status: 404 });
        await connectDB();

        const [recursos, store, planos] = await Promise.all([
            recursosDaConta({ tipo: 'concessionaria', id }),
            WaStore.findOne({ concessionariaId: id }).select('subscription trialEndsAt'),
            Plan.find({ publico: 'atendimento', active: true }).sort({ price: 1 }).lean(),
        ]);
        return NextResponse.json({
            liberado: recursos.atendimento,
            iniciado: Boolean(store),
            access: store ? storeAccess(store) : null,
            planos: (planos as any[]).map(p => ({
                id: String(p._id),
                name: p.name,
                price: p.price,
                annualPrice: typeof p.annualPrice === 'number' && p.annualPrice > 0 ? p.annualPrice : null,
            })),
        });
    } catch (error) {
        console.error('[ficha atendimento] GET', error);
        return NextResponse.json({ error: 'Não foi possível carregar a assinatura do atendimento.' }, { status: 500 });
    }
}

export async function PATCH(request: Request, { params }: Params) {
    try {
        const session = await autorizado();
        if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
        const { id } = await params;
        if (!mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ error: 'Concessionária não encontrada' }, { status: 404 });
        await connectDB();

        const body = await request.json().catch(() => ({}));
        const por = session.user?.email || undefined;

        if (body?.acao === 'desativar') {
            const store = await WaStore.findOne({ concessionariaId: id }).select('_id').lean();
            if (!store) return NextResponse.json({ error: 'Esta loja ainda não começou a usar o atendimento.' }, { status: 404 });
            await desativarAssinaturaAtendimento(String(store._id), por || '');
            return NextResponse.json({ ok: true });
        }

        if (body?.acao !== 'ativar') return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
        if (!body.planId || !mongoose.Types.ObjectId.isValid(body.planId)) {
            return NextResponse.json({ error: 'Escolha um plano de atendimento.' }, { status: 400 });
        }
        // Só cria a loja do atendimento se a funcionalidade estiver liberada
        // para a conta (lib/recursos.ts): assinar sem liberar não faria nada.
        const store = await storeOfConcessionaria(id);
        if (!store) {
            return NextResponse.json({ error: 'Libere o Atendimento na aba Funcionalidades antes de ativar a assinatura.' }, { status: 409 });
        }
        const result = await aplicarAssinaturaAtendimento({
            storeId: String(store._id),
            planId: body.planId,
            billingType: body.billingType === 'annual' ? 'annual' : 'monthly',
            metodo: body.metodo === 'cortesia' ? 'cortesia' : 'manual',
            por,
        });
        if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('[ficha atendimento] PATCH', error);
        return NextResponse.json({ error: 'Não foi possível atualizar a assinatura do atendimento.' }, { status: 500 });
    }
}
