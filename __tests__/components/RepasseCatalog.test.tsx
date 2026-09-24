import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RepasseCatalog } from '@/components/dealership/RepasseCatalog';

vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { profile: 'concessionaria' } }, status: 'authenticated' }) }));
afterEach(() => vi.unstubAllGlobals());

const ok = (body: unknown) => ({ ok: true, json: async () => body });

function mockApi() {
    const posts: any[] = [];
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.startsWith('/api/dealership/plano-repasse')) return ok({ plano: { ativo: true, planName: 'REPASSE', status: 'active' } });
        if (url.startsWith('/api/catalog/brands')) return ok([{ nome: 'CHEVROLET' }, { nome: 'FIAT' }]);
        if (url.startsWith('/api/dealership/repasse') && init?.method === 'POST') { posts.push(JSON.parse(String(init.body))); return ok({ id: '1' }); }
        if (url.startsWith('/api/dealership/repasse')) return ok({ data: [], total: 0, contagem: {} });
        if (url.includes('year=')) return ok({ brand: 'GM - Chevrolet', model: 'Onix Hatch LT 1.0 12V Flex 5p Mec.', modelYear: 2020, fuel: 'Gasolina', codeFipe: '004099-6', price: 'R$ 58.000,00', referenceMonth: 'setembro de 2026' });
        if (url.includes('model=')) return ok([{ code: '2020-1', name: '2020 Gasolina' }]);
        if (url.includes('brand=')) return ok([{ code: '5585', name: 'Onix Hatch LT 1.0 12V Flex 5p Mec.' }]);
        if (url.startsWith('/api/catalog/fipe')) return ok([{ code: '23', name: 'GM - Chevrolet' }, { code: '21', name: 'Fiat' }]);
        return ok({});
    });
    vi.stubGlobal('fetch', fetchMock);
    return posts;
}

describe('repasse: cadastro pela FIPE em modal', () => {
    it('abre o modal por "Adicionar carro", busca na FIPE e envia o vínculo', async () => {
        const posts = mockApi();
        render(<RepasseCatalog />);

        const add = await screen.findByRole('button', { name: /Adicionar carro/ });
        await waitFor(() => expect(add).not.toBeDisabled());
        fireEvent.click(add);
        const dialog = screen.getByRole('dialog', { name: 'Adicionar carro' });

        const marca = within(dialog).getByRole('combobox', { name: /Marca/ });
        fireEvent.focus(marca);
        fireEvent.change(marca, { target: { value: 'chev' } });
        fireEvent.click(await within(dialog).findByRole('option', { name: 'GM - Chevrolet' }));
        expect(marca).toHaveValue('CHEVROLET');

        const modelo = within(dialog).getByRole('combobox', { name: /Modelo/ });
        fireEvent.focus(modelo);
        fireEvent.click(await within(dialog).findByRole('option', { name: /Onix Hatch LT/ }));
        fireEvent.change(await within(dialog).findByLabelText(/Ano-modelo \/ combustível FIPE/), { target: { value: '2020-1' } });
        await within(dialog).findByText(/FIPE: R\$ 58\.000,00/);

        fireEvent.change(within(dialog).getByPlaceholderText('19/20'), { target: { value: '19/20' } });
        fireEvent.change(within(dialog).getByPlaceholderText('Ex.: 48.500'), { target: { value: '48500' } });
        fireEvent.change(within(dialog).getByPlaceholderText('Ex.: 72.900,00'), { target: { value: '55.000,00' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Cadastrar carro' }));

        await waitFor(() => expect(posts).toHaveLength(1));
        expect(posts[0]).toMatchObject({ marca: 'CHEVROLET', modelo: 'Onix Hatch LT 1.0 12V Flex 5p Mec.', codigoFipe: '004099-6', combustivel: 'Gasolina', ano: '19/20' });
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('sem escolher na FIPE não salva, a menos que marque cadastro manual', async () => {
        const posts = mockApi();
        render(<RepasseCatalog />);
        const add = await screen.findByRole('button', { name: /Adicionar carro/ });
        await waitFor(() => expect(add).not.toBeDisabled());
        fireEvent.click(add);
        const dialog = screen.getByRole('dialog');
        fireEvent.change(within(dialog).getByRole('combobox', { name: /Marca/ }), { target: { value: 'GURGEL' } });
        fireEvent.change(within(dialog).getByRole('combobox', { name: /Modelo/ }), { target: { value: 'BR-800' } });
        fireEvent.change(within(dialog).getByPlaceholderText('19/20'), { target: { value: '1990' } });
        fireEvent.change(within(dialog).getByPlaceholderText('Ex.: 48.500'), { target: { value: '90000' } });
        fireEvent.change(within(dialog).getByPlaceholderText('Ex.: 72.900,00'), { target: { value: '15000' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Cadastrar carro' }));
        expect(await within(dialog).findByText(/Escolha marca, modelo e ano-modelo na lista da FIPE/)).toBeInTheDocument();
        expect(posts).toHaveLength(0);

        fireEvent.click(within(dialog).getByLabelText(/Não encontrei na FIPE/));
        fireEvent.change(within(dialog).getByRole('combobox', { name: /Marca/ }), { target: { value: 'GURGEL' } });
        fireEvent.change(within(dialog).getByRole('combobox', { name: /Modelo/ }), { target: { value: 'BR-800' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Cadastrar carro' }));
        await waitFor(() => expect(posts).toHaveLength(1));
        expect(posts[0]).toMatchObject({ marca: 'GURGEL', modelo: 'BR-800', foraDoCatalogo: true, codigoFipe: '' });
    });

    it('Esc fecha o modal', async () => {
        mockApi();
        render(<RepasseCatalog />);
        const add = await screen.findByRole('button', { name: /Adicionar carro/ });
        await waitFor(() => expect(add).not.toBeDisabled());
        fireEvent.click(add);
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        fireEvent.keyDown(document, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });
});
