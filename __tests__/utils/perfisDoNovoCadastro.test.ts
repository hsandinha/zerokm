import { describe, expect, it } from 'vitest';
import { perfisRestritosDoCriador, podeCadastrar, podeCriarLoginDeLoja, tiposDeCadastroDoPerfil } from '@/lib/utils/perfisDoNovoCadastro';

describe('quem vê cada opção do Novo cadastro', () => {
    it('administrador vê as três, na ordem da tela', () => {
        expect(tiposDeCadastroDoPerfil('administrador')).toEqual(['concessionaria', 'lojista', 'equipe']);
        expect(tiposDeCadastroDoPerfil('admin')).toEqual(['concessionaria', 'lojista', 'equipe']);
    });

    it('administrativo cria equipe e concessionária, mas não lojista (as rotas do CRM recusam)', () => {
        expect(tiposDeCadastroDoPerfil('administrativo')).toEqual(['concessionaria', 'equipe']);
    });

    it('gerente, operador e vendedor só cadastram concessionária', () => {
        for (const perfil of ['gerente', 'operador', 'operator', 'vendedor']) {
            expect(tiposDeCadastroDoPerfil(perfil)).toEqual(['concessionaria']);
        }
    });

    it('marketing, concessionária, cliente e quem não tem sessão não veem nada', () => {
        for (const perfil of ['marketing', 'concessionaria', 'dealership', 'cliente', 'gratis', '', null, undefined]) {
            expect(tiposDeCadastroDoPerfil(perfil)).toEqual([]);
        }
    });

    it('lojista segue as rotas do CRM: só administrador', () => {
        expect(podeCadastrar('lojista', 'administrador')).toBe(true);
        expect(podeCadastrar('lojista', 'gerente')).toBe(false);
        expect(podeCadastrar('lojista', 'administrativo')).toBe(false);
    });

    it('equipe e login de loja seguem canManageUsers', () => {
        for (const perfil of ['admin', 'administrador', 'administrativo']) {
            expect(podeCadastrar('equipe', perfil)).toBe(true);
            expect(podeCriarLoginDeLoja(perfil)).toBe(true);
        }
        for (const perfil of ['gerente', 'operador', 'vendedor', 'marketing', null]) {
            expect(podeCadastrar('equipe', perfil)).toBe(false);
            expect(podeCriarLoginDeLoja(perfil)).toBe(false);
        }
    });

    it('administrativo não concede o perfil administrador', () => {
        expect(perfisRestritosDoCriador('administrativo')).toEqual(['administrador']);
        expect(perfisRestritosDoCriador('administrador')).toEqual([]);
    });
});
