import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import Payment from '@/models/Payment';
import User from '@/models/User';
import { getPayment, mpPut } from '@/lib/mercadopago';
import { aplicarPagamentoNaAssinatura } from '@/lib/services/assinaturaPagamento';
import { parseSubscriptionStartDate } from '@/lib/utils/subscriptionDates';

export const dynamic = 'force-dynamic';

// Mesmo grupo da tela de Cobranças. Sem 'gerente': é dado financeiro do cliente.
const STAFF = new Set(['admin', 'administrador', 'administrativo', 'operador', 'operator']);
const FORMAS = new Set(['pix', 'transferencia', 'dinheiro', 'boleto', 'cartao', 'outro']);
const ROTULO_FORMA: Record<string, string> = {
    pix: 'PIX', transferencia: 'transferência', dinheiro: 'dinheiro', boleto: 'boleto', cartao: 'cartão', outro: 'outro meio',
};

/**
 * POST /api/admin/cobrancas/baixa
 *
 * Dá baixa manual numa cobrança: o sistema mandou o boleto, mas o cliente
 * pagou de outro jeito (quase sempre PIX direto). Marca como pago, renova a
 * assinatura e, se pedido, cancela o boleto no Mercado Pago para o cliente não
 * pagar duas vezes.
 *
 * Corpo:
 *  - paymentId: id da cobrança do sistema, OU
 *  - mpPaymentId + userEmail: boleto emitido à mão no painel do MP, que não
 *    existe no nosso banco (a baixa cria o registro já ligado ao cliente);
 *  - forma: pix | transferencia | dinheiro | boleto | cartao | outro
 *  - dataPagamento: AAAA-MM-DD (opcional, padrão hoje)
 *  - observacao (opcional)
 *  - cancelarBoleto: true para cancelar o boleto pendente no MP
 *  - renovarAssinatura: false para só registrar, sem mexer no plano
 */
export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !STAFF.has(session.user?.profile as string)) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
        }
        const body = await request.json().catch(() => ({}));
        const forma = typeof body.forma === 'string' && FORMAS.has(body.forma) ? body.forma : null;
        if (!forma) return NextResponse.json({ error: 'Informe como o cliente pagou.' }, { status: 400 });

        const dataPagamento = body.dataPagamento ? parseSubscriptionStartDate(body.dataPagamento) : new Date();
        if (!dataPagamento) return NextResponse.json({ error: 'Data do pagamento inválida.' }, { status: 400 });
        if (dataPagamento.getTime() > Date.now() + 864e5) {
            return NextResponse.json({ error: 'A data do pagamento não pode ser no futuro.' }, { status: 400 });
        }
        const observacao = typeof body.observacao === 'string' ? body.observacao.trim().slice(0, 500) : '';

        await connectDB();

        let pagamento: any = null;
        if (body.paymentId) {
            if (!mongoose.isValidObjectId(body.paymentId)) return NextResponse.json({ error: 'Cobrança não encontrada' }, { status: 404 });
            pagamento = await Payment.findById(body.paymentId);
            if (!pagamento) return NextResponse.json({ error: 'Cobrança não encontrada' }, { status: 404 });
        } else if (body.mpPaymentId && body.userEmail) {
            // Boleto do painel do MP: cria o registro já ligado ao cliente escolhido.
            const mpPaymentId = String(body.mpPaymentId).replace(/\D/g, '');
            const cliente = await User.findOne({ email: String(body.userEmail).toLowerCase().trim() });
            if (!cliente) return NextResponse.json({ error: 'Cliente não encontrado com esse e-mail.' }, { status: 404 });
            pagamento = await Payment.findOne({ mpPaymentId });
            if (!pagamento) {
                const mp = await getPayment(mpPaymentId);
                if (!mp.ok) return NextResponse.json({ error: 'Não foi possível consultar esse boleto no Mercado Pago.' }, { status: 502 });
                pagamento = await Payment.create({
                    userId: cliente._id,
                    planId: cliente.subscription?.planId && mongoose.isValidObjectId(cliente.subscription.planId) ? cliente.subscription.planId : undefined,
                    mpPaymentId,
                    externalReference: `PAINEL-MP:${mpPaymentId}`,
                    method: mp.data?.payment_method_id || 'bolbradesco',
                    status: mp.data?.status || 'pending',
                    amount: mp.data?.transaction_amount || 0,
                    currency: 'BRL',
                    billingType: cliente.subscription?.billingType === 'annual' ? 'annual' : 'monthly',
                    boletoUrl: mp.data?.transaction_details?.external_resource_url,
                    boletoBarcode: mp.data?.barcode?.content,
                    payerEmail: cliente.email,
                    mpDateCreated: mp.data?.date_created ? new Date(mp.data.date_created) : undefined,
                });
            } else if (String(pagamento.userId) !== String(cliente._id)) {
                return NextResponse.json({ error: 'Esse boleto já está ligado a outro cliente.' }, { status: 409 });
            }
        } else {
            return NextResponse.json({ error: 'Informe a cobrança.' }, { status: 400 });
        }

        if (pagamento.status === 'approved' && pagamento.assinaturaAplicadaEm) {
            return NextResponse.json({ error: 'Esta cobrança já está paga e já renovou a assinatura.' }, { status: 409 });
        }

        // Cancela o boleto em aberto no MP, para o cliente não pagar de novo.
        let boletoCancelado = false;
        let avisoMP: string | null = null;
        const estavaPendente = ['pending', 'in_process'].includes(pagamento.status);
        if (body.cancelarBoleto === true && estavaPendente && pagamento.mpPaymentId && /^\d+$/.test(String(pagamento.mpPaymentId))) {
            const r = await mpPut(`/v1/payments/${pagamento.mpPaymentId}`, { status: 'cancelled' }).catch(() => ({ ok: false } as any));
            boletoCancelado = Boolean(r?.ok);
            if (!boletoCancelado) avisoMP = 'A baixa foi feita, mas o Mercado Pago não aceitou cancelar o boleto. Cancele pelo painel do MP para o cliente não pagar duas vezes.';
        }

        pagamento.status = 'approved';
        pagamento.statusDetail = 'baixa_manual';
        pagamento.mpDateApproved = dataPagamento;
        pagamento.baixaManual = {
            por: session.user?.email || undefined,
            em: new Date(),
            dataPagamento,
            forma,
            observacao: observacao || undefined,
            boletoCanceladoNoMP: boletoCancelado,
        };
        await pagamento.save();

        let assinatura: { aplicado: boolean; motivo?: string; expiresAt?: Date } = { aplicado: false, motivo: 'Renovação não pedida.' };
        if (body.renovarAssinatura !== false) {
            assinatura = await aplicarPagamentoNaAssinatura({
                paymentDocId: pagamento._id,
                metodo: `${ROTULO_FORMA[forma]} (baixa manual)`,
                descricao: undefined,
            });
        }

        return NextResponse.json({
            ok: true,
            boletoCancelado,
            avisoMP,
            assinaturaRenovada: assinatura.aplicado,
            novoVencimento: assinatura.expiresAt || null,
            motivo: assinatura.aplicado ? null : assinatura.motivo,
        });
    } catch (error: any) {
        console.error('[cobrancas/baixa] POST', error);
        return NextResponse.json({ error: error.message || 'Erro ao dar baixa' }, { status: 500 });
    }
}
