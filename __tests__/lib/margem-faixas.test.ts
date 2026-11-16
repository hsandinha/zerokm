// Margem por faixa de preço (lib/utils/margem.ts) e a leitura do formulário
// (components/operator/MargemFaixas.tsx).
import { describe, expect, it } from 'vitest';
import { aplicarMargem, faixaDoPreco, faixasSalvas, rotuloDaFaixa, validarFaixas, type FaixaDeMargem } from '@/lib/utils/margem';
import { faixasDaEdicao, lerNumero } from '@/components/operator/MargemFaixas';

// O exemplo do pedido: até 100 mil sobe 5%; de 100 a 300 mil sobe R$ 2.000.
const faixas: FaixaDeMargem[] = [
    { ate: 100_000, tipo: 'percent', valor: 5 },
    { ate: 300_000, tipo: 'fixed', valor: 2000 },
];
const geral = { margem: 3, marginMode: 'percent' as const, fixedMargin: 0 };

describe('aplicarMargem', () => {
    it('sem faixas vale a margem geral, em % ou em valor fixo', () => {
        expect(aplicarMargem(100_000, geral)).toBe(103_000);
        expect(aplicarMargem(100_000, { margem: 3, marginMode: 'fixed', fixedMargin: 1500 })).toBe(101_500);
        expect(aplicarMargem(undefined, geral)).toBe(0);
    });

    it('cada preço usa a faixa em que cai; o teto é inclusive', () => {
        const cfg = { ...geral, faixas };
        expect(aplicarMargem(80_000, cfg)).toBe(84_000);
        expect(aplicarMargem(100_000, cfg)).toBe(105_000);
        expect(aplicarMargem(100_000.01, cfg)).toBeCloseTo(102_000.01, 2);
        expect(aplicarMargem(300_000, cfg)).toBe(302_000);
    });

    it('acima da última faixa volta para a margem geral', () => {
        expect(aplicarMargem(400_000, { ...geral, faixas })).toBe(412_000);
    });

    it('não depende da ordem em que as faixas chegam', () => {
        const invertidas = [...faixas].reverse();
        expect(faixaDoPreco(50_000, invertidas)?.ate).toBe(100_000);
        expect(aplicarMargem(50_000, { ...geral, faixas: invertidas })).toBe(52_500);
    });
});

describe('validarFaixas', () => {
    it('ordena pelo teto e aceita lista vazia ou ausente', () => {
        expect(validarFaixas([...faixas].reverse())).toEqual({ faixas });
        expect(validarFaixas(undefined)).toEqual({ faixas: [] });
        expect(validarFaixas([])).toEqual({ faixas: [] });
    });

    it('recusa teto repetido, percentual acima de 100, valor negativo e tipo estranho', () => {
        expect(validarFaixas([{ ate: 1, tipo: 'percent', valor: 1 }, { ate: 1, tipo: 'fixed', valor: 2 }])).toHaveProperty('erro');
        expect(validarFaixas([{ ate: 1, tipo: 'percent', valor: 101 }])).toHaveProperty('erro');
        expect(validarFaixas([{ ate: 1, tipo: 'fixed', valor: -1 }])).toHaveProperty('erro');
        expect(validarFaixas([{ ate: 1, tipo: 'outro', valor: 1 }])).toHaveProperty('erro');
        expect(validarFaixas([{ ate: 0, tipo: 'fixed', valor: 1 }])).toHaveProperty('erro');
        expect(validarFaixas('x')).toHaveProperty('erro');
        expect(validarFaixas(Array.from({ length: 13 }, (_, i) => ({ ate: i + 1, tipo: 'fixed', valor: 1 })))).toHaveProperty('erro');
    });

    it('o que vem do banco estragado vira lista vazia, sem quebrar a tela', () => {
        expect(faixasSalvas([{ ate: 'abc' }])).toEqual([]);
        expect(faixasSalvas(faixas)).toEqual(faixas);
    });
});

describe('rótulos', () => {
    it('a primeira é "Até", as seguintes "De ... até ..."', () => {
        expect(rotuloDaFaixa(faixas, 0)).toBe('Até R$ 100.000');
        expect(rotuloDaFaixa(faixas, 1)).toBe('De R$ 100.000 até R$ 300.000');
    });
});

describe('formulário', () => {
    it('lê número digitado à brasileira', () => {
        expect(lerNumero('100.000')).toBe(100000);
        expect(lerNumero('100.000,50')).toBe(100000.5);
        expect(lerNumero('100000')).toBe(100000);
        expect(lerNumero('4.5')).toBe(4.5);
        expect(lerNumero('4,5')).toBe(4.5);
        expect(lerNumero('1.000.000')).toBe(1000000);
        expect(lerNumero('')).toBeNull();
        expect(lerNumero('1,2,3')).toBeNull();
    });

    it('linhas viram faixas ordenadas; linha vazia é ignorada; linha pela metade é erro', () => {
        const l = (ate: string, tipo: 'percent' | 'fixed', valor: string) => ({ id: ate + valor, ate, tipo, valor });
        expect(faixasDaEdicao([l('300.000', 'fixed', '2.000'), l('', 'percent', ''), l('100.000', 'percent', '5')])).toEqual({ faixas });
        expect(faixasDaEdicao([l('100.000', 'percent', '')])).toHaveProperty('erro');
        expect(faixasDaEdicao([l('', 'percent', '5')])).toHaveProperty('erro');
        expect(faixasDaEdicao([l('100.000', 'percent', '150')])).toHaveProperty('erro');
    });
});
