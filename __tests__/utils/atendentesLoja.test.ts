import { describe, expect, it } from 'vitest';
import {
    LIMITE_ATENDENTES_MAXIMO, LIMITE_ATENDENTES_PADRAO, MSG_ACESSO_DESATIVADO, MSG_SO_TITULAR,
    acessoLiberado, ehAtendenteDaLoja, gerarSenhaProvisoria, limiteDeAtendentes, lojaQueGerencia, msgLimiteAtingido,
    nomeDeQuemAtualizou, normalizarLimite, papelDoUsuario, podeNaLoja, recusaDeEmailEmUso, recusaDoTitular,
    temVagaDeAtendente, validarAtendente,
} from '@/lib/utils/atendentesLoja';

const LOJA = '507f1f77bcf86cd799439011';
const OUTRA = '507f1f77bcf86cd799439022';
const titular = { dealershipId: LOJA };
const atendente = { dealershipId: LOJA, papelLoja: 'atendente' };
const desativado = { dealershipId: LOJA, papelLoja: 'atendente', atendenteInativo: true };

describe('papel na concessionária', () => {
    it('usuário antigo, sem o campo, é titular', () => {
        expect(papelDoUsuario({})).toBe('titular');
        expect(papelDoUsuario({ papelLoja: 'titular' })).toBe('titular');
        expect(papelDoUsuario({ papelLoja: 'qualquer' })).toBe('titular');
        expect(papelDoUsuario(atendente)).toBe('atendente');
    });

    it.each(['gerenciar-atendentes', 'cobranca', 'dados-cadastrais', 'integracoes'] as const)('%s é só do titular', acao => {
        expect(podeNaLoja('titular', acao)).toBe(true);
        expect(podeNaLoja('atendente', acao)).toBe(false);
    });

    it('atendente desativado perde o acesso; titular nunca é desativado por este campo', () => {
        expect(acessoLiberado(atendente)).toBe(true);
        expect(acessoLiberado(desativado)).toBe(false);
        expect(acessoLiberado({ atendenteInativo: true })).toBe(true);
        expect(acessoLiberado(null)).toBe(false);
    });
});

describe('trava das rotas do titular', () => {
    it('não interfere nos outros perfis', () => {
        expect(recusaDoTitular('administrador', null, 'cobranca')).toBeNull();
        expect(recusaDoTitular('cliente', null, 'cobranca')).toBeNull();
        expect(recusaDoTitular(undefined, null, 'cobranca')).toBeNull();
    });

    it.each(['concessionaria', 'dealership'])('perfil %s: titular passa, atendente recebe 403', perfil => {
        expect(recusaDoTitular(perfil, titular, 'cobranca')).toBeNull();
        expect(recusaDoTitular(perfil, atendente, 'cobranca')).toEqual({ status: 403, error: MSG_SO_TITULAR });
        expect(recusaDoTitular(perfil, atendente, 'dados-cadastrais')?.status).toBe(403);
        expect(recusaDoTitular(perfil, desativado, 'integracoes')).toEqual({ status: 403, error: MSG_ACESSO_DESATIVADO });
    });

    it('perfil de loja sem concessionária vinculada não passa', () => {
        expect(recusaDoTitular('concessionaria', null, 'cobranca')?.status).toBe(403);
        expect(recusaDoTitular('concessionaria', {}, 'cobranca')?.status).toBe(403);
    });
});

describe('quem gerencia atendentes, e de qual loja', () => {
    it.each(['admin', 'administrador', 'administrativo'])('equipe do CNV (%s) gerencia a loja que pedir', perfil => {
        expect(lojaQueGerencia({ perfil, concessionariaPedida: OUTRA })).toEqual({ ok: true, concessionariaId: OUTRA, comoEquipeCnv: true });
        expect(lojaQueGerencia({ perfil, concessionariaPedida: '  ' })).toMatchObject({ ok: false, status: 400 });
    });

    it('titular gerencia só a própria loja: o id pedido é ignorado', () => {
        expect(lojaQueGerencia({ perfil: 'concessionaria', usuario: titular, concessionariaPedida: OUTRA }))
            .toEqual({ ok: true, concessionariaId: LOJA, comoEquipeCnv: false });
    });

    it('atendente não gerencia atendentes, nem os da própria loja', () => {
        expect(lojaQueGerencia({ perfil: 'concessionaria', usuario: atendente })).toEqual({ ok: false, status: 403, error: MSG_SO_TITULAR });
        expect(lojaQueGerencia({ perfil: 'concessionaria', usuario: atendente, concessionariaPedida: OUTRA })).toMatchObject({ ok: false, status: 403 });
        expect(lojaQueGerencia({ perfil: 'concessionaria', usuario: desativado })).toMatchObject({ ok: false, status: 403, error: MSG_ACESSO_DESATIVADO });
    });

    it.each(['cliente', 'gratis', 'operador', 'vendedor', 'gerente', '', undefined])('perfil %s não gerencia', perfil => {
        expect(lojaQueGerencia({ perfil, usuario: titular, concessionariaPedida: LOJA })).toMatchObject({ ok: false, status: 403 });
    });

    it('perfil de loja sem vínculo: 404', () => {
        expect(lojaQueGerencia({ perfil: 'concessionaria', usuario: null })).toMatchObject({ ok: false, status: 404 });
    });

    it('só atendente DESTA loja pode ser editado ou removido', () => {
        expect(ehAtendenteDaLoja(atendente, LOJA)).toBe(true);
        expect(ehAtendenteDaLoja(atendente, OUTRA)).toBe(false);
        expect(ehAtendenteDaLoja(titular, LOJA)).toBe(false);
        expect(ehAtendenteDaLoja({ papelLoja: 'atendente' }, LOJA)).toBe(false);
        expect(ehAtendenteDaLoja(null, LOJA)).toBe(false);
        expect(ehAtendenteDaLoja(atendente, '')).toBe(false);
    });
});

describe('limite de atendentes', () => {
    it('padrão de 5 quando a concessionária não tem o campo (ou ele é inválido)', () => {
        expect(LIMITE_ATENDENTES_PADRAO).toBe(5);
        expect(limiteDeAtendentes(null)).toBe(5);
        expect(limiteDeAtendentes({})).toBe(5);
        expect(limiteDeAtendentes({ limiteAtendentes: -1 })).toBe(5);
        expect(limiteDeAtendentes({ limiteAtendentes: '8' })).toBe(5);
        expect(limiteDeAtendentes({ limiteAtendentes: NaN })).toBe(5);
    });

    it('respeita o valor do admin, inclusive zero, e o teto', () => {
        expect(limiteDeAtendentes({ limiteAtendentes: 0 })).toBe(0);
        expect(limiteDeAtendentes({ limiteAtendentes: 12 })).toBe(12);
        expect(limiteDeAtendentes({ limiteAtendentes: 2.9 })).toBe(2);
        expect(limiteDeAtendentes({ limiteAtendentes: 9999 })).toBe(LIMITE_ATENDENTES_MAXIMO);
    });

    it('valida o campo do admin', () => {
        expect(normalizarLimite('7')).toBe(7);
        expect(normalizarLimite(0)).toBe(0);
        expect(normalizarLimite(LIMITE_ATENDENTES_MAXIMO)).toBe(LIMITE_ATENDENTES_MAXIMO);
        for (const invalido of ['', null, undefined, 'abc', -1, 2.5, LIMITE_ATENDENTES_MAXIMO + 1, true]) {
            expect(normalizarLimite(invalido)).toBeNull();
        }
    });

    it('tem vaga enquanto os ativos são menos que o limite', () => {
        expect(temVagaDeAtendente(4, 5)).toBe(true);
        expect(temVagaDeAtendente(5, 5)).toBe(false);
        expect(temVagaDeAtendente(6, 5)).toBe(false);
        expect(temVagaDeAtendente(0, 0)).toBe(false);
    });

    it('mensagem do limite', () => {
        expect(msgLimiteAtingido(5)).toContain('5 atendentes ativos');
        expect(msgLimiteAtingido(1)).toContain('1 atendente ativo');
        expect(msgLimiteAtingido(0)).toContain('não tem atendentes liberados');
    });
});

describe('e-mail do atendente novo', () => {
    it('e-mail livre passa', () => {
        expect(recusaDeEmailEmUso(null, LOJA)).toBeNull();
    });

    it('recusa e-mail de qualquer outro cadastro, dizendo de quem é', () => {
        expect(recusaDeEmailEmUso({ allowedProfiles: ['cliente'] }, LOJA)).toContain('perfil lojista');
        expect(recusaDeEmailEmUso({ allowedProfiles: ['gratis'] }, LOJA)).toContain('perfil lojista');
        expect(recusaDeEmailEmUso({ allowedProfiles: ['administrador'] }, LOJA)).toContain('perfil administrador');
        expect(recusaDeEmailEmUso({ allowedProfiles: ['vendedor'] }, LOJA)).toContain('perfil vendedor');
        expect(recusaDeEmailEmUso({ allowedProfiles: [] }, LOJA)).toContain('já tem cadastro no CNV');
        expect(recusaDeEmailEmUso({ dealershipId: OUTRA, allowedProfiles: ['concessionaria'] }, LOJA)).toContain('outra concessionária');
        expect(recusaDeEmailEmUso(titular, LOJA)).toContain('titular desta concessionária');
        expect(recusaDeEmailEmUso(atendente, LOJA)).toContain('atendente desta concessionária');
    });

    it('mensagens novas não usam travessão', () => {
        const textos = [
            recusaDeEmailEmUso({ allowedProfiles: ['cliente'] }, LOJA), recusaDeEmailEmUso(titular, LOJA),
            msgLimiteAtingido(5), msgLimiteAtingido(0), MSG_SO_TITULAR, MSG_ACESSO_DESATIVADO,
        ];
        for (const t of textos) expect(t).not.toContain('—');
    });
});

describe('formulário do atendente', () => {
    it('limpa nome, e-mail e telefone', () => {
        expect(validarAtendente({ nome: '  Ana   Paula ', email: ' Ana@Loja.com ', telefone: '(31) 99999-0000' }))
            .toEqual({ ok: true, dados: { nome: 'Ana Paula', email: 'ana@loja.com', telefone: '31999990000' } });
    });

    it('recusa nome vazio, e-mail inválido e telefone incompleto', () => {
        expect(validarAtendente({ nome: '', email: 'a@b.com' })).toMatchObject({ ok: false });
        expect(validarAtendente({ nome: 'Ana', email: 'sem-arroba' })).toMatchObject({ ok: false, error: 'E-mail inválido.' });
        expect(validarAtendente({ nome: 'Ana', email: 'a@b.com', telefone: '9999' })).toMatchObject({ ok: false });
        expect(validarAtendente({ nome: 'x'.repeat(81), email: 'a@b.com' })).toMatchObject({ ok: false });
        expect(validarAtendente(null)).toMatchObject({ ok: false });
    });

    it('na edição o e-mail não é exigido (é o login e não muda)', () => {
        expect(validarAtendente({ nome: 'Ana' }, { exigirEmail: false })).toMatchObject({ ok: true });
    });
});

describe('apoio', () => {
    it('senha provisória no formato dos convidados', () => {
        const senha = gerarSenhaProvisoria();
        expect(senha).toMatch(/^CNV@[A-HJ-NP-Za-hjkmnp-z2-9]{6}$/);
        expect(gerarSenhaProvisoria(() => 0)).toBe('CNV@AAAAAA');
    });

    it('nome de quem atualizou: nome, senão e-mail', () => {
        expect(nomeDeQuemAtualizou({ name: ' Ana ', email: 'a@b.com' })).toBe('Ana');
        expect(nomeDeQuemAtualizou({ name: '', email: 'a@b.com' })).toBe('a@b.com');
        expect(nomeDeQuemAtualizou(null)).toBeUndefined();
    });
});
