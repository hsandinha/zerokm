import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn(), create: vi.fn(), find: vi.fn(), session: vi.fn() }));
vi.mock('next-auth', () => ({ getServerSession: mocks.session }));
vi.mock('@/lib/authOptions', () => ({ authOptions: {} }));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/Marca', () => ({ default: {} }));
vi.mock('@/models/VehicleVariation', () => ({ default: { syncIndexes: vi.fn(), find: mocks.find, create: mocks.create } }));
vi.mock('@/lib/services/fipeService', async importOriginal => ({ ...await importOriginal<object>(), queryFipe: mocks.query }));
import { POST } from '@/app/api/catalog/variations/import/route';
beforeEach(() => { vi.clearAllMocks(); mocks.session.mockResolvedValue({ user: { profile: 'administrador' } }); mocks.find.mockReturnValue({ select: vi.fn().mockResolvedValue([]) }); });
const preview = async (csvText: string, consultarFipe: boolean) => (await POST(new Request('http://localhost/api/catalog/variations/import', { method: 'POST', body: JSON.stringify({ action: 'preview', csvText, consultarFipe }) }))).json();
describe('prévia CSV FIPE', () => {
    it('mantém CSV antigo sem consultar API', async () => {
        const result = await preview('marca;modelo;ano;cor\nToyota;Corolla;26/26;Preto', false);
        expect(result.rows[0]).toMatchObject({ marca: 'Toyota', modelo: 'Corolla', anoModelo: 2026, status: 'new' });
        expect(mocks.query).not.toHaveBeenCalled();
        expect(mocks.create).not.toHaveBeenCalled();
    });
    it('aceita cabeçalho tipoVeiculo, completa identificação e recalcula erros', async () => {
        mocks.query.mockResolvedValueOnce([{ code: '2026-5', name: '2026 Flex' }]).mockResolvedValueOnce({ brand: 'Toyota', model: 'Corolla', fuel: 'Flex', codeFipe: '002111-3', modelYear: 2026 });
        const result = await preview('codigoFipe;tipoVeiculo;anoModelo;combustivel;marca;modelo;cor;preco\n002111-3;carro;2026;Flex;;;Preto;150000', true);
        expect(result.rows[0]).toMatchObject({ marca: 'Toyota', modelo: 'Corolla', tipoVeiculo: 'carro', status: 'new', preco: 150000, errors: [] });
        expect(result.summary.importable).toBe(1);
        expect(mocks.create).not.toHaveBeenCalled();
    });
});
