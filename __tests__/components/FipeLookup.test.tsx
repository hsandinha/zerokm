import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AutocompleteField, useFipeCascade } from '@/components/catalog/FipeLookup';

afterEach(() => vi.unstubAllGlobals());

function Harness({ onDetail }: { onDetail: (detail: unknown) => void }) {
    const fipe = useFipeCascade('carro');
    const [marca, setMarca] = useState('');
    const [modelo, setModelo] = useState('');
    return <form>
        <AutocompleteField label="Marca" value={marca} options={fipe.brands} loading={fipe.loading === 'brands'} onOpen={() => { void fipe.loadBrands(); }}
            onText={text => { fipe.clearBrand(); setMarca(text); }} onPick={option => { void fipe.pickBrand(option.code); setMarca(option.name); }} />
        <AutocompleteField label="Modelo" value={modelo} options={fipe.models} onText={setModelo} onPick={option => { void fipe.pickModel(option.code); setModelo(option.name); }} />
        {fipe.years.length > 0 && <label>Ano FIPE<select value={fipe.year} onChange={async event => onDetail(await fipe.pickYear(event.target.value))}>
            <option value="">Selecione</option>{fipe.years.map(y => <option key={y.code} value={y.code}>{y.name}</option>)}</select></label>}
    </form>;
}

describe('campos do cadastro com lista FIPE', () => {
    it('lista marcas ao digitar, filtra modelos da marca e busca o detalhe do ano', async () => {
        const fetchMock = vi.fn().mockImplementation(async (url: string) => ({ ok: true, json: async () =>
            url.includes('year=') ? { brand: 'Fiat', model: 'Argo Drive 1.0', modelYear: 2026, fuel: 'Flex', codeFipe: '001540-3' }
            : url.includes('model=') ? [{ code: '2026-1', name: '2026 Flex' }]
            : url.includes('brand=') ? [{ code: '10', name: 'Argo Drive 1.0' }, { code: '11', name: 'Mobi Like 1.0' }]
            : [{ code: '21', name: 'Fiat' }, { code: '25', name: 'Honda' }] }));
        vi.stubGlobal('fetch', fetchMock);
        const onDetail = vi.fn();
        render(<Harness onDetail={onDetail} />);

        const marca = screen.getByRole('combobox', { name: 'Marca' });
        fireEvent.focus(marca);
        fireEvent.change(marca, { target: { value: 'fia' } });
        fireEvent.click(await screen.findByRole('option', { name: 'Fiat' }));
        expect(screen.queryByRole('option', { name: 'Honda' })).toBeNull();

        const modelo = screen.getByRole('combobox', { name: 'Modelo' });
        fireEvent.focus(modelo);
        fireEvent.change(modelo, { target: { value: 'argo' } });
        fireEvent.click(await screen.findByRole('option', { name: 'Argo Drive 1.0' }));
        expect(screen.queryByRole('option', { name: 'Mobi Like 1.0' })).toBeNull();

        fireEvent.change(await screen.findByLabelText('Ano FIPE'), { target: { value: '2026-1' } });
        await waitFor(() => expect(onDetail).toHaveBeenCalledWith(expect.objectContaining({ codeFipe: '001540-3' })));
        expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
            '/api/catalog/fipe?type=cars', '/api/catalog/fipe?type=cars&brand=21', '/api/catalog/fipe?type=cars&brand=21&model=10',
            '/api/catalog/fipe?type=cars&brand=21&model=10&year=2026-1',
        ]);
    });

    it('mantém o texto digitado quando a FIPE está indisponível', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'FIPE indisponível.' }) }));
        render(<Harness onDetail={vi.fn()} />);
        const marca = screen.getByRole('combobox', { name: 'Marca' });
        fireEvent.focus(marca);
        fireEvent.change(marca, { target: { value: 'Marca Nova' } });
        await waitFor(() => expect(marca).toHaveValue('Marca Nova'));
    });
});
