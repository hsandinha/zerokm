import React, { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VehicleSidebar, TIPO_SEGMENTOS } from '../../components/operator/VehicleSidebar';

function renderSidebar() {
    const props = {
        tipoVeiculo: 'todos' as const, setTipoVeiculo: vi.fn(), modelSearch: '',
        setModelSearch: vi.fn(), handleModelSearchKeyDown: vi.fn(), selectedModel: null,
        handleModelSelect: vi.fn(), filteredModels: ['COROLLA XEI', 'CRETA PLATINUM'],
        focusedModelIndex: -1, modelListRef: createRef<HTMLDivElement>(),
    };
    render(<VehicleSidebar {...props} />);
    return props;
}

describe('menu de pesquisa por modelo', () => {
    it('mantém os quatro segmentos e envia o valor correto ao selecionar', () => {
        const props = renderSidebar();
        for (const segment of TIPO_SEGMENTOS) {
            fireEvent.click(screen.getByRole('tab', { name: segment.label }));
            expect(props.setTipoVeiculo).toHaveBeenLastCalledWith(segment.value);
        }
    });
    it('mantém busca, navegação por teclado e seleção de modelo e todos', () => {
        const props = renderSidebar();
        const input = screen.getByRole('textbox', { name: 'Filtrar modelos' });
        fireEvent.change(input, { target: { value: 'COR' } });
        expect(props.setModelSearch).toHaveBeenCalledWith('COR');
        fireEvent.keyDown(input, { key: 'ArrowDown' });
        expect(props.handleModelSearchKeyDown).toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'COROLLA XEI' }));
        expect(props.handleModelSelect).toHaveBeenLastCalledWith('COROLLA XEI');
        fireEvent.click(screen.getByRole('button', { name: 'Todos os Modelos' }));
        expect(props.handleModelSelect).toHaveBeenLastCalledWith(null);
    });
});
