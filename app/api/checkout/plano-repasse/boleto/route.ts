import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import Payment from '@/models/Payment';
import Plan from '@/models/Plan';
import User from '@/models/User';
import { DEALERSHIP_PROFILES, resolveDealershipScope } from '@/lib/services/dealershipScope';
import { emitirBoletoConcessionaria, serializarCobrancaConcessionaria } from '@/lib/services/cobrancaConcessionariaService';
import { buildDealerPlanReference } from '@/lib/services/planoRepasseService';
import { descricaoDaCobranca, lerValorCobranca, lerVencimentoBoleto, pagadorDaConcessionaria } from '@/lib/utils/cobrancaConcessionaria';
import { isPlanoConcessionaria, precoPlano } from '@/lib/utils/planoRepasse';
import { barrarAtendente } from '@/lib/services/acessoLoja';

/**
 * POST /api/checkout/plano-repasse/boleto  { planId, billingType }
 *
 * A concessionária paga o plano de repasse por boleto. Como no PIX, esta rota
 * só gera a cobrança: a ativação acontece no webhook, quando o boleto compensa.
 * O pagador é a loja (CNPJ e endereço do cadastro). Se faltar dado, devolve
 * `faltando` para a tela dizer o que completar.
 */
export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        if (!DEALERSHIP_PROFILES.has(session.user?.profile as string)) {
            return NextResponse.json({ error: 'Somente a concessionária contrata o plano de repasse.' }, { status: 403 });
        }

        await connectDB();
        // Contratar e pagar plano é do titular; o atendente só opera.
        const recusa = await barrarAtendente(session, 'cobranca');
        if (recusa) return recusa;
        const scope = await resolveDealershipScope(session, request);
        const concessionaria = scope.concessionaria;
        if (!concessionaria) return NextResponse.json({ error: 'Concessionária não encontrada' }, { status: 404 });

        const body = await request.json().catch(() => ({}));
        const billingType: 'monthly' | 'annual' = body?.billingType === 'annual' ? 'annual' : 'monthly';
        const plan = body?.planId ? await Plan.findById(body.planId).lean().catch(() => null) as any : null;
        if (!plan || !plan.active || !isPlanoConcessionaria(plan)) {
            return NextResponse.json({ error: 'Plano de repasse indisponível.' }, { status: 400 });
        }
        if (billingType === 'annual' && !(typeof plan.annualPrice === 'number' && plan.annualPrice > 0)) {
            return NextResponse.json({ error: 'Este plano não tem opção anual.' }, { status: 400 });
        }

        const { pagador, faltando } = pagadorDaConcessionaria(concessionaria);
        if (!pagador) {
            return NextResponse.json({
                error: 'Para pagar por boleto, o cadastro da concessionária precisa estar completo.',
                faltando,
                code: 'CADASTRO_INCOMPLETO',
            }, { status: 422 });
        }

        const user = await User.findOne({ email: session.user.email }).select('_id');
        if (!user) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

        const valor = lerValorCobranca(precoPlano(plan, billingType));
        if ('erro' in valor) return NextResponse.json({ error: valor.erro }, { status: 400 });

        // Boleto igual ainda em aberto: devolve o mesmo em vez de emitir outro.
        // Dois boletos do mesmo plano é como a loja acaba pagando duas vezes.
        const emAberto = await Payment.findOne({
            concessionariaId: concessionaria._id,
            tipoCobranca: 'plano',
            planId: plan._id,
            billingType,
            amount: valor.valor,
            status: 'pending',
            boletoUrl: { $exists: true, $ne: null },
            vencimento: { $gt: new Date() },
        }).sort({ createdAt: -1 }).lean();
        if (emAberto) {
            return NextResponse.json({ ok: true, reaproveitado: true, cobranca: serializarCobrancaConcessionaria(emAberto) });
        }

        const venc = lerVencimentoBoleto('');
        if ('erro' in venc) return NextResponse.json({ error: venc.erro }, { status: 400 });

        const clientIp = (request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '').split(',')[0].trim();
        const r = await emitirBoletoConcessionaria({
            concessionaria,
            userId: user._id,
            tipo: 'plano',
            valor: valor.valor,
            vencimento: venc.vencimento,
            descricao: descricaoDaCobranca({ tipo: 'plano', planName: plan.name, billingType }),
            externalReference: buildDealerPlanReference(concessionaria._id.toString(), plan._id.toString(), billingType, user._id.toString()),
            emitidoPor: 'concessionaria',
            planId: plan._id.toString(),
            billingType,
            clientIp,
        });
        if (!r.ok) return NextResponse.json({ error: r.error, faltando: r.faltando }, { status: r.status });

        return NextResponse.json({ ok: true, cobranca: serializarCobrancaConcessionaria(r.payment) });
    } catch (error: any) {
        console.error('[plano-repasse] POST boleto', error);
        return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
    }
}
