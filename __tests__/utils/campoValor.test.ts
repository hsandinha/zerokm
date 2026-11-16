import { describe, expect, it } from 'vitest';
import { aplicarEdicao, formatarAoDigitar, lerValor, valorParaCampo } from '../../lib/utils/campoValor';

describe('formatarAoDigitar', () => {
    it('põe o ponto de milhar enquanto digita', () => {
        expect(formatarAoDigitar('1')).toBe('1');
        expect(formatarAoDigitar('1000')).toBe('1.000');
        expect(formatarAoDigitar('10000')).toBe('10.000');
        expect(formatarAoDigitar('1234567')).toBe('1.234.567');
    });

    it('aceita vírgula e até duas casas', () => {
        expect(formatarAoDigitar('10000,')).toBe('10.000,');
        expect(formatarAoDigitar('10000,5')).toBe('10.000,5');
        expect(formatarAoDigitar('10000,555')).toBe('10.000,55');
        expect(formatarAoDigitar(',5')).toBe('0,5');
    });

    it('ignora letras, R$ e pontos digitados, e uma segunda vírgula', () => {
        expect(formatarAoDigitar('R$ 72.900,00')).toBe('72.900,00');
        expect(formatarAoDigitar('1.0.0.0')).toBe('1.000');
        expect(formatarAoDigitar('1,2,3')).toBe('1,23');
        expect(formatarAoDigitar('abc')).toBe('');
    });

    it('sem casas decimais (km, quantidade), descarta a vírgula', () => {
        expect(formatarAoDigitar('48500', 0)).toBe('48.500');
        expect(formatarAoDigitar('48500,9', 0)).toBe('48.500');
    });

    it('tira zero à esquerda', () => {
        expect(formatarAoDigitar('0005')).toBe('5');
        expect(formatarAoDigitar('0')).toBe('0');
    });
});

describe('lerValor', () => {
    it('lê o texto formatado', () => {
        expect(lerValor('10.000')).toBe(10000);
        expect(lerValor('10.000,50')).toBe(10000.5);
        expect(lerValor('R$ 72.900,00')).toBe(72900);
        expect(lerValor('0,5')).toBe(0.5);
    });

    it('entende número antigo em texto', () => {
        expect(lerValor('699.9')).toBe(699.9);
        expect(lerValor('1500')).toBe(1500);
        expect(lerValor('100.00')).toBe(100);
        expect(lerValor(250)).toBe(250);
    });

    it('vazio ou sem número dá null', () => {
        expect(lerValor('')).toBeNull();
        expect(lerValor('   ')).toBeNull();
        expect(lerValor('abc')).toBeNull();
        expect(lerValor(null)).toBeNull();
        expect(lerValor(undefined)).toBeNull();
    });
});

describe('valorParaCampo', () => {
    it('formata o número salvo para abrir no campo', () => {
        expect(valorParaCampo(10000)).toBe('10.000');
        expect(valorParaCampo(699.9)).toBe('699,90');
        expect(valorParaCampo(1234567.891)).toBe('1.234.567,89');
        expect(valorParaCampo(48500.4, 0)).toBe('48.500');
        expect(valorParaCampo(0)).toBe('0');
        expect(valorParaCampo(null)).toBe('');
        expect(valorParaCampo(undefined)).toBe('');
    });

    it('ida e volta não muda o número', () => {
        for (const n of [0.5, 9.9, 100, 1500.25, 72900, 1234567.89]) {
            expect(lerValor(valorParaCampo(n))).toBe(n);
        }
    });
});

describe('aplicarEdicao (cursor e teclas)', () => {
    it('digitando no fim, o cursor fica no fim', () => {
        expect(aplicarEdicao({ bruto: '1.0000', cursor: 6, anterior: '1.000', tipo: 'insertText', digitado: '0' }))
            .toEqual({ texto: '10.000', cursor: 6 });
    });

    it('digitando no meio, o cursor fica depois do dígito digitado', () => {
        // "1.|000" + "5" → "15.000" e o cursor depois do 5.
        expect(aplicarEdicao({ bruto: '1.5000', cursor: 3, anterior: '1.000', tipo: 'insertText', digitado: '5' }))
            .toEqual({ texto: '15.000', cursor: 2 });
    });

    it('ponto digitado vira vírgula', () => {
        expect(aplicarEdicao({ bruto: '10.', cursor: 3, anterior: '10', tipo: 'insertText', digitado: '.' }).texto).toBe('10,');
    });

    it('ponto digitado depois que já existe vírgula é ignorado', () => {
        expect(aplicarEdicao({ bruto: '10,5.', cursor: 5, anterior: '10,5', tipo: 'insertText', digitado: '.' }).texto).toBe('10,5');
    });

    it('sem casas decimais, ponto digitado não vira vírgula', () => {
        expect(aplicarEdicao({ bruto: '48.', cursor: 3, anterior: '48', tipo: 'insertText', digitado: '.', decimais: 0 }).texto).toBe('48');
    });

    it('backspace logo depois do ponto apaga o dígito de antes', () => {
        // "10.|000" + backspace apaga o ponto: o certo é apagar o 0 → "1.000".
        expect(aplicarEdicao({ bruto: '10000', cursor: 2, anterior: '10.000', tipo: 'deleteContentBackward' }))
            .toEqual({ texto: '1.000', cursor: 1 });
    });

    it('delete logo antes do ponto apaga o dígito de depois', () => {
        // "10|.000" + delete apaga o ponto: o certo é apagar o 0 seguinte → "1.000".
        expect(aplicarEdicao({ bruto: '10000', cursor: 2, anterior: '10.000', tipo: 'deleteContentForward' }).texto).toBe('1.000');
    });

    it('apagando do fim, o ponto sai quando fica abaixo de mil', () => {
        expect(aplicarEdicao({ bruto: '1.00', cursor: 4, anterior: '1.000', tipo: 'deleteContentBackward' }))
            .toEqual({ texto: '100', cursor: 3 });
    });

    it('zero à esquerda some e o cursor acompanha', () => {
        expect(aplicarEdicao({ bruto: '05', cursor: 2, anterior: '0', tipo: 'insertText', digitado: '5' }))
            .toEqual({ texto: '5', cursor: 1 });
    });

    it('colar um valor com R$ formata tudo', () => {
        expect(aplicarEdicao({ bruto: 'R$ 72900,00', cursor: 11, anterior: '', tipo: 'insertFromPaste' }).texto).toBe('72.900,00');
    });
});
