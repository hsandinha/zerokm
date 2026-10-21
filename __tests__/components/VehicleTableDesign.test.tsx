import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VehicleTable } from '../../components/operator/VehicleTable';
import { useFavoritos } from '../../lib/hooks/useFavoritos';

function tableProps(role: string): React.ComponentProps<typeof VehicleTable> {
    return {
        vehicles: [{ id: 'v1', marca: 'TOYOTA', modelo: 'Corolla XEi', preco: 100000, cor: 'Prata', ano: '2026', status: 'A faturar', transmissao: 'Automático', combustivel: 'Flex', estado: 'SP', quantidade: 1 } as any],
        role, selectedIds: [], selectedModel: null, isClientReadOnly: role === 'client',
        sortConfig: { key: 'preco', direction: 'asc' }, pendingSearchTerm: '',
        modeloOptions: [], transmissaoOptions: [], combustivelOptions: [], statusOptions: [], brazilStates: [],
        localCredits: 10, margem: 10, fixedMargin: 0, marginMode: 'percent',
        handleSelectAll: vi.fn(), handleSort: vi.fn(), handleSelectOne: vi.fn(),
        handleUpdateVehicleField: vi.fn(), handleUpdateOpcionais: vi.fn(), handleUpdatePreco: vi.fn(),
        handleLocationClick: vi.fn(), onWhatsApp: vi.fn(),
    };
}

const COLUNAS = ['Veículo', 'Ano / cor', 'Disponibilidade', 'Preço', 'UF', 'Observações', 'Atualização', 'Ações'];

describe('consulta administrativa', () => {
    it('mostra as 8 colunas, com preço uma única vez e sem perder células', () => {
        render(<VehicleTable {...tableProps('administrador')} />);
        const headers = screen.getAllByRole('columnheader');
        expect(headers.map(h => h.textContent?.replace(/[▲▼]/g, '').trim())).toEqual(COLUNAS);
        expect(headers.filter(h => h.textContent?.includes('Preço'))).toHaveLength(1);
        const row = screen.getAllByRole('row')[1];
        expect(within(row).getAllByRole('cell')).toHaveLength(headers.length);
        expect(within(row).getAllByRole('cell')[3]).toHaveTextContent('100.000');
    });
    it('preserva a ordem e o cálculo de margem do cliente', () => {
        render(<VehicleTable {...tableProps('client')} />);
        const headers = screen.getAllByRole('columnheader');
        expect(headers[0]).toHaveTextContent('Veículo');
        expect(screen.getByText('R$ 110.000,00')).toBeInTheDocument();
        // Transmissão e combustível continuam visíveis, agora dentro da coluna Veículo.
        const veiculo = within(screen.getAllByRole('row')[1]).getAllByRole('cell')[0];
        expect(veiculo).toHaveTextContent('Corolla XEi');
        expect(veiculo).toHaveTextContent('Automático');
        expect(veiculo).toHaveTextContent('Flex');
    });
    it('mostra a foto do veículo e um quadro neutro quando não há foto', () => {
        const props = tableProps('client');
        props.vehicles = [
            { ...props.vehicles[0], imagemUrl: 'https://exemplo.test/corolla.jpg' },
            { ...props.vehicles[0], id: 'v2', modelo: 'Onix LT' },
        ];
        render(<VehicleTable {...props} />);
        const foto = screen.getByAltText('Foto do Corolla XEi');
        expect(foto).toHaveAttribute('loading', 'lazy');
        expect(screen.getByRole('img', { name: 'Sem foto do Onix LT' })).toBeInTheDocument();
        fireEvent.error(foto);
        expect(screen.getByRole('img', { name: 'Sem foto do Corolla XEi' })).toBeInTheDocument();
    });
});

function TabelaComFavoritos() {
    const favoritos = useFavoritos(true);
    return <VehicleTable {...tableProps('client')} isFavorite={favoritos.isFavorite} onToggleFavorite={v => favoritos.toggle(v)} />;
}

describe('favoritos do cliente (veículo específico)', () => {
    it('favorita e desfavorita o veículo da linha pelo coração', async () => {
        const servidor: Array<Record<string, unknown>> = [];
        const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
            if (init?.method === 'POST') {
                const corpo = JSON.parse(String(init.body));
                servidor.push({ id: 'f1', ...corpo, disponivel: true, atualizado: false, lastSeenAt: new Date().toISOString() });
            }
            if (init?.method === 'DELETE') servidor.splice(0, servidor.length);
            return { ok: true, json: async () => (init?.method ? { ok: true } : { veiculos: [...servidor], favoritos: [], totalNovos: 0 }) };
        });
        vi.stubGlobal('fetch', fetchMock);
        render(<TabelaComFavoritos />);
        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/user/favoritos'));

        const coracao = screen.getByRole('button', { name: 'Favoritar este veículo' });
        expect(coracao).toHaveAttribute('aria-pressed', 'false');
        await act(async () => { fireEvent.click(coracao); });
        const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
        // O favorito é a oferta (id da linha), não o modelo.
        expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({ veiculoId: 'v1', modelo: 'Corolla XEi' });
        const marcado = await screen.findByRole('button', { name: 'Tirar este veículo dos favoritos' });
        expect(marcado).toHaveAttribute('aria-pressed', 'true');

        await act(async () => { fireEvent.click(marcado); });
        expect(fetchMock.mock.calls.some(([url, init]) => init?.method === 'DELETE' && String(url) === '/api/user/favoritos?veiculoId=v1')).toBe(true);
        expect(await screen.findByRole('button', { name: 'Favoritar este veículo' })).toHaveAttribute('aria-pressed', 'false');
        vi.unstubAllGlobals();
    });
    it('não mostra o coração sem favoritos habilitados', () => {
        render(<VehicleTable {...tableProps('administrador')} />);
        expect(screen.queryByRole('button', { name: /favorit/i })).not.toBeInTheDocument();
    });
});
