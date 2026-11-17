import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SeletorDeConcessionaria, posicaoDaLista } from '../../components/admin/SeletorDeConcessionaria';

const lojas = [
    { id: '1', nome: 'GRUPO RIZZO', cidade: 'São Paulo', uf: 'SP', marcas: ['VW'], totalAtivos: 3 },
    { id: '2', nome: 'GRUPO RIZZO - GEELY', cidade: 'São Paulo', uf: 'SP', marcas: ['GEELY'], totalAtivos: 10 },
    { id: '3', nome: 'GRUPO ATRI', cidade: 'Ribeirão Preto', uf: 'SP', marcas: ['FIAT'], totalAtivos: 28 },
] as any[];

describe('lista de concessionárias da busca do Estoque', () => {
    it('é desenhada fora do cartão, no invólucro do tema, e o clique escolhe a loja', () => {
        const onChange = vi.fn();
        render(
            <div data-admin-design="light">
                <section data-testid="cartao" style={{ overflow: 'hidden' }}>
                    <SeletorDeConcessionaria lojas={lojas} value="" onChange={onChange} />
                </section>
            </div>,
        );
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'rizzo' } });
        const lista = screen.getByRole('listbox');
        expect(within(screen.getByTestId('cartao')).queryByRole('listbox')).toBeNull();
        expect(lista.closest('[data-admin-design]')).not.toBeNull();

        // Clicar na opção não pode ser tratado como "clique fora" antes da escolha.
        const opcao = within(lista).getByRole('option', { name: /GRUPO RIZZO - GEELY/ });
        fireEvent.mouseDown(opcao);
        fireEvent.click(opcao);
        expect(onChange).toHaveBeenCalledWith('2');
    });

    it('clicar fora fecha a lista', () => {
        render(<div data-admin-design="light"><p>fora</p><SeletorDeConcessionaria lojas={lojas} value="" onChange={() => {}} /></div>);
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'grupo' } });
        expect(screen.getByRole('listbox')).toBeInTheDocument();
        fireEvent.mouseDown(screen.getByText('fora'));
        expect(screen.queryByRole('listbox')).toBeNull();
    });
});

describe('posicaoDaLista', () => {
    it('abre para baixo, colada no campo, com a largura dele', () => {
        expect(posicaoDaLista({ top: 412, bottom: 480, left: 222, width: 1006 }, 1500)).toEqual({ left: 222, width: 1006, maxHeight: 420, top: 486 });
    });

    it('perto do fim da tela, encolhe para caber', () => {
        expect(posicaoDaLista({ top: 300, bottom: 344, left: 0, width: 500 }, 700).maxHeight).toBe(344);
    });

    it('sem espaço embaixo e com espaço em cima, abre para cima', () => {
        const p = posicaoDaLista({ top: 600, bottom: 644, left: 0, width: 500 }, 760);
        expect(p.top).toBeUndefined();
        expect(p.bottom).toBe(166);
        expect(p.maxHeight).toBe(420);
    });
});
