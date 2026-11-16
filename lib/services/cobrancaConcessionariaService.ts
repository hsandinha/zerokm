import Banner from '@/models/Banner';
import Payment from '@/models/Payment';
import { mpPost, mpPut } from '@/lib/mercadopago';
import { getPublicBaseUrl } from '@/lib/services/mercadoPagoSubscriptionService';
import {
    aplicarPlanoRepasse,
    parseDealerPlanReference,
    registrarTransacaoPlanoRepasse,
} from '@/lib/services/planoRepasseService';
import type { PlanoRepasseMetodo } from '@/lib/utils/planoRepasse';
import {
    mensagemCadastroIncompleto,
    pagadorDaConcessionaria,
    parseBannerReference,
    parseDealerCobReference,
    ROTULO_TIPO_COBRANCA,
    type CadastroConcessionaria,
    type TipoCobrancaConcessionaria,
} from '@/lib/utils/cobrancaConcessionaria';

/**
 * Boleto para a concessionária, em um lugar só.
 *
 * A emissão pela equipe (tela de Cobranças e ficha da loja), o boleto do plano
 * de repasse e o do banner passam por aqui: mesmo pagador (o cadastro da loja),
 * mesmo registro em Payment e a mesma liberação quando o dinheiro entra, seja
 * pelo webhook do Mercado Pago, pela sincronização da tela ou pela baixa manual.
 */

type Emissao = {
    concessionaria: CadastroConcessionaria & { _id: unknown };
    /** Usuário dono do registro (Payment exige um): alguém da loja ou, na falta, quem emitiu. */
    userId: unknown;
    tipo: TipoCobrancaConcessionaria;
    valor: number;
    vencimento: Date;
    descricao: string;
    externalReference: string;
    emitidoPor: string;
    planId?: string;
    billingType?: 'monthly' | 'annual';
    bannerId?: string;
    clientIp?: string;
};

export type ResultadoEmissao =
    | { ok: true; payment: any }
    | { ok: false; status: number; error: string; faltando?: string[] };

function separarNome(nome: string) {
    const partes = nome.trim().split(/\s+/).filter(Boolean);
    return { primeiro: partes[0] || '', resto: partes.slice(1).join(' ') };
}

export async function emitirBoletoConcessionaria(params: Emissao): Promise<ResultadoEmissao> {
    const { pagador, faltando } = pagadorDaConcessionaria(params.concessionaria);
    if (!pagador) return { ok: false, status: 422, error: mensagemCadastroIncompleto(faltando), faltando };

    const concessionariaId = String(params.concessionaria._id);
    const { primeiro, resto } = separarNome(pagador.razaoSocial);
    const telefone = pagador.telefone.length >= 10
        ? { area_code: pagador.telefone.slice(0, 2), number: pagador.telefone.slice(2) }
        : undefined;
    const endereco = {
        zip_code: pagador.cep,
        street_name: pagador.rua,
        street_number: pagador.numero,
        neighborhood: pagador.bairro,
        city: pagador.cidade,
        federal_unit: pagador.uf,
    };

    const payRes = await mpPost('/v1/payments', {
        transaction_amount: params.valor,
        description: `${params.descricao} - Boleto`,
        payment_method_id: 'bolbradesco',
        date_of_expiration: params.vencimento.toISOString(),
        payer: {
            email: pagador.email,
            first_name: primeiro,
            ...(resto ? { last_name: resto } : {}),
            identification: { type: 'CNPJ', number: pagador.cnpj },
            address: endereco,
            ...(telefone ? { phone: telefone } : {}),
        },
        external_reference: params.externalReference,
        notification_url: `${getPublicBaseUrl()}/api/webhooks/mercadopago`,
        statement_descriptor: 'CNV',
        additional_info: {
            items: [{
                id: `${params.tipo}-${concessionariaId}`,
                title: params.descricao,
                description: params.descricao,
                quantity: 1,
                unit_price: params.valor,
                category_id: 'services',
            }],
        },
        metadata: {
            type: 'dealer-boleto',
            tipo_cobranca: params.tipo,
            concessionaria_id: concessionariaId,
            ...(params.planId ? { dealer_plan_id: params.planId } : {}),
            ...(params.bannerId ? { banner_id: params.bannerId } : {}),
        },
    }, undefined, params.clientIp ? { 'X-Forwarded-For': params.clientIp } : {});

    if (!payRes.ok || !payRes.data?.id) {
        console.error('[cobranca-concessionaria] Erro ao gerar boleto:', JSON.stringify(payRes.data));
        return { ok: false, status: 502, error: payRes.data?.message || 'O Mercado Pago não gerou o boleto. Tente de novo em instantes.' };
    }

    const mpPaymentId = String(payRes.data.id);
    try {
        // Upsert, e não create: o aviso "pagamento criado" do Mercado Pago pode
        // chegar ao webhook antes desta gravação e já ter aberto o registro.
        const payment = await Payment.findOneAndUpdate(
            { mpPaymentId },
            {
                $set: {
                    userId: params.userId,
                    concessionariaId: params.concessionaria._id,
                    ...(params.planId ? { planId: params.planId } : {}),
                    ...(params.billingType ? { billingType: params.billingType } : {}),
                    ...(params.bannerId ? { bannerId: params.bannerId } : {}),
                    mpPaymentId,
                    externalReference: params.externalReference,
                    method: 'bolbradesco',
                    methodDetail: 'bolbradesco',
                    statusDetail: payRes.data.status_detail,
                    amount: params.valor,
                    currency: 'BRL',
                    tipoCobranca: params.tipo,
                    descricao: params.descricao,
                    vencimento: params.vencimento,
                    emitidoPor: params.emitidoPor,
                    payerEmail: pagador.email,
                    payerName: pagador.razaoSocial,
                    boletoUrl: payRes.data.transaction_details?.external_resource_url || undefined,
                    boletoBarcode: payRes.data.barcode?.content || undefined,
                    mpDateCreated: payRes.data.date_created ? new Date(payRes.data.date_created) : new Date(),
                },
                // Se o webhook já gravou um status mais novo, ele fica.
                $setOnInsert: { status: payRes.data.status || 'pending' },
            },
            { upsert: true, returnDocument: 'after' },
        );
        return { ok: true, payment };
    } catch (error) {
        // Boleto emitido e não registrado é cobrança que ninguém acompanha:
        // cancela no Mercado Pago em vez de deixar solto.
        console.error('[cobranca-concessionaria] Boleto gerado e não registrado, cancelando:', mpPaymentId, error);
        await mpPut(`/v1/payments/${mpPaymentId}`, { status: 'cancelled' }).catch(() => null);
        return { ok: false, status: 500, error: 'Não foi possível registrar a cobrança. O boleto foi cancelado; emita de novo.' };
    }
}

export type ResultadoLiberacao = {
    aplicado: boolean;
    liberado?: 'plano' | 'banner' | 'nada';
    motivo?: string;
    expiresAt?: Date;
};

/**
 * Libera o que a cobrança paga dava direito: renova o plano de repasse, manda o
 * banner para a análise da equipe, ou nada (cobrança avulsa).
 *
 * Idempotente pelo campo `assinaturaAplicadaEm` do Payment, o mesmo da
 * assinatura do lojista: o primeiro que chegar (webhook, sincronização ou baixa
 * manual) marca, e os demais não fazem nada. Webhook repetido não soma 30 dias
 * de novo, nem baixa manual seguida do pagamento do boleto.
 */
export async function liberarCobrancaConcessionaria(params: {
    paymentDocId: unknown;
    metodo: PlanoRepasseMetodo;
    por?: string;
}): Promise<ResultadoLiberacao> {
    const filtro: Record<string, unknown> = { _id: params.paymentDocId, assinaturaAplicadaEm: { $exists: false } };
    const pagamento = await Payment.findOneAndUpdate(
        filtro,
        { $set: { assinaturaAplicadaEm: new Date() } },
        { returnDocument: 'after' },
    ) as any;
    if (!pagamento) return { aplicado: false, motivo: 'Esta cobrança já tinha sido liberada.' };

    const desfazer = () => Payment.updateOne({ _id: pagamento._id }, { $unset: { assinaturaAplicadaEm: '' } });
    const referencia = String(pagamento.mpPaymentId || pagamento._id);

    const plano = parseDealerPlanReference(pagamento.externalReference);
    if (plano) {
        const r = await aplicarPlanoRepasse({
            concessionariaId: plano.concessionariaId,
            planId: plano.planId,
            billingType: plano.billingType,
            metodo: params.metodo,
            por: params.por,
            paymentId: referencia,
        });
        if (!r.ok) {
            await desfazer();
            return { aplicado: false, motivo: r.error };
        }
        if (!r.aplicado) return { aplicado: false, liberado: 'plano', motivo: 'Este pagamento já tinha renovado o plano de repasse.' };
        await registrarTransacaoPlanoRepasse({
            userId: pagamento.userId,
            referenceId: referencia,
            planName: r.concessionaria?.planoRepasse?.planName,
            billingType: plano.billingType,
            amount: pagamento.amount || 0,
        });
        return { aplicado: true, liberado: 'plano', expiresAt: r.concessionaria?.planoRepasse?.expiresAt || undefined };
    }

    const bannerId = pagamento.bannerId || parseBannerReference(pagamento.externalReference);
    if (bannerId) {
        // Só sai de "aguardando pagamento": banner que a equipe já aprovou ou
        // recusou não volta para a fila por causa de um aviso atrasado.
        const banner = await Banner.findOneAndUpdate(
            { _id: bannerId, status: 'awaiting_payment' },
            { $set: { status: 'pending', paymentId: referencia } },
        );
        return banner
            ? { aplicado: true, liberado: 'banner' }
            : { aplicado: false, liberado: 'banner', motivo: 'O banner desta cobrança não está mais aguardando pagamento.' };
    }

    return { aplicado: true, liberado: 'nada' };
}

function metodoDoPagamentoMP(payment: any): PlanoRepasseMetodo {
    const method = payment?.payment_method_id || '';
    const type = payment?.payment_type_id || '';
    if (method === 'pix' || type === 'bank_transfer') return 'pix';
    if (method === 'bolbradesco' || type === 'ticket') return 'boleto';
    return 'card';
}

/**
 * Chamado pelo webhook do Mercado Pago quando a referência começa com
 * DEALERCOB: (cobrança avulsa ou banner sem anúncio ligado) ou BANNER:.
 * O plano de repasse (DEALERPLAN:) segue em planoRepasseService.
 */
export async function processarPagamentoCobrancaConcessionaria(payment: any, paymentId: string): Promise<ResultadoLiberacao | null> {
    const ref = payment?.external_reference;
    const bannerId = parseBannerReference(ref);
    if (!bannerId && !parseDealerCobReference(ref)) {
        console.error('[Webhook] Referência de cobrança de concessionária inválida:', ref);
        return null;
    }

    const status: string = payment.status;
    const registro = await Payment.findOne({ mpPaymentId: String(paymentId) }).select('_id baixaManual') as any;

    if (registro) {
        // Baixa manual: quem manda é a equipe. O boleto cancelado no Mercado
        // Pago depois da baixa não pode derrubar o "pago".
        if (!registro.baixaManual?.em) {
            await Payment.updateOne({ _id: registro._id }, {
                $set: {
                    status,
                    statusDetail: payment.status_detail,
                    mpDateApproved: payment.date_approved ? new Date(payment.date_approved) : undefined,
                },
            });
        }
        if (status !== 'approved') {
            // Boleto do banner cancelado ou recusado: o anúncio sai de "aguardando
            // pagamento", como no PIX. Com baixa manual, quem manda é a equipe.
            if (bannerId && !registro.baixaManual?.em && (status === 'rejected' || status === 'cancelled')) {
                await Banner.updateOne({ _id: bannerId, status: 'awaiting_payment' }, { $set: { status: 'rejected', paymentId: String(paymentId) } });
            }
            return { aplicado: false, motivo: `status ${status}` };
        }
        const r = await liberarCobrancaConcessionaria({ paymentDocId: registro._id, metodo: metodoDoPagamentoMP(payment), por: 'mercadopago' });
        console.log(`[Webhook] Cobrança de concessionária ${paymentId}:`, r);
        return r;
    }

    // Banner pago sem registro em Payment (PIX do banner): só o anúncio muda.
    if (bannerId) {
        const novo = status === 'approved' ? 'pending' : (status === 'rejected' || status === 'cancelled' ? 'rejected' : null);
        if (!novo) return { aplicado: false, motivo: `status ${status}` };
        const banner = await Banner.findOneAndUpdate(
            { _id: bannerId, status: 'awaiting_payment' },
            { $set: { status: novo, paymentId: String(paymentId) } },
        );
        console.log(`[Webhook] Banner ${bannerId}: ${banner ? `passou para ${novo}` : 'já tinha saído de aguardando pagamento'}.`);
        return { aplicado: Boolean(banner) && novo === 'pending', liberado: 'banner' };
    }

    console.error('[Webhook] Cobrança de concessionária sem registro em Payment:', paymentId, ref);
    return null;
}

/** Linha da cobrança para as telas (concessionária e equipe). Nada de dado sensível do pagador. */
export function serializarCobrancaConcessionaria(p: any) {
    const tipo = (p.tipoCobranca || (parseDealerPlanReference(p.externalReference) ? 'plano' : null)) as TipoCobrancaConcessionaria | null;
    const boleto = p.method === 'bolbradesco' || p.method === 'ticket' || p.methodDetail === 'bolbradesco';
    return {
        id: String(p._id),
        mpPaymentId: p.mpPaymentId || null,
        tipo,
        tipoLabel: tipo ? ROTULO_TIPO_COBRANCA[tipo] : 'Pagamento',
        descricao: p.descricao || (tipo ? ROTULO_TIPO_COBRANCA[tipo] : 'Pagamento'),
        valor: p.amount || 0,
        status: p.status,
        meio: boleto ? 'boleto' : p.method === 'pix' || p.method === 'bank_transfer' || p.methodDetail === 'pix' ? 'pix' : p.method,
        vencimento: p.vencimento || null,
        criadoEm: p.createdAt || p.mpDateCreated || null,
        pagoEm: p.baixaManual?.dataPagamento || p.mpDateApproved || null,
        baixaManual: Boolean(p.baixaManual?.em),
        boletoUrl: p.boletoUrl || null,
        boletoBarcode: p.boletoBarcode || null,
    };
}
