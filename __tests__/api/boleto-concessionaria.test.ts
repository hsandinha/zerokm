// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { session, mp, emails } = vi.hoisted(() => ({
    session: { current: null as any },
    mp: { posted: [] as any[], puts: [] as any[], proximoId: 9001 },
    emails: { enviados: [] as any[], falhar: false },
}));

vi.mock('next-auth', () => ({ getServerSession: async () => session.current }));
vi.mock('@/lib/authOptions', () => ({ authOptions: {} }));
vi.mock('@/lib/mongodb', () => ({ default: async () => undefined }));
// Mercado Pago e e-mail sempre de mentira.
vi.mock('@/lib/mercadopago', () => ({
    mpPost: async (path: string, body: any) => {
        mp.posted.push({ path, body });
        return {
            ok: true,
            status: 201,
            data: { id: mp.proximoId++, status: 'pending', transaction_details: { external_resource_url: 'https://mp/boleto.pdf' }, barcode: { content: '2379338128600000000030' } },
        };
    },
    mpPut: async (path: string, body: any) => { mp.puts.push({ path, body }); return { ok: true, status: 200, data: {} }; },
    getPayment: async () => ({ ok: false, status: 404, data: {} }),
}));
vi.mock('@/lib/email/sendEmail', () => ({
    sendEmail: async (args: any) => {
        emails.enviados.push(args);
        return emails.falhar ? { ok: false, error: 'Falha do provedor' } : { ok: true, id: `email-${emails.enviados.length}` };
    },
}));
vi.mock('@/lib/services/mercadoPagoSubscriptionService', () => ({ getPublicBaseUrl: () => 'https://cnv.test' }));
vi.mock('@/models/Payment', async () => ({ default: (await import('../helpers/fakeModel')).fakeModel('payments') }));
vi.mock('@/models/Banner', async () => ({ default: (await import('../helpers/fakeModel')).fakeModel('banners') }));
vi.mock('@/models/Concessionaria', async () => ({ default: (await import('../helpers/fakeModel')).fakeModel('concessionarias') }));
vi.mock('@/models/Plan', async () => ({ default: (await import('../helpers/fakeModel')).fakeModel('plans') }));
vi.mock('@/models/Transaction', async () => ({ default: (await import('../helpers/fakeModel')).fakeModel('transactions') }));
vi.mock('@/models/User', async () => ({ default: (await import('../helpers/fakeModel')).fakeModel('users') }));

import { colecoes, limparColecoes } from '../helpers/fakeModel';
import { GET as OPCOES, POST as EMITIR } from '@/app/api/admin/cobrancas/concessionaria/route';
import { POST as BAIXA } from '@/app/api/admin/cobrancas/baixa/route';
import { POST as REENVIAR } from '@/app/api/admin/cobrancas/[id]/reenviar/route';
import { GET as COBRANCAS_DA_LOJA } from '@/app/api/dealership/cobrancas/route';
import { POST as BOLETO_PLANO } from '@/app/api/checkout/plano-repasse/boleto/route';

const LOJA_A = 'a1'.repeat(12);
const LOJA_B = 'b2'.repeat(12);
const LOJA_SEM_CADASTRO = 'c3'.repeat(12);
const PLANO = 'd4'.repeat(12);
const PLANO_LOJISTA = 'd5'.repeat(12);
const USER_A = 'e6'.repeat(12);
const USER_B = 'e7'.repeat(12);
const USER_C = 'e8'.repeat(12);
const ADMIN_USER = 'f9'.repeat(12);
const BANNER_A = 'ba'.repeat(12);
const BANNER_B = 'bb'.repeat(12);

const cadastro = (id: string, nome: string, cnpj: string) => ({
    _id: id, nome, razaoSocial: `${nome} Ltda`, cnpj, email: `financeiro@${nome.toLowerCase()}.com.br`,
    endereco: 'Rua Um', numero: '10', bairro: 'Centro', cidade: 'Belo Horizonte', uf: 'MG', cep: '30130000',
});

const sessao = (profile: string, email = `${profile}@cnv.com.br`) => ({ user: { email, profile } });
const lojaA = sessao('concessionaria', 'a@loja.com.br');
const lojaB = sessao('concessionaria', 'b@loja.com.br');

const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const req = (path: string, init?: RequestInit) => new Request(`http://localhost${path}`, init);
const amanha = () => new Date(Date.now() - 3 * 3600_000 + 5 * 864e5).toISOString().slice(0, 10);
const emitir = async (body: Record<string, unknown>) => {
    const res = await EMITIR(req('/api/admin/cobrancas/concessionaria', json({ concessionariaId: LOJA_A, vencimento: amanha(), ...body })));
    return { status: res.status, body: await res.json() };
};

beforeEach(() => {
    limparColecoes();
    mp.posted = [];
    mp.puts = [];
    mp.proximoId = 9001;
    emails.enviados = [];
    emails.falhar = false;
    session.current = sessao('administrativo');
    vi.stubEnv('RESEND_API_KEY', 're_teste');
    colecoes.concessionarias = [
        cadastro(LOJA_A, 'Alfa', '11.222.333/0001-81'),
        cadastro(LOJA_B, 'Beta', '11.444.777/0001-61'),
        { _id: LOJA_SEM_CADASTRO, nome: 'Gama', email: 'gama@gama.com.br' },
    ];
    colecoes.plans = [
        { _id: PLANO, name: 'Pro', publico: 'concessionaria', price: 499.9, annualPrice: 4999, active: true },
        { _id: PLANO_LOJISTA, name: 'Acesso Total', price: 699, active: true, type: 'monthly' },
    ];
    colecoes.users = [
        { _id: USER_A, email: 'a@loja.com.br', firebaseUid: 'uid-a', dealershipId: LOJA_A, allowedProfiles: ['concessionaria'], defaultProfile: 'concessionaria' },
        { _id: USER_B, email: 'b@loja.com.br', firebaseUid: 'uid-b', dealershipId: LOJA_B },
        { _id: USER_C, email: 'c@loja.com.br', firebaseUid: 'uid-c', dealershipId: LOJA_SEM_CADASTRO },
        { _id: ADMIN_USER, email: 'administrativo@cnv.com.br', firebaseUid: 'uid-adm' },
    ];
    colecoes.banners = [
        { _id: BANNER_A, title: 'Banner da Alfa', dealershipId: 'uid-a', status: 'awaiting_payment' },
        { _id: BANNER_B, title: 'Banner da Beta', dealershipId: 'uid-b', status: 'awaiting_payment' },
    ];
});

describe('quem emite boleto para concessionária', () => {
    it.each(['operador', 'gerente', 'vendedor', 'concessionaria', 'cliente'])('%s não emite nem consulta', async (perfil) => {
        session.current = sessao(perfil);

        expect((await emitir({ tipo: 'avulsa', descricao: 'Taxa de adesão', valor: '100,00' })).status).toBe(403);
        expect((await OPCOES(req('/api/admin/cobrancas/concessionaria'))).status).toBe(403);
        expect(mp.posted).toHaveLength(0);
    });

    it('sem sessão: 403', async () => {
        session.current = null;
        expect((await emitir({ tipo: 'avulsa', descricao: 'Taxa', valor: '100' })).status).toBe(403);
    });

    it.each(['admin', 'administrador', 'administrativo'])('%s emite para qualquer concessionária', async (perfil) => {
        session.current = sessao(perfil);
        const { status, body } = await emitir({ concessionariaId: LOJA_B, tipo: 'avulsa', descricao: 'Taxa de adesão', valor: '1.250,50' });

        expect(status).toBe(200);
        expect(body.cobranca).toMatchObject({ tipo: 'avulsa', descricao: 'Taxa de adesão', valor: 1250.5, status: 'pending', boletoUrl: 'https://mp/boleto.pdf', boletoBarcode: '2379338128600000000030' });
        expect(colecoes.payments[0]).toMatchObject({ concessionariaId: LOJA_B, userId: USER_B, emitidoPor: `${perfil}@cnv.com.br` });
        expect(mp.posted[0].body.payer.identification).toEqual({ type: 'CNPJ', number: '11444777000161' });
    });
});

describe('emissão pela equipe', () => {
    it('plano de repasse: valor da tabela, referência DEALERPLAN e e-mail para a loja', async () => {
        const { status, body } = await emitir({ tipo: 'plano', planId: PLANO, billingType: 'annual' });

        expect(status).toBe(200);
        expect(mp.posted[0].body).toMatchObject({ transaction_amount: 4999, external_reference: `DEALERPLAN:${LOJA_A}:${PLANO}:annual:${USER_A}` });
        expect(colecoes.payments[0]).toMatchObject({ tipoCobranca: 'plano', planId: PLANO, billingType: 'annual', descricao: 'Plano de Repasse Pro (Anual)' });
        expect(body.email).toEqual({ enviado: true, para: 'financeiro@alfa.com.br', erro: null });
        expect(emails.enviados[0]).toMatchObject({ to: 'financeiro@alfa.com.br' });
        expect(emails.enviados[0].text).toContain('Plano de Repasse Pro (Anual)');
        expect(colecoes.payments[0]).toMatchObject({ boletoEmailTo: 'financeiro@alfa.com.br', boletoEmailId: 'email-1' });
    });

    it('plano com valor combinado: vale o valor digitado', async () => {
        await emitir({ tipo: 'plano', planId: PLANO, billingType: 'monthly', valor: '399,90' });
        expect(mp.posted[0].body.transaction_amount).toBe(399.9);
    });

    it('plano de lojista não serve para concessionária', async () => {
        const { status, body } = await emitir({ tipo: 'plano', planId: PLANO_LOJISTA });
        expect(status).toBe(400);
        expect(body.error).toBe('Escolha um plano de repasse ativo.');
        expect(mp.posted).toHaveLength(0);
    });

    it('cadastro incompleto: devolve o que falta e não chama o Mercado Pago', async () => {
        const { status, body } = await emitir({ concessionariaId: LOJA_SEM_CADASTRO, tipo: 'avulsa', descricao: 'Taxa', valor: '100' });

        expect(status).toBe(422);
        expect(body.faltando).toEqual(['CNPJ válido', 'Razão social', 'CEP', 'Endereço (rua)', 'Número', 'Bairro', 'Cidade', 'UF']);
        expect(mp.posted).toHaveLength(0);
    });

    it('o modal recebe o que falta antes de tentar emitir', async () => {
        const res = await OPCOES(req(`/api/admin/cobrancas/concessionaria?concessionariaId=${LOJA_SEM_CADASTRO}`));
        const body = await res.json();
        expect(body.faltando).toContain('CNPJ válido');

        const ok = await (await OPCOES(req(`/api/admin/cobrancas/concessionaria?concessionariaId=${LOJA_A}`))).json();
        expect(ok.faltando).toEqual([]);
        expect(ok.planos).toEqual([{ id: PLANO, name: 'Pro', price: 499.9, annualPrice: 4999 }]);
        expect(ok.banners).toEqual([{ id: BANNER_A, title: 'Banner da Alfa' }]);
    });

    it.each([
        [{ tipo: 'avulsa', descricao: '', valor: '100' }, 'Descreva o que está sendo cobrado.'],
        [{ tipo: 'avulsa', descricao: 'Taxa', valor: '' }, 'Informe o valor da cobrança.'],
        [{ tipo: 'avulsa', descricao: 'Taxa', valor: '2,00' }, 'O valor mínimo do boleto é R$ 5,00.'],
        [{ tipo: 'avulsa', descricao: 'Taxa', valor: '100', vencimento: '2020-01-01' }, 'O vencimento precisa ser a partir de amanhã.'],
        [{ tipo: 'assinatura', valor: '100' }, 'Escolha o que está sendo cobrado.'],
    ])('recusa %j', async (corpo, erro) => {
        const { status, body } = await emitir(corpo);
        expect(status).toBe(400);
        expect(body.error).toBe(erro);
        expect(mp.posted).toHaveLength(0);
    });

    it('banner: só liga a um anúncio da própria concessionária', async () => {
        const deOutra = await emitir({ tipo: 'banner', bannerId: BANNER_B, valor: '50' });
        expect(deOutra.status).toBe(400);
        expect(mp.posted).toHaveLength(0);

        const { status } = await emitir({ tipo: 'banner', bannerId: BANNER_A, valor: '50' });
        expect(status).toBe(200);
        expect(mp.posted[0].body.external_reference).toBe(`BANNER:${BANNER_A}`);
        expect(colecoes.banners[0].paymentId).toBe('9001');
        expect(colecoes.payments[0]).toMatchObject({ tipoCobranca: 'banner', bannerId: BANNER_A });
    });

    it('e-mail falhou: o boleto vale e a falha fica registrada para o reenvio', async () => {
        emails.falhar = true;
        const { status, body } = await emitir({ tipo: 'avulsa', descricao: 'Taxa', valor: '100' });

        expect(status).toBe(200);
        expect(body.email).toMatchObject({ enviado: false, erro: 'Falha do provedor' });
        expect(colecoes.payments[0].boletoEmailError).toBe('Falha do provedor');
    });

    it('sem envio de e-mail quando a equipe desmarca', async () => {
        await emitir({ tipo: 'avulsa', descricao: 'Taxa', valor: '100', enviarEmail: false });
        expect(emails.enviados).toHaveLength(0);
    });

    it('reenvio pelo fluxo de Cobranças usa o e-mail e o texto da cobrança da loja', async () => {
        await emitir({ tipo: 'avulsa', descricao: 'Taxa de adesão', valor: '100', enviarEmail: false });
        session.current = sessao('operador');

        const res = await REENVIAR(req('/x', json({})), { params: Promise.resolve({ id: colecoes.payments[0]._id }) });

        expect(res.status).toBe(200);
        expect(emails.enviados[0]).toMatchObject({ to: 'financeiro@alfa.com.br' });
        expect(emails.enviados[0].text).toContain('Geramos um boleto referente a: Taxa de adesão');
    });
});

describe('a concessionária só vê e paga o que é dela', () => {
    beforeEach(async () => {
        await emitir({ concessionariaId: LOJA_A, tipo: 'avulsa', descricao: 'Cobrança da Alfa', valor: '100', enviarEmail: false });
        await emitir({ concessionariaId: LOJA_B, tipo: 'avulsa', descricao: 'Cobrança da Beta', valor: '200', enviarEmail: false });
        mp.posted = [];
    });

    it('histórico: só as cobranças da loja do usuário, mesmo pedindo outra por parâmetro', async () => {
        session.current = lojaA;
        const res = await COBRANCAS_DA_LOJA(req(`/api/dealership/cobrancas?concessionariaId=${LOJA_B}`));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.cobrancas.map((c: any) => c.descricao)).toEqual(['Cobrança da Alfa']);
        expect(body.cobrancas[0]).toMatchObject({ valor: 100, boletoUrl: 'https://mp/boleto.pdf', boletoBarcode: '2379338128600000000030' });
        expect(JSON.stringify(body)).not.toContain('Beta');
    });

    it.each(['cliente', 'vendedor', 'administrador'])('%s não usa o histórico da concessionária', async (perfil) => {
        session.current = sessao(perfil);
        expect((await COBRANCAS_DA_LOJA(req(`/api/dealership/cobrancas?concessionariaId=${LOJA_A}`))).status).toBe(403);
    });

    it('boleto do plano: sai no CNPJ da loja do usuário logado', async () => {
        session.current = lojaB;
        const res = await BOLETO_PLANO(req(`/api/checkout/plano-repasse/boleto?concessionariaId=${LOJA_A}`, json({ planId: PLANO, billingType: 'monthly' })));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.cobranca).toMatchObject({ tipo: 'plano', valor: 499.9, boletoUrl: 'https://mp/boleto.pdf' });
        expect(mp.posted[0].body).toMatchObject({ transaction_amount: 499.9, external_reference: `DEALERPLAN:${LOJA_B}:${PLANO}:monthly:${USER_B}` });
        expect(mp.posted[0].body.payer.identification.number).toBe('11444777000161');
    });

    it('boleto do plano ainda em aberto é devolvido de novo, sem emitir outro', async () => {
        session.current = lojaA;
        const corpo = () => req('/api/checkout/plano-repasse/boleto', json({ planId: PLANO, billingType: 'monthly' }));
        const primeiro = await (await BOLETO_PLANO(corpo())).json();
        const segundo = await (await BOLETO_PLANO(corpo())).json();

        expect(mp.posted).toHaveLength(1);
        expect(segundo.reaproveitado).toBe(true);
        expect(segundo.cobranca.id).toBe(primeiro.cobranca.id);
    });

    it('cadastro incompleto: a loja recebe a lista do que falta', async () => {
        session.current = sessao('concessionaria', 'c@loja.com.br');
        const res = await BOLETO_PLANO(req('/api/checkout/plano-repasse/boleto', json({ planId: PLANO })));
        const body = await res.json();

        expect(res.status).toBe(422);
        expect(body.faltando).toContain('CNPJ válido');
        expect(mp.posted).toHaveLength(0);
    });

    it('lojista e equipe não geram o boleto do plano da concessionária', async () => {
        for (const perfil of ['cliente', 'administrador']) {
            session.current = sessao(perfil);
            expect((await BOLETO_PLANO(req('/api/checkout/plano-repasse/boleto', json({ planId: PLANO })))).status).toBe(403);
        }
    });
});

describe('baixa manual de cobrança da concessionária', () => {
    const darBaixa = async (extra: Record<string, unknown> = {}) => {
        const res = await BAIXA(req('/api/admin/cobrancas/baixa', json({ paymentId: colecoes.payments[0]._id, forma: 'pix', ...extra })));
        return { status: res.status, body: await res.json() };
    };

    it('libera o plano de repasse da loja e não mexe no perfil do usuário', async () => {
        await emitir({ tipo: 'plano', planId: PLANO, billingType: 'monthly', enviarEmail: false });
        const { status, body } = await darBaixa({ cancelarBoleto: true });

        expect(status).toBe(200);
        expect(body).toMatchObject({ concessionaria: true, liberado: 'plano', assinaturaRenovada: true, boletoCancelado: true });
        expect(mp.puts[0]).toEqual({ path: '/v1/payments/9001', body: { status: 'cancelled' } });
        expect(colecoes.concessionarias[0].planoRepasse).toMatchObject({ status: 'active', planName: 'Pro', activationMethod: 'pix' });
        expect(colecoes.payments[0]).toMatchObject({ status: 'approved', statusDetail: 'baixa_manual' });
        // O fluxo do lojista trocaria o perfil para "cliente" e quebraria o login da loja.
        expect(colecoes.users[0]).toMatchObject({ allowedProfiles: ['concessionaria'], defaultProfile: 'concessionaria' });
        expect(colecoes.users[0].subscription).toBeUndefined();
    });

    it('segunda baixa na mesma cobrança é recusada e o plano não soma outro período', async () => {
        await emitir({ tipo: 'plano', planId: PLANO, billingType: 'monthly', enviarEmail: false });
        await darBaixa();
        const validade = new Date(colecoes.concessionarias[0].planoRepasse.expiresAt).getTime();

        expect((await darBaixa()).status).toBe(409);
        expect(new Date(colecoes.concessionarias[0].planoRepasse.expiresAt).getTime()).toBe(validade);
    });

    it('cobrança avulsa: só fica paga', async () => {
        await emitir({ tipo: 'avulsa', descricao: 'Taxa', valor: '100', enviarEmail: false });
        const { body } = await darBaixa();

        expect(body).toMatchObject({ concessionaria: true, liberado: 'nada', assinaturaRenovada: false });
        expect(colecoes.concessionarias[0].planoRepasse).toBeUndefined();
    });
});
