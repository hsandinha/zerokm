import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import Banner from '@/models/Banner';
import Concessionaria from '@/models/Concessionaria';
import Plan from '@/models/Plan';
import User from '@/models/User';
import { enviarBoletoPorEmail } from '@/lib/services/boletoEmailService';
import { emitirBoletoConcessionaria, serializarCobrancaConcessionaria } from '@/lib/services/cobrancaConcessionariaService';
import { buildDealerPlanReference } from '@/lib/services/planoRepasseService';
import {
    BANNER_PREFIX,
    buildDealerCobReference,
    descricaoDaCobranca,
    lerValorCobranca,
    lerVencimentoBoleto,
    pagadorDaConcessionaria,
    PERFIS_EMITEM_BOLETO_CONCESSIONARIA,
    TIPOS_COBRANCA_CONCESSIONARIA,
    type TipoCobrancaConcessionaria,
} from '@/lib/utils/cobrancaConcessionaria';
import { isPlanoConcessionaria, precoPlano, serializePlanoRepasse } from '@/lib/utils/planoRepasse';

export const dynamic = 'force-dynamic';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function autorizado() {
    const session = await getServerSession(authOptions);
    if (!session || !PERFIS_EMITEM_BOLETO_CONCESSIONARIA.has(session.user?.profile as string)) return null;
    return session;
}

/** Banners da loja parados em "aguardando pagamento": o boleto pode liberar um deles. */
async function bannersAguardando(concessionariaId: string) {
    const usuarios = await User.find({ dealershipId: concessionariaId }).select('firebaseUid').lean() as any[];
    const uids = usuarios.map(u => u.firebaseUid).filter(Boolean);
    if (uids.length === 0) return [];
    return Banner.find({ dealershipId: { $in: uids }, status: 'awaiting_payment' })
        .select('title createdAt').sort({ createdAt: -1 }).limit(20).lean() as Promise<any[]>;
}

/**
 * GET /api/admin/cobrancas/concessionaria
 *   sem parâmetros: concessionárias para escolher no modal;
 *   ?concessionariaId=: o que falta no cadastro para o boleto, planos de
 *   repasse à venda e banners aguardando pagamento.
 */
export async function GET(request: Request) {
    try {
        if (!(await autorizado())) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
        await connectDB();

        const id = new URL(request.url).searchParams.get('concessionariaId')?.trim() || '';
        if (!id) {
            const lojas = await Concessionaria.find({}).select('nome razaoSocial cnpj ativo').sort({ nome: 1 }).lean() as any[];
            return NextResponse.json({
                concessionarias: lojas.map(l => ({ id: l._id.toString(), nome: l.nome || l.razaoSocial || 'Sem nome', cnpj: l.cnpj || '', ativo: l.ativo !== false })),
            });
        }
        if (!mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ error: 'Concessionária não encontrada' }, { status: 404 });
        const loja = await Concessionaria.findById(id).lean() as any;
        if (!loja) return NextResponse.json({ error: 'Concessionária não encontrada' }, { status: 404 });

        const [planos, banners] = await Promise.all([
            Plan.find({ publico: 'concessionaria', active: true }).sort({ price: 1 }).lean() as Promise<any[]>,
            bannersAguardando(id),
        ]);
        const { pagador, faltando } = pagadorDaConcessionaria(loja);

        return NextResponse.json({
            concessionaria: { id, nome: loja.nome || loja.razaoSocial || '', razaoSocial: loja.razaoSocial || '', email: pagador?.email || '' },
            faltando,
            plano: serializePlanoRepasse(loja.planoRepasse),
            planos: planos.map(p => ({
                id: p._id.toString(),
                name: p.name,
                price: p.price,
                annualPrice: typeof p.annualPrice === 'number' && p.annualPrice > 0 ? p.annualPrice : null,
            })),
            banners: banners.map(b => ({ id: b._id.toString(), title: b.title })),
        });
    } catch (error: any) {
        console.error('[cobrancas/concessionaria] GET', error);
        return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
    }
}

/**
 * POST /api/admin/cobrancas/concessionaria
 *
 * A equipe emite um boleto para a concessionária.
 *  - concessionariaId
 *  - tipo: plano | banner | avulsa
 *  - plano: planId + billingType (valor padrão é o do plano; `valor` permite outro)
 *  - banner: bannerId opcional (anúncio aguardando pagamento que o boleto libera)
 *  - avulsa: descricao obrigatória
 *  - valor (reais), vencimento (AAAA-MM-DD)
 *  - enviarEmail (padrão true) e email (padrão o do cadastro da loja)
 */
export async function POST(request: Request) {
    try {
        const session = await autorizado();
        if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
        const body = await request.json().catch(() => ({}));

        const tipo = TIPOS_COBRANCA_CONCESSIONARIA.includes(body?.tipo) ? body.tipo as TipoCobrancaConcessionaria : null;
        if (!tipo) return NextResponse.json({ error: 'Escolha o que está sendo cobrado.' }, { status: 400 });
        if (!body?.concessionariaId || !mongoose.Types.ObjectId.isValid(body.concessionariaId)) {
            return NextResponse.json({ error: 'Escolha a concessionária.' }, { status: 400 });
        }
        const venc = lerVencimentoBoleto(body?.vencimento);
        if ('erro' in venc) return NextResponse.json({ error: venc.erro }, { status: 400 });

        await connectDB();
        const loja = await Concessionaria.findById(body.concessionariaId).lean() as any;
        if (!loja) return NextResponse.json({ error: 'Concessionária não encontrada' }, { status: 404 });
        const concessionariaId = loja._id.toString();

        // Confere o cadastro antes de qualquer outra coisa: é o erro mais comum
        // e a tela mostra a lista do que falta.
        const { pagador, faltando } = pagadorDaConcessionaria(loja);
        if (!pagador) {
            return NextResponse.json({ error: 'O cadastro da concessionária está incompleto para emitir boleto.', faltando }, { status: 422 });
        }

        const emailDestino = String(body?.email || '').trim() || pagador.email;
        const enviarEmail = body?.enviarEmail !== false;
        if (enviarEmail && !EMAIL.test(emailDestino)) {
            return NextResponse.json({ error: 'Informe um e-mail válido para enviar o boleto.' }, { status: 400 });
        }

        let plan: any = null;
        let billingType: 'monthly' | 'annual' | undefined;
        let bannerId: string | undefined;

        if (tipo === 'plano') {
            plan = body?.planId && mongoose.Types.ObjectId.isValid(body.planId) ? await Plan.findById(body.planId).lean() : null;
            if (!plan || !plan.active || !isPlanoConcessionaria(plan)) {
                return NextResponse.json({ error: 'Escolha um plano de repasse ativo.' }, { status: 400 });
            }
            billingType = body?.billingType === 'annual' ? 'annual' : 'monthly';
            if (billingType === 'annual' && !(typeof plan.annualPrice === 'number' && plan.annualPrice > 0)) {
                return NextResponse.json({ error: 'Este plano não tem opção anual.' }, { status: 400 });
            }
        }
        if (tipo === 'banner' && body?.bannerId) {
            const daLoja = await bannersAguardando(concessionariaId);
            const banner = daLoja.find(b => b._id.toString() === String(body.bannerId));
            if (!banner) return NextResponse.json({ error: 'Este banner não está aguardando pagamento desta concessionária.' }, { status: 400 });
            bannerId = banner._id.toString();
        }
        const descricao = descricaoDaCobranca({ tipo, descricao: body?.descricao, planName: plan?.name, billingType });
        if (tipo === 'avulsa' && descricao.length < 3) {
            return NextResponse.json({ error: 'Descreva o que está sendo cobrado.' }, { status: 400 });
        }

        const semValor = body?.valor === undefined || body?.valor === null || String(body.valor).trim() === '';
        const valorLido = tipo === 'plano' && semValor ? lerValorCobranca(precoPlano(plan, billingType!)) : lerValorCobranca(body?.valor);
        if ('erro' in valorLido) return NextResponse.json({ error: valorLido.erro }, { status: 400 });

        // Payment exige um usuário: o da loja, para o boleto aparecer no extrato
        // dela. Loja ainda sem acesso fica no nome de quem emitiu.
        // O titular, nunca um atendente: a cobrança aparece no extrato de quem fica com ela.
        const daLoja = await User.findOne({ dealershipId: concessionariaId, papelLoja: { $ne: 'atendente' } })
            .sort({ createdAt: 1 }).select('_id').lean() as any;
        const emissor = daLoja ? null : await User.findOne({ email: session.user?.email }).select('_id').lean() as any;
        const userId = daLoja?._id || emissor?._id;
        if (!userId) return NextResponse.json({ error: 'Esta concessionária ainda não tem usuário de acesso. Cadastre um em Usuários da loja.' }, { status: 409 });

        const externalReference = tipo === 'plano'
            ? buildDealerPlanReference(concessionariaId, plan._id.toString(), billingType!, String(userId))
            : bannerId
                ? `${BANNER_PREFIX}${bannerId}`
                : buildDealerCobReference(concessionariaId, tipo);

        const r = await emitirBoletoConcessionaria({
            concessionaria: loja,
            userId,
            tipo,
            valor: valorLido.valor,
            vencimento: venc.vencimento,
            descricao,
            externalReference,
            emitidoPor: session.user?.email || 'equipe',
            planId: plan?._id?.toString(),
            billingType,
            bannerId,
        });
        if (!r.ok) return NextResponse.json({ error: r.error, faltando: r.faltando }, { status: r.status });

        if (bannerId) await Banner.updateOne({ _id: bannerId }, { $set: { paymentId: String(r.payment.mpPaymentId) } });

        let email: { enviado: boolean; para: string; erro: string | null } = { enviado: false, para: emailDestino, erro: null };
        if (enviarEmail) {
            const envio = await enviarBoletoPorEmail({
                payment: r.payment,
                para: emailDestino,
                nomeCliente: pagador.razaoSocial,
                nomePlano: descricao,
                descricao,
                vencimento: venc.vencimento,
            }).catch(error => ({ ok: false, error: String(error?.message || error) }));
            email = { enviado: envio.ok, para: emailDestino, erro: envio.ok ? null : envio.error || 'Falha ao enviar o e-mail' };
        }

        console.log('[cobrancas/concessionaria] Boleto emitido', { concessionariaId, tipo, valor: valorLido.valor, por: session.user?.email, mpPaymentId: r.payment.mpPaymentId });
        return NextResponse.json({ ok: true, cobranca: serializarCobrancaConcessionaria(r.payment), email });
    } catch (error: any) {
        console.error('[cobrancas/concessionaria] POST', error);
        return NextResponse.json({ error: error.message || 'Erro ao emitir o boleto' }, { status: 500 });
    }
}
