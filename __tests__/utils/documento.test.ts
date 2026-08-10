import { describe, expect, it } from 'vitest';
import { validateCPF, validateCNPJ, validateDocumento } from '@/lib/utils/cpf';

describe('validateCPF', () => {
    it('aceita CPF válido com e sem máscara', () => {
        expect(validateCPF('529.982.247-25')).toBe(true);
        expect(validateCPF('52998224725')).toBe(true);
    });

    it('recusa sequências repetidas — o caso que mais passava no cadastro', () => {
        for (const cpf of ['11111111111', '00000000000', '99999999999']) {
            expect(validateCPF(cpf)).toBe(false);
        }
    });

    it('recusa dígito verificador errado', () => {
        expect(validateCPF('529.982.247-26')).toBe(false);
        expect(validateCPF('12345678901')).toBe(false);
    });

    it('recusa quantidade de dígitos diferente de 11', () => {
        expect(validateCPF('5299822472')).toBe(false);
        expect(validateCPF('529982247250')).toBe(false);
        expect(validateCPF('')).toBe(false);
    });
});

describe('validateCNPJ', () => {
    it('aceita CNPJ válido com e sem máscara', () => {
        expect(validateCNPJ('11.222.333/0001-81')).toBe(true);
        expect(validateCNPJ('11222333000181')).toBe(true);
        // O CNPJ que o lojista informou pelo WhatsApp
        expect(validateCNPJ('28.806.895/0001-75')).toBe(true);
    });

    it('recusa sequências repetidas', () => {
        expect(validateCNPJ('11111111111111')).toBe(false);
        expect(validateCNPJ('00000000000000')).toBe(false);
    });

    it('recusa dígito verificador errado', () => {
        expect(validateCNPJ('11.222.333/0001-82')).toBe(false);
        expect(validateCNPJ('12345678000100')).toBe(false);
    });

    it('recusa quantidade de dígitos diferente de 14', () => {
        expect(validateCNPJ('1122233300018')).toBe(false);
        expect(validateCNPJ('112223330001812')).toBe(false);
    });
});

describe('validateDocumento', () => {
    it('devolve null quando o documento está correto', () => {
        expect(validateDocumento('pf', '529.982.247-25')).toBeNull();
        expect(validateDocumento('pj', '11.222.333/0001-81')).toBeNull();
    });

    it('distingue tamanho errado de dígito verificador errado', () => {
        expect(validateDocumento('pf', '5299822472')).toMatch(/11 dígitos/);
        expect(validateDocumento('pf', '11111111111')).toMatch(/inválido/);
        expect(validateDocumento('pj', '112223330001')).toMatch(/14 dígitos/);
        expect(validateDocumento('pj', '11222333000182')).toMatch(/inválido/);
    });

    it('cobra o documento do tipo certo', () => {
        // CPF válido não serve como CNPJ e vice-versa
        expect(validateDocumento('pj', '52998224725')).toMatch(/14 dígitos/);
        expect(validateDocumento('pf', '11222333000181')).toMatch(/11 dígitos/);
    });
});
