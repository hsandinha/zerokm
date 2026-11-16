// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';

const { novos, repasse } = vi.hoisted(() => ({ novos: { updateMany: vi.fn() }, repasse: { updateMany: vi.fn() } }));
vi.mock('@/models/DealerVehiclePrice', () => ({ default: novos }));
vi.mock('@/models/RepasseVehicle', () => ({ default: repasse }));

import { atualizarDataDosAnuncios, confirmarEstoque } from '@/lib/services/estoqueAtualizacao';
import { calculateDaysSinceUpdate, getUpdateStatusColor } from '@/lib/utils/formatters';

const LOJA = new mongoose.Types.ObjectId();
const HOJE = new Date();

beforeEach(() => {
    novos.updateMany.mockReset().mockResolvedValue({ matchedCount: 12 });
    repasse.updateMany.mockReset().mockResolvedValue({ matchedCount: 3 });
});

describe('concessionária confirma o estoque', () => {
    it('carimba a data de hoje em todo anúncio ativo da loja, 0KM e repasse', async () => {
        await expect(confirmarEstoque(String(LOJA), HOJE)).resolves.toEqual({ novos: 12, repasse: 3 });
        for (const modelo of [novos, repasse]) {
            const [filtro, update] = modelo.updateMany.mock.calls[0];
            expect(String(filtro.concessionariaId)).toBe(String(LOJA));
            expect(filtro.ativo).toBe(true);
            expect(update).toEqual({ $set: { updatedAt: HOJE } });
        }
    });

    it('a data gravada é a que deixa o veículo verde na consulta do lojista', () => {
        // Regressão do relato: a loja "atualizava" e o cliente seguia vendo vermelho,
        // porque a consulta pinta pela data de cada anúncio e nada era gravado.
        const antiga = new Date(HOJE.getTime() - 9 * 864e5);
        expect(getUpdateStatusColor(calculateDaysSinceUpdate(antiga))).toBe('#ef4444');
        expect(getUpdateStatusColor(calculateDaysSinceUpdate(HOJE))).toBe('#10b981');
    });
});

describe('"Atualizar data" dos veículos marcados', () => {
    const idNovo = String(new mongoose.Types.ObjectId());
    const idRepasse = String(new mongoose.Types.ObjectId());

    it('vale para 0KM e repasse: os ids da lista misturam as duas coleções', async () => {
        novos.updateMany.mockResolvedValue({ matchedCount: 1 });
        repasse.updateMany.mockResolvedValue({ matchedCount: 1 });
        await expect(atualizarDataDosAnuncios([idNovo, idRepasse], null, HOJE)).resolves.toBe(2);
        expect(novos.updateMany.mock.calls[0][0]._id.$in.map(String)).toEqual([idNovo, idRepasse]);
        const filtroRepasse = repasse.updateMany.mock.calls[0][0];
        expect(filtroRepasse._id.$in.map(String)).toEqual([idNovo, idRepasse]);
        // Estoque local de lojista não é anúncio: fica de fora.
        expect(filtroRepasse).toMatchObject({ ativo: true, lojistaId: null });
        expect(novos.updateMany.mock.calls[0][0]).not.toHaveProperty('concessionariaId');
    });

    it('concessionária só carimba os anúncios dela', async () => {
        await atualizarDataDosAnuncios([idNovo], String(LOJA), HOJE);
        expect(String(novos.updateMany.mock.calls[0][0].concessionariaId)).toBe(String(LOJA));
        expect(String(repasse.updateMany.mock.calls[0][0].concessionariaId)).toBe(String(LOJA));
    });

    it('id inválido é ignorado e não chega ao banco', async () => {
        await expect(atualizarDataDosAnuncios(['abc', { $ne: null }], null)).resolves.toBe(0);
        expect(novos.updateMany).not.toHaveBeenCalled();
    });
});
