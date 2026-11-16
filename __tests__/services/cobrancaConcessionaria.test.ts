// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mp } = vi.hoisted(() => ({
    mp: { posted: [] as any[], puts: [] as any[], falhar: false, proximoId: 5001 },
}));

// Mercado Pago sempre de mentira: nenhum teste chama a API real.
vi.mock('@/lib/mercadopago', () => ({
    mpPost: async (path: string, body: any) => {
        mp.posted.push({ path, body });
        if (mp.falhar) return { ok: false, status: 400, data: { message: 'payer.address inválido' } };
        return {
            ok: true,
            status: 201,
            data: {
                id: mp.proximoId++,
                status: 'pending',
                status_detail: 'pending_waiting_payment',
                date_created: '2026-11-16T12:00:00Z',
                transaction_details: { external_resource_url: 'https://mp/boleto.pdf' },
                barcode: { content: '23793381286000000000300000000401187650000035000' },
            },
        };
    },
    mpPut: async (path: string, body: any) => { mp.puts.push({ path, body }); return { ok: true, status: 200, data: {} }; },
}));
vi.mock('@/lib/services/mercadoPagoSubscriptionService', () => ({ getPublicBaseUrl: () => 'https://cnv.test' }));
vi.mock('@/models/Payment', async () => ({ default: (await import('../helpers/fakeModel')).fakeModel('payments') }));
vi.mock('@/models/Banner', async () => ({ default: (await import('../helpers/fakeModel')).fakeModel('banners') }));
vi.mock('@/models/Concessionaria', async () => ({ default: (await import('../helpers/fakeModel')).fakeModel('concessionarias') }));
vi.mock('@/models/Plan', async () => ({ default: (await import('../helpers/fakeModel')).fakeModel('plans') }));
vi.mock('@/models/Transaction', async () => ({ default: (await import('../helpers/fakeModel')).fakeModel('transactions') }));
vi.mock('@/models/User', async () => ({ default: (await import('../helpers/fakeModel')).fakeModel('users') }));

import { colecoes, limparColecoes } from '../helpers/fakeModel';
import {
    emitirBoletoConcessionaria,
    liberarCobrancaConcessionaria,
    processarPagamentoCobrancaConcessionaria,
    serializarCobrancaConcessionaria,
} from '@/lib/services/cobrancaConcessionariaService';
import { buildDealerPlanReference, processarPagamentoPlanoRepasse } from '@/lib/services/planoRepasseService';
import { buildDealerCobReference } from '@/lib/utils/cobrancaConcessionaria';

const LOJA_ID = 'c'.repeat(24);
const PLANO_ID = 'd'.repeat(24);
const USER_ID = 'e'.repeat(24);
const BANNER_ID = 'b'.repeat(24);
const DIA = 864e5;

const loja = () => ({
    _id: LOJA_ID,
    nome: 'Central Veículos',
    razaoSocial: 'Central Veículos Ltda',
    cnpj: '11.222.333/0001-81',
    email: 'financeiro@central.com.br',
    celular: '(31) 99999-8888',
    endereco: 'Av. Afonso Pena',
    numero: '1000',
    bairro: 'Centro',
    cidade: 'Belo Horizonte',
    uf: 'MG',
    cep: '30130-000',
});

const emissao = (extra: Record<string, unknown> = {}) => ({
    concessionaria: loja(),
    userId: USER_ID,
    tipo: 'avulsa' as const,
    valor: 350,
    vencimento: new Date('2026-11-20T02:59:59Z'),
    descricao: 'Taxa de adesão',
    externalReference: buildDealerCobReference(LOJA_ID, 'avulsa', 't1'),
    emitidoPor: 'admin@cnv.com.br',
    ...extra,
});

const refPlano = buildDealerPlanReference(LOJA_ID, PLANO_ID, 'monthly', USER_ID);
const emitirPlano = () => emitirBoletoConcessionaria(emissao({
    tipo: 'plano', valor: 499.9, descricao: 'Plano de Repasse Pro (Mensal)', externalReference: refPlano, planId: PLANO_ID, billingType: 'monthly',
}));
const planoDaLoja = () => colecoes.concessionarias[0].planoRepasse;
const validade = () => new Date(planoDaLoja().expiresAt).getTime();
const aprovadoNoMP = (id: string, ref: string, extra: Record<string, unknown> = {}) => ({
    id, status: 'approved', status_detail: 'accredited', external_reference: ref, payment_method_id: 'bolbradesco', payment_type_id: 'ticket',
    transaction_amount: 499.9, date_approved: '2026-11-18T12:00:00Z', ...extra,
});

beforeEach(() => {
    limparColecoes();
    mp.posted = [];
    mp.puts = [];
    mp.falhar = false;
    mp.proximoId = 5001;
    colecoes.concessionarias = [loja()];
    colecoes.plans = [{ _id: PLANO_ID, name: 'Pro', publico: 'concessionaria', price: 499.9, active: true }];
    colecoes.users = [{ _id: USER_ID, email: 'loja@central.com.br', dealershipId: LOJA_ID }];
    colecoes.banners = [{ _id: BANNER_ID, title: 'Promoção', status: 'awaiting_payment' }];
});

describe('emitir boleto para a concessionária', () => {
    it('o pagador é a loja: CNPJ, razão social e endereço do cadastro', async () => {
        const r = await emitirBoletoConcessionaria(emissao());

        expect(r.ok).toBe(true);
        expect(mp.posted).toHaveLength(1);
        const body = mp.posted[0].body;
        expect(mp.posted[0].path).toBe('/v1/payments');
        expect(body).toMatchObject({
            transaction_amount: 350,
            payment_method_id: 'bolbradesco',
            date_of_expiration: '2026-11-20T02:59:59.000Z',
            external_reference: `DEALERCOB:${LOJA_ID}:avulsa:t1`,
            notification_url: 'https://cnv.test/api/webhooks/mercadopago',
        });
        expect(body.payer).toMatchObject({
            email: 'financeiro@central.com.br',
            first_name: 'Central',
            last_name: 'Veículos Ltda',
            identification: { type: 'CNPJ', number: '11222333000181' },
            address: { zip_code: '30130000', street_name: 'Av. Afonso Pena', street_number: '1000', neighborhood: 'Centro', city: 'Belo Horizonte', federal_unit: 'MG' },
            phone: { area_code: '31', number: '999998888' },
        });
        // Boleto não leva dado de cartão.
        expect(JSON.stringify(body)).not.toMatch(/token|card/i);
    });

    it('entra em Payment como as outras cobranças, com linha digitável e link', async () => {
        const r = await emitirBoletoConcessionaria(emissao());

        expect(colecoes.payments).toHaveLength(1);
        expect(colecoes.payments[0]).toMatchObject({
            userId: USER_ID,
            concessionariaId: LOJA_ID,
            mpPaymentId: '5001',
            method: 'bolbradesco',
            status: 'pending',
            amount: 350,
            tipoCobranca: 'avulsa',
            descricao: 'Taxa de adesão',
            emitidoPor: 'admin@cnv.com.br',
            payerName: 'Central Veículos Ltda',
            boletoUrl: 'https://mp/boleto.pdf',
        });
        expect(r.ok && serializarCobrancaConcessionaria(r.payment)).toMatchObject({
            tipo: 'avulsa', tipoLabel: 'Cobrança avulsa', meio: 'boleto', valor: 350, status: 'pending',
            boletoUrl: 'https://mp/boleto.pdf', boletoBarcode: '23793381286000000000300000000401187650000035000',
        });
    });

    it('cadastro incompleto: avisa o que falta e nem chama o Mercado Pago', async () => {
        const r = await emitirBoletoConcessionaria(emissao({ concessionaria: { ...loja(), cnpj: '', cep: '' } }));

        expect(r).toMatchObject({ ok: false, status: 422, faltando: ['CNPJ válido', 'CEP'] });
        expect(mp.posted).toHaveLength(0);
        expect(colecoes.payments ?? []).toHaveLength(0);
    });

    it('Mercado Pago recusou: devolve o motivo e não registra cobrança', async () => {
        mp.falhar = true;
        const r = await emitirBoletoConcessionaria(emissao());

        expect(r).toMatchObject({ ok: false, status: 502, error: 'payer.address inválido' });
        expect(colecoes.payments ?? []).toHaveLength(0);
    });

    it('webhook de "pagamento criado" chegou antes: completa o registro em vez de duplicar', async () => {
        colecoes.payments = [{ _id: 'f'.repeat(24), mpPaymentId: '5001', status: 'pending', userId: USER_ID, method: 'ticket' }];
        await emitirPlano();

        expect(colecoes.payments).toHaveLength(1);
        expect(colecoes.payments[0]).toMatchObject({ tipoCobranca: 'plano', descricao: 'Plano de Repasse Pro (Mensal)', boletoUrl: 'https://mp/boleto.pdf' });
    });
});

describe('baixa libera o que foi pago, uma vez só', () => {
    it('plano de repasse: webhook aprovado ativa o plano; webhook repetido não soma outro período', async () => {
        await emitirPlano();
        await processarPagamentoPlanoRepasse(aprovadoNoMP('5001', refPlano), '5001');

        expect(planoDaLoja()).toMatchObject({ status: 'active', planName: 'Pro', activationMethod: 'boleto', lastPaymentId: '5001' });
        const primeira = validade();
        expect(primeira).toBeGreaterThan(Date.now() + 29 * DIA);
        expect(colecoes.payments[0]).toMatchObject({ status: 'approved', tipoCobranca: 'plano' });
        expect(colecoes.payments[0].assinaturaAplicadaEm).toBeInstanceOf(Date);

        await processarPagamentoPlanoRepasse(aprovadoNoMP('5001', refPlano), '5001');
        await processarPagamentoPlanoRepasse(aprovadoNoMP('5001', refPlano), '5001');

        expect(validade()).toBe(primeira);
        expect(colecoes.transactions).toHaveLength(1);
        expect(colecoes.transactions[0]).toMatchObject({ referenceId: '5001', amount: 499.9, status: 'paid', userId: USER_ID });
    });

    it('dois boletos pagos: o aviso repetido do primeiro não passa pelo lastPaymentId', async () => {
        await emitirPlano();
        await emitirPlano();
        await processarPagamentoPlanoRepasse(aprovadoNoMP('5001', refPlano), '5001');
        await processarPagamentoPlanoRepasse(aprovadoNoMP('5002', refPlano), '5002');
        const depoisDeDois = validade();
        expect(depoisDeDois).toBeGreaterThan(Date.now() + 59 * DIA);

        await processarPagamentoPlanoRepasse(aprovadoNoMP('5001', refPlano), '5001');

        expect(validade()).toBe(depoisDeDois);
    });

    it('baixa manual e depois o boleto pago: o plano não renova duas vezes', async () => {
        const r = await emitirPlano();
        const id = r.ok ? r.payment._id : '';

        const baixa = await liberarCobrancaConcessionaria({ paymentDocId: id, metodo: 'manual', por: 'admin@cnv.com.br' });
        expect(baixa).toMatchObject({ aplicado: true, liberado: 'plano' });
        expect(planoDaLoja()).toMatchObject({ status: 'active', activationMethod: 'manual', activatedBy: 'admin@cnv.com.br' });
        const primeira = validade();

        // A loja pagou o boleto mesmo assim, e a equipe clicou em baixa de novo.
        await processarPagamentoPlanoRepasse(aprovadoNoMP('5001', refPlano), '5001');
        const segunda = await liberarCobrancaConcessionaria({ paymentDocId: id, metodo: 'manual' });

        expect(segunda).toMatchObject({ aplicado: false, motivo: 'Esta cobrança já tinha sido liberada.' });
        expect(validade()).toBe(primeira);
        expect(colecoes.transactions).toHaveLength(1);
    });

    it('baixa manual registrada: o boleto cancelado no Mercado Pago não derruba o "pago"', async () => {
        await emitirPlano();
        Object.assign(colecoes.payments[0], { status: 'approved', baixaManual: { em: new Date(), forma: 'pix' } });

        await processarPagamentoPlanoRepasse({ ...aprovadoNoMP('5001', refPlano), status: 'cancelled' }, '5001');

        expect(colecoes.payments[0].status).toBe('approved');
    });

    it('boleto pendente ou cancelado não ativa nada', async () => {
        await emitirPlano();
        await processarPagamentoPlanoRepasse({ ...aprovadoNoMP('5001', refPlano), status: 'pending' }, '5001');
        await processarPagamentoPlanoRepasse({ ...aprovadoNoMP('5001', refPlano), status: 'cancelled' }, '5001');

        expect(planoDaLoja()).toBeUndefined();
        expect(colecoes.payments[0].status).toBe('cancelled');
    });

    it('se a ativação falha, a marca é desfeita para a próxima tentativa valer', async () => {
        const r = await emitirPlano();
        colecoes.plans = [];

        const falhou = await liberarCobrancaConcessionaria({ paymentDocId: r.ok ? r.payment._id : '', metodo: 'boleto' });

        expect(falhou).toMatchObject({ aplicado: false, motivo: 'Plano não encontrado.' });
        expect(colecoes.payments[0].assinaturaAplicadaEm).toBeUndefined();
    });

    it('banner: o pagamento manda o anúncio para análise, e o aviso repetido não devolve um banner já aprovado', async () => {
        const ref = `BANNER:${BANNER_ID}`;
        await emitirBoletoConcessionaria(emissao({ tipo: 'banner', descricao: 'Banner: Promoção', externalReference: ref, bannerId: BANNER_ID, valor: 50 }));

        const r = await processarPagamentoCobrancaConcessionaria(aprovadoNoMP('5001', ref), '5001');
        expect(r).toMatchObject({ aplicado: true, liberado: 'banner' });
        expect(colecoes.banners[0]).toMatchObject({ status: 'pending', paymentId: '5001' });
        expect(colecoes.payments[0].status).toBe('approved');

        colecoes.banners[0].status = 'active';
        const repetido = await processarPagamentoCobrancaConcessionaria(aprovadoNoMP('5001', ref), '5001');

        expect(repetido?.aplicado).toBe(false);
        expect(colecoes.banners[0].status).toBe('active');
    });

    it('banner pago por PIX, sem registro em Payment, também sai de "aguardando pagamento"', async () => {
        const ref = `BANNER:${BANNER_ID}`;
        await processarPagamentoCobrancaConcessionaria(aprovadoNoMP('7001', ref, { payment_method_id: 'pix', payment_type_id: 'bank_transfer' }), '7001');

        expect(colecoes.banners[0]).toMatchObject({ status: 'pending', paymentId: '7001' });
    });

    it('cobrança avulsa: fica paga e não mexe em plano nem em banner', async () => {
        const emitida = await emitirBoletoConcessionaria(emissao());
        const ref = emitida.ok ? emitida.payment.externalReference : '';

        const r = await processarPagamentoCobrancaConcessionaria(aprovadoNoMP('5001', ref, { transaction_amount: 350 }), '5001');

        expect(r).toMatchObject({ aplicado: true, liberado: 'nada' });
        expect(colecoes.payments[0]).toMatchObject({ status: 'approved' });
        expect(planoDaLoja()).toBeUndefined();
        expect(colecoes.banners[0].status).toBe('awaiting_payment');
    });

    it('referência que não é de concessionária é ignorada', async () => {
        expect(await processarPagamentoCobrancaConcessionaria(aprovadoNoMP('1', 'uid:plano:monthly'), '1')).toBeNull();
    });
});
