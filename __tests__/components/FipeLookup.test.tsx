import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FipeLookup } from '@/components/catalog/FipeLookup';
afterEach(() => vi.unstubAllGlobals());
describe('busca assistida FIPE', () => {
    it('filtra marcas, seleciona modelo e ano sem aplicar antes da confirmação', async () => {
        const apply = vi.fn();
        vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => ({ ok: true, json: async () => url.includes('year=') ? { brand: 'Toyota', model: 'Corolla XEi', modelYear: 2026, fuel: 'Flex', codeFipe: '002111-3' } : url.includes('model=') ? [{ code: '2026-5', name: '2026 Flex' }] : url.includes('brand=') ? [{ code: '1', name: 'Corolla XEi' }] : [{ code: '56', name: 'Toyota' }, { code: '25', name: 'Honda' }] })));
        render(<FipeLookup onApply={apply} />);
        fireEvent.click(screen.getByText('Buscar veículo'));
        await waitFor(() => expect(screen.getByLabelText('Marca FIPE')).not.toBeDisabled());
        fireEvent.change(screen.getByLabelText('Marca FIPE'), { target: { value: 'toyo' } });
        fireEvent.click(await screen.findByRole('option', { name: 'Toyota' }));
        await waitFor(() => expect(screen.getByLabelText('Modelo / versão FIPE')).not.toBeDisabled());
        fireEvent.focus(screen.getByLabelText('Modelo / versão FIPE'));
        fireEvent.click(await screen.findByRole('option', { name: 'Corolla XEi' }));
        await waitFor(() => expect(screen.getByLabelText('Ano-modelo / combustível FIPE')).not.toBeDisabled());
        fireEvent.focus(screen.getByLabelText('Ano-modelo / combustível FIPE'));
        fireEvent.click(await screen.findByRole('option', { name: '2026 Flex' }));
        await screen.findByText('Aplicar ao cadastro');
        expect(apply).not.toHaveBeenCalled();
        fireEvent.click(screen.getByText('Aplicar ao cadastro'));
        expect(apply).toHaveBeenCalledWith(expect.objectContaining({ codeFipe: '002111-3' }), 'carro');
    });
});
