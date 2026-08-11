import { describe, expect, it } from 'vitest';
import { parsePrazo, formatPrazo, prazoParaInput } from '@/lib/utils/prazo';

describe('parsePrazo', () => {
    it('entende pronta entrega como zero', () => {
        expect(parsePrazo('Pronta Entrega')).toBe(0);
        expect(parsePrazo('pronta entrega')).toBe(0);
        expect(parsePrazo('  PRONTA  ')).toBe(0);
        expect(parsePrazo('0')).toBe(0);
    });

    it('entende número de dias', () => {
        expect(parsePrazo('30')).toBe(30);
        expect(parsePrazo(' 45 ')).toBe(45);
    });

    it('devolve null para vazio ou texto sem número', () => {
        expect(parsePrazo('')).toBeNull();
        expect(parsePrazo('   ')).toBeNull();
        expect(parsePrazo(undefined)).toBeNull();
        expect(parsePrazo(null)).toBeNull();
        expect(parsePrazo('qualquer coisa')).toBeNull();
    });

    it('recusa prazo negativo', () => {
        expect(parsePrazo('-5')).toBeNull();
    });
});

describe('formatPrazo', () => {
    it('mostra pronta entrega, dias ou traço', () => {
        expect(formatPrazo(0)).toBe('Pronta Entrega');
        expect(formatPrazo(30)).toBe('30 dias');
        expect(formatPrazo(null)).toBe('-');
        expect(formatPrazo(undefined)).toBe('-');
    });
});

describe('prazoParaInput', () => {
    it('preenche o campo com o texto que o usuário digitaria de volta', () => {
        expect(prazoParaInput(0)).toBe('Pronta Entrega');
        expect(prazoParaInput(30)).toBe('30');
        expect(prazoParaInput(null)).toBe('');
    });

    it('faz o caminho de ida e volta sem perder o valor', () => {
        for (const valor of [0, 15, 60, null]) {
            expect(parsePrazo(prazoParaInput(valor))).toBe(valor);
        }
    });
});
