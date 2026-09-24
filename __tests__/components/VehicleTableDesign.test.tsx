import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VehicleTable } from '../../components/operator/VehicleTable';

function tableProps(role: string): React.ComponentProps<typeof VehicleTable> {
    return {
        vehicles: [{ id: 'v1', modelo: 'Corolla XEi', preco: 100000, cor: 'Prata', ano: '2026', status: 'A faturar', transmissao: 'Automático', combustivel: 'Flex', estado: 'SP', quantidade: 1 } as any],
        role, selectedIds: [], selectedModel: null, isClientReadOnly: role === 'client',
        sortConfig: { key: 'preco', direction: 'asc' }, pendingSearchTerm: '',
        modeloOptions: [], transmissaoOptions: [], combustivelOptions: [], statusOptions: [], brazilStates: [],
        localCredits: 10, margem: 10, fixedMargin: 0, marginMode: 'percent',
        handleSelectAll: vi.fn(), handleSort: vi.fn(), handleSelectOne: vi.fn(),
        handleUpdateVehicleField: vi.fn(), handleUpdateOpcionais: vi.fn(), handleUpdatePreco: vi.fn(),
        handleLocationClick: vi.fn(), onWhatsApp: vi.fn(),
    };
}

describe('consulta administrativa', () => {
    it('destaca preço ao lado do modelo sem duplicar ou perder células', () => {
        render(<VehicleTable {...tableProps('administrador')} />);
        const headers = screen.getAllByRole('columnheader');
        expect(headers[1]).toHaveTextContent('PREÇO');
        expect(headers.filter(h => h.textContent?.includes('PREÇO'))).toHaveLength(1);
        const row = screen.getAllByRole('row')[1];
        expect(within(row).getAllByRole('cell')).toHaveLength(headers.length);
        expect(within(row).getAllByRole('cell')[1]).toHaveTextContent('100.000');
    });
    it('preserva a ordem e o cálculo de margem do cliente', () => {
        render(<VehicleTable {...tableProps('client')} />);
        expect(screen.getAllByRole('columnheader')[1]).toHaveTextContent('TRANSMISSÃO');
        expect(screen.getByText('R$ 110.000,00')).toBeInTheDocument();
    });
});
