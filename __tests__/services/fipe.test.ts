import { describe, it, expect, vi } from 'vitest';
import { fipePath, normalizeFipeCode } from '@/lib/services/fipeService';
import { enrichFipeRows } from '@/lib/services/fipeImport';
const detail = { brand: 'Toyota', model: 'Corolla XEi', modelYear: 2026, fuel: 'Flex', codeFipe: '002111-3', price: 'R$ 150.000,00', referenceMonth: 'setembro de 2026' };
const row = { marca: '', modelo: '', codigoFipe: '0021113', anoModelo: 2026, tipoVeiculo: 'carro', warnings: [] as string[], cor: 'Preto', preco: 123000 };
describe('FIPE', () => {
    it('preserva zeros e rejeita caminhos arbitrários', () => {
        expect(normalizeFipeCode('0021113')).toBe('002111-3');
        expect(fipePath(new URLSearchParams({ type: 'cars', code: '0021113', year: '2026-5' }))).toBe('cars/002111-3/years/2026-5');
        expect(() => fipePath(new URLSearchParams({ brand: '../secret' }))).toThrow();
    });
    it('completa vazios e compartilha consultas repetidas sem alterar preço ou cor', async () => {
        const lookup = vi.fn().mockResolvedValueOnce([{ code: '2026-5', name: '2026 Flex' }]).mockResolvedValueOnce(detail);
        const result = await enrichFipeRows([row, { ...row, modelo: 'Nome comercial' }], lookup);
        expect(lookup).toHaveBeenCalledTimes(2);
        expect(result[0]).toMatchObject({ marca: 'Toyota', modelo: 'Corolla XEi', cor: 'Preto', preco: 123000, descricaoFipe: 'Corolla XEi' });
        expect(result[1].modelo).toBe('Nome comercial');
    });
    it('não escolhe combustível ambíguo nem associa por nome', async () => {
        const lookup = vi.fn().mockResolvedValue([{ code: '2026-1', name: '2026 Gasolina' }, { code: '2026-5', name: '2026 Flex' }]);
        const result = await enrichFipeRows([row, { ...row, codigoFipe: '' }], lookup);
        expect(result[0].warnings.join()).toContain('Mais de um combustível');
        expect(result[1].warnings.join()).toContain('Sem código');
        expect(result[0].modelo).toBe('');
    });
    it('mantém linha e avisa sobre falha, ano ausente ou marca divergente', async () => {
        const failed = await enrichFipeRows([row], vi.fn().mockRejectedValue(Error('Indisponível')));
        expect(failed[0].warnings.join()).toContain('Indisponível');
        const missing = await enrichFipeRows([{ ...row, anoModelo: undefined }], vi.fn());
        expect(missing[0].warnings.join()).toContain('ano-modelo');
        const lookup = vi.fn().mockResolvedValueOnce([{ code: '2026-5', name: '2026 Flex' }]).mockResolvedValueOnce(detail);
        const conflict = await enrichFipeRows([{ ...row, marca: 'Honda' }], lookup);
        expect(conflict[0].marca).toBe('Honda');
        expect(conflict[0].warnings.join()).toContain('difere');
    });
});
