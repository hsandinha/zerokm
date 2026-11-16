// O perfil da sessão vem do cadastro, não do navegador (lib/utils/perfilDaSessao).
import { describe, expect, it } from 'vitest';
import { perfilDaSessao, trocaDePerfilValida } from '@/lib/utils/perfilDaSessao';

describe('perfilDaSessao', () => {
    it('aceita o perfil pedido quando o usuário o tem, com os apelidos', () => {
        expect(perfilDaSessao('concessionaria', ['concessionaria'])).toBe('concessionaria');
        expect(perfilDaSessao('dealership', ['concessionaria'])).toBe('concessionaria');
        expect(perfilDaSessao('operator', ['operador', 'vendedor'])).toBe('operador');
    });

    it('perfil que o usuário não tem cai no primeiro que ele tem', () => {
        expect(perfilDaSessao('administrador', ['concessionaria'])).toBe('concessionaria');
        expect(perfilDaSessao('operador', ['gratis'])).toBe('gratis');
        expect(perfilDaSessao(undefined, ['cliente', 'concessionaria'])).toBe('cliente');
    });

    it('sem perfil no cadastro, não entra', () => {
        expect(perfilDaSessao('operador', [])).toBeNull();
        expect(perfilDaSessao('administrador', undefined)).toBeNull();
        expect(perfilDaSessao(undefined, null)).toBeNull();
    });
});

describe('trocaDePerfilValida', () => {
    it('só troca para um perfil que o usuário tem', () => {
        expect(trocaDePerfilValida('cliente', ['gratis', 'cliente'])).toBe('cliente');
        expect(trocaDePerfilValida('administrador', ['concessionaria'])).toBeNull();
        expect(trocaDePerfilValida('', ['concessionaria'])).toBeNull();
        expect(trocaDePerfilValida('gerente', ['gerente'])).toBe('gerente');
    });
});
