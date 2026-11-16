import { describe, expect, it } from 'vitest';
import {
    buildDealerCobReference,
    descricaoDaCobranca,
    lerValorCobranca,
    lerVencimentoBoleto,
    mensagemCadastroIncompleto,
    pagadorDaConcessionaria,
    parseBannerReference,
    parseDealerCobReference,
    situacaoDaCobranca,
} from '@/lib/utils/cobrancaConcessionaria';
import { buildBoletoEmail } from '@/lib/email/boletoEmail';

const LOJA = {
    nome: 'Central Veículos',
    razaoSocial: 'Central Veículos Ltda',
    cnpj: '11.222.333/0001-81',
    email: 'Financeiro@central.com.br',
    telefone: '(31) 3333-4444',
    endereco: 'Av. Afonso Pena',
    numero: '1000',
    bairro: 'Centro',
    cidade: 'Belo Horizonte',
    uf: 'mg',
    cep: '30130-000',
};
const ID = 'a'.repeat(24);

describe('pagador do boleto a partir do cadastro da concessionária', () => {
    it('cadastro completo: CNPJ e CEP só com dígitos, UF em maiúsculas, e-mail em minúsculas', () => {
        const { pagador, faltando } = pagadorDaConcessionaria(LOJA);
        expect(faltando).toEqual([]);
        expect(pagador).toMatchObject({ razaoSocial: 'Central Veículos Ltda', cnpj: '11222333000181', cep: '30130000', uf: 'MG', email: 'financeiro@central.com.br', telefone: '3133334444' });
    });

    it('diz exatamente o que falta, em vez de deixar o Mercado Pago recusar', () => {
        const { pagador, faltando } = pagadorDaConcessionaria({ ...LOJA, cnpj: '11.111.111/1111-11', razaoSocial: ' ', cep: '3013', numero: '', uf: 'Minas' });
        expect(pagador).toBeNull();
        expect(faltando).toEqual(['CNPJ válido', 'Razão social', 'CEP', 'Número', 'UF']);
        expect(mensagemCadastroIncompleto(faltando)).toBe('Para emitir o boleto, complete o cadastro da concessionária: CNPJ válido, Razão social, CEP, Número, UF.');
    });

    it('sem e-mail da loja usa o do responsável; sem nenhum, falta e-mail', () => {
        expect(pagadorDaConcessionaria({ ...LOJA, email: '', emailResponsavel: 'dono@central.com.br' }).pagador?.email).toBe('dono@central.com.br');
        expect(pagadorDaConcessionaria({ ...LOJA, email: 'sem-arroba', emailResponsavel: '' }).faltando).toEqual(['E-mail']);
    });

    it('cadastro vazio ou inexistente não quebra', () => {
        expect(pagadorDaConcessionaria(null).faltando).toHaveLength(9);
        expect(pagadorDaConcessionaria({}).pagador).toBeNull();
    });
});

describe('valor da cobrança', () => {
    it('lê o formato brasileiro e devolve centavos exatos', () => {
        expect(lerValorCobranca('1.234,56')).toEqual({ valor: 1234.56 });
        expect(lerValorCobranca('R$ 500')).toEqual({ valor: 500 });
        expect(lerValorCobranca(0.1 + 0.2 + 99.7)).toEqual({ valor: 100 });
        expect(lerValorCobranca('19,999')).toEqual({ valor: 20 });
    });

    it('recusa vazio, zero, negativo, abaixo do mínimo e absurdo', () => {
        for (const entrada of ['', 'abc', undefined, 0, -10, '4,99', '100000,01']) {
            expect(lerValorCobranca(entrada)).toHaveProperty('erro');
        }
    });
});

describe('vencimento do boleto', () => {
    // 21h em Brasília do dia 10: em UTC já é dia 11.
    const AGORA = new Date('2026-11-11T00:00:00Z');

    it('vale o fim do dia escolhido em Brasília', () => {
        const r = lerVencimentoBoleto('2026-11-20', AGORA);
        expect(r).toMatchObject({ dia: '2026-11-20' });
        expect('vencimento' in r && r.vencimento.toISOString()).toBe('2026-11-21T02:59:59.000Z');
    });

    it('"hoje" é o dia de Brasília, não o de UTC', () => {
        expect(lerVencimentoBoleto('2026-11-10', AGORA)).toEqual({ erro: 'O vencimento precisa ser a partir de amanhã.' });
        expect(lerVencimentoBoleto('2026-11-11', AGORA)).toHaveProperty('vencimento');
    });

    it('recusa passado, além de 30 dias e data que não existe', () => {
        expect(lerVencimentoBoleto('2026-11-01', AGORA)).toHaveProperty('erro');
        expect(lerVencimentoBoleto('2026-12-10', AGORA)).toHaveProperty('vencimento');
        expect(lerVencimentoBoleto('2026-12-11', AGORA)).toHaveProperty('erro');
        expect(lerVencimentoBoleto('2026-11-31', AGORA)).toEqual({ erro: 'Vencimento inválido.' });
        expect(lerVencimentoBoleto('20/11/2026', AGORA)).toHaveProperty('erro');
    });

    it('sem data usa o prazo padrão de 3 dias', () => {
        expect(lerVencimentoBoleto('', AGORA)).toMatchObject({ dia: '2026-11-13' });
    });
});

describe('referência externa', () => {
    it('vai e volta, e não se confunde com as outras', () => {
        const ref = buildDealerCobReference(ID, 'avulsa', 'x1');
        expect(ref).toBe(`DEALERCOB:${ID}:avulsa:x1`);
        expect(parseDealerCobReference(ref)).toEqual({ concessionariaId: ID, tipo: 'avulsa' });
        expect(parseDealerCobReference(`DEALERPLAN:${ID}:${ID}:monthly`)).toBeNull();
        expect(parseDealerCobReference(`DEALERCOB:123:avulsa:x`)).toBeNull();
        expect(parseDealerCobReference(`DEALERCOB:${ID}:assinatura:x`)).toBeNull();
        expect(parseDealerCobReference(undefined)).toBeNull();
    });

    it('banner: só id válido', () => {
        expect(parseBannerReference(`BANNER:${ID}`)).toBe(ID);
        expect(parseBannerReference('BANNER:abc')).toBeNull();
        expect(parseBannerReference(`uid:${ID}:monthly`)).toBeNull();
    });
});

describe('descrição e situação', () => {
    it('descreve cada tipo de cobrança', () => {
        expect(descricaoDaCobranca({ tipo: 'plano', planName: 'Repasse Pro', billingType: 'annual', descricao: 'ignorada' })).toBe('Plano de Repasse Repasse Pro (Anual)');
        expect(descricaoDaCobranca({ tipo: 'banner', descricao: ' Home 7 dias ' })).toBe('Banner: Home 7 dias');
        expect(descricaoDaCobranca({ tipo: 'banner' })).toBe('Banner de anúncio');
        expect(descricaoDaCobranca({ tipo: 'avulsa', descricao: '  Taxa de adesão ' })).toBe('Taxa de adesão');
        expect(descricaoDaCobranca({ tipo: 'avulsa', descricao: 'x'.repeat(300) })).toHaveLength(140);
    });

    it('pendente depois do vencimento é vencida; baixa manual é paga mesmo com boleto cancelado', () => {
        const agora = new Date('2026-11-16T12:00:00Z');
        expect(situacaoDaCobranca({ status: 'pending', vencimento: '2026-11-20T02:59:59Z' }, agora).chave).toBe('aguardando');
        expect(situacaoDaCobranca({ status: 'pending', vencimento: '2026-11-15T02:59:59Z' }, agora).chave).toBe('vencida');
        expect(situacaoDaCobranca({ status: 'approved', vencimento: '2026-11-15T02:59:59Z' }, agora).chave).toBe('paga');
        expect(situacaoDaCobranca({ status: 'cancelled', baixaManual: { em: new Date() } }, agora).chave).toBe('paga');
        expect(situacaoDaCobranca({ status: 'cancelled' }, agora).chave).toBe('cancelada');
    });
});

describe('e-mail do boleto da concessionária', () => {
    const base = { customerName: 'Central Veículos Ltda', planName: 'x', amount: 350, dueDate: new Date('2026-11-20T12:00:00Z'), boletoUrl: 'https://mp/boleto', barcode: '2379' };

    it('fala do que está sendo cobrado, não de renovação de plano', () => {
        const { text, html } = buildBoletoEmail({ ...base, descricao: 'Taxa de adesão' });
        expect(text).toContain('Geramos um boleto referente a: Taxa de adesão');
        expect(text).not.toContain('renovação');
        expect(html).not.toContain('renovação');
    });

    it('a descrição digitada pela equipe não vira HTML', () => {
        expect(buildBoletoEmail({ ...base, descricao: '<img src=x onerror=alert(1)>' }).html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    });

    it('sem descrição, o e-mail do lojista continua igual', () => {
        const { text, html } = buildBoletoEmail({ ...base, planName: 'Acesso Total 0KM' });
        expect(text).toContain('Geramos o boleto de renovação do plano Acesso Total 0KM');
        expect(html).toContain('Boleto de renovação CNV');
    });
});
