import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CampoValor } from '../../components/ui/CampoValor';
import { CurrencyInput } from '../../components/operator/CurrencyInput';

function Controlado({ inicial = '', decimais, aoMudar }: { inicial?: string; decimais?: number; aoMudar?: (t: string) => void }) {
    const [valor, setValor] = useState(inicial);
    return <CampoValor aria-label="Valor" valor={valor} decimais={decimais} aoMudar={t => { setValor(t); aoMudar?.(t); }} />;
}

describe('CampoValor', () => {
    it('formata enquanto digita: 10000 vira 10.000', () => {
        const aoMudar = vi.fn();
        render(<Controlado aoMudar={aoMudar} />);
        const campo = screen.getByRole('textbox', { name: 'Valor' });
        fireEvent.change(campo, { target: { value: '10000' } });
        expect(campo).toHaveValue('10.000');
        expect(aoMudar).toHaveBeenLastCalledWith('10.000');
    });

    it('aceita centavos com vírgula', () => {
        render(<Controlado inicial="10.000" />);
        const campo = screen.getByRole('textbox', { name: 'Valor' });
        fireEvent.change(campo, { target: { value: '10.000,5' } });
        expect(campo).toHaveValue('10.000,5');
    });

    it('sem casas decimais, para km', () => {
        render(<Controlado decimais={0} />);
        const campo = screen.getByRole('textbox', { name: 'Valor' });
        fireEvent.change(campo, { target: { value: '48500' } });
        expect(campo).toHaveValue('48.500');
        expect(campo).toHaveAttribute('inputmode', 'numeric');
    });

    it('teclado de número com vírgula no celular', () => {
        render(<Controlado />);
        expect(screen.getByRole('textbox', { name: 'Valor' })).toHaveAttribute('inputmode', 'decimal');
    });
});

describe('CurrencyInput (cadastro de veículo e frete)', () => {
    it('digitando 10000 mostra 10.000 e devolve o número 10000', () => {
        const onValueChange = vi.fn();
        function Form() {
            const [v, setV] = useState<number | undefined>(undefined);
            return <CurrencyInput name="preco" label="Valor (R$)" value={v} onValueChange={n => { setV(n); onValueChange(n); }} />;
        }
        render(<Form />);
        const campo = screen.getByRole('textbox');
        fireEvent.change(campo, { target: { value: '10000' } });
        expect(campo).toHaveValue('10.000');
        expect(onValueChange).toHaveBeenLastCalledWith(10000);
        // A vírgula no meio da digitação não some quando o número volta pelo value.
        fireEvent.change(campo, { target: { value: '10.000,' } });
        expect(campo).toHaveValue('10.000,');
        expect(onValueChange).toHaveBeenLastCalledWith(10000);
    });

    it('abre com o número salvo formatado', () => {
        render(<CurrencyInput name="preco" value={154920} onValueChange={() => {}} />);
        expect(screen.getByRole('textbox')).toHaveValue('154.920');
    });
});
