import { describe, expect, it } from 'vitest';
import { linkInstagram, normalizarInstagram } from '@/lib/utils/instagram';

describe('instagram do cadastro', () => {
    it('aceita @, usuário puro e link do perfil', () => {
        expect(normalizarInstagram('@Loja.Auto')).toBe('@loja.auto');
        expect(normalizarInstagram('loja_auto')).toBe('@loja_auto');
        expect(normalizarInstagram('https://www.instagram.com/lojaauto/?igsh=abc')).toBe('@lojaauto');
        expect(normalizarInstagram('instagram.com/lojaauto')).toBe('@lojaauto');
    });

    it('recusa vazio e usuário inválido', () => {
        expect(normalizarInstagram('')).toBeNull();
        expect(normalizarInstagram('   ')).toBeNull();
        expect(normalizarInstagram('loja auto')).toBeNull();
        expect(normalizarInstagram('.loja')).toBeNull();
        expect(normalizarInstagram('loja..auto')).toBeNull();
        expect(normalizarInstagram('https://instagram.com/p/abc')).toBeNull();
        expect(normalizarInstagram(undefined)).toBeNull();
    });

    it('monta o link do perfil', () => {
        expect(linkInstagram('@lojaauto')).toBe('https://instagram.com/lojaauto');
        expect(linkInstagram('')).toBeNull();
    });
});
