// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { updateOne } = vi.hoisted(() => ({ updateOne: vi.fn() }));
vi.mock('@/models/RepasseVehicle', () => ({ default: { updateOne } }));

import { consultarPrecoFipe, precisaDeFipe, preencherFipeFaltante } from '@/lib/services/repasseFipe';

const AGORA = new Date('2026-11-16T12:00:00Z').getTime();
const onix = { _id: 'r1', tipoVeiculo: 'carro', codigoFipe: '004099-6', anoModelo: 2020, combustivel: 'Flex' };

/** FIPE de mentira: lista de anos pelo código e o detalhe do ano. */
function fipeFalsa(preco = 'R$ 58.000,00') {
    return vi.fn(async (params: URLSearchParams) => {
        if (params.get('year')) {
            return { brand: 'GM', model: 'Onix', modelYear: 2020, fuel: 'Gasolina', codeFipe: '004099-6', referenceMonth: 'novembro de 2026 ', price: preco };
        }
        return [{ code: '32000-1', name: 'Zero km' }, { code: '2020-1', name: '2020 Gasolina' }];
    });
}

beforeEach(() => {
    updateOne.mockReset();
    updateOne.mockResolvedValue({ modifiedCount: 1 });
});

describe('repasse antigo sem preço FIPE: preenchimento sob demanda', () => {
    it('só busca quem tem código e ano, não tem preço e não foi tentado hoje', () => {
        expect(precisaDeFipe(onix, AGORA)).toBe(true);
        expect(precisaDeFipe({ ...onix, precoFipe: 58000 }, AGORA)).toBe(false);
        expect(precisaDeFipe({ ...onix, codigoFipe: '' }, AGORA)).toBe(false);
        expect(precisaDeFipe({ ...onix, anoModelo: undefined }, AGORA)).toBe(false);
        expect(precisaDeFipe({ ...onix, fipeTentativaEm: new Date(AGORA - 3600e3) }, AGORA)).toBe(false);
        expect(precisaDeFipe({ ...onix, fipeTentativaEm: new Date(AGORA - 25 * 3600e3) }, AGORA)).toBe(true);
    });

    it('consulta os anos do código e depois o preço do ano-modelo do carro', async () => {
        const fipe = fipeFalsa();
        await expect(consultarPrecoFipe(onix, fipe)).resolves.toEqual({ precoFipe: 58000, referenciaFipe: 'novembro de 2026' });
        expect(fipe).toHaveBeenCalledTimes(2);
        expect(fipe.mock.calls[0][0].toString()).toBe('type=cars&code=004099-6');
        expect(fipe.mock.calls[1][0].get('year')).toBe('2020-1');
    });

    it('ano que a FIPE não lista fica sem preço e não consulta o detalhe', async () => {
        const fipe = fipeFalsa();
        await expect(consultarPrecoFipe({ ...onix, anoModelo: 2015 }, fipe)).resolves.toBeNull();
        expect(fipe).toHaveBeenCalledTimes(1);
    });

    it('grava o preço sem mexer em updatedAt e respeita o teto por listagem', async () => {
        const fipe = fipeFalsa();
        const muitos = Array.from({ length: 12 }, (_, i) => ({ ...onix, _id: `r${i}` }));
        await expect(preencherFipeFaltante(muitos, fipe)).resolves.toBe(5);
        // 5 carros: reserva da tentativa + gravação do preço para cada um.
        expect(updateOne).toHaveBeenCalledTimes(10);
        for (const [, , opcoes] of updateOne.mock.calls) expect(opcoes).toEqual({ timestamps: false });
        expect(updateOne.mock.calls[1][1]).toEqual({ $set: { precoFipe: 58000, referenciaFipe: 'novembro de 2026' } });
        expect(fipe).toHaveBeenCalledTimes(10);
    });

    it('carro já reservado por outra listagem não é consultado de novo', async () => {
        updateOne.mockResolvedValue({ modifiedCount: 0 });
        const fipe = fipeFalsa();
        await expect(preencherFipeFaltante([onix], fipe)).resolves.toBe(0);
        expect(fipe).not.toHaveBeenCalled();
    });

    it('FIPE fora do ar: para na primeira falha, sem derrubar nada', async () => {
        const fipe = vi.fn(async () => { throw new Error('Limite de consultas FIPE atingido.'); });
        const aviso = vi.spyOn(console, 'warn').mockImplementation(() => { });
        await expect(preencherFipeFaltante([onix, { ...onix, _id: 'r2' }], fipe)).resolves.toBe(0);
        expect(fipe).toHaveBeenCalledTimes(1);
        aviso.mockRestore();
    });

    it('quem já tem preço FIPE não gera consulta nenhuma', async () => {
        const fipe = fipeFalsa();
        await expect(preencherFipeFaltante([{ ...onix, precoFipe: 58000 }], fipe)).resolves.toBe(0);
        expect(fipe).not.toHaveBeenCalled();
        expect(updateOne).not.toHaveBeenCalled();
    });
});
