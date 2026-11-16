'use client';

import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, type InputHTMLAttributes } from 'react';
import { aplicarEdicao } from '@/lib/utils/campoValor';

type PropsDoInput = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'defaultValue'>;

export type CampoValorProps = PropsDoInput & {
    /** Texto já formatado ("10.000,50"). Para ler o número, use `lerValor`. */
    valor: string;
    /** Recebe o texto formatado a cada tecla. */
    aoMudar: (texto: string) => void;
    /** Casas decimais aceitas depois da vírgula. 0 para km, quantidade e afins. Padrão 2. */
    decimais?: number;
};

/**
 * Campo de valor que formata enquanto a pessoa digita: 10000 vira 10.000.
 * Usa o mesmo visual de qualquer `<input>` do lugar (repassa className, style e afins).
 */
export const CampoValor = forwardRef<HTMLInputElement, CampoValorProps>(function CampoValor(
    { valor, aoMudar, decimais = 2, inputMode, autoComplete, ...resto },
    ref,
) {
    const input = useRef<HTMLInputElement>(null);
    const cursorPendente = useRef<number | null>(null);
    useImperativeHandle(ref, () => input.current as HTMLInputElement);

    // Depois que o React grava o texto novo, o cursor volta para depois do mesmo dígito.
    useLayoutEffect(() => {
        const el = input.current;
        const pos = cursorPendente.current;
        if (el && pos !== null && document.activeElement === el) {
            el.setSelectionRange(pos, pos);
        }
        cursorPendente.current = null;
    });

    return (
        <input
            {...resto}
            ref={input}
            type="text"
            inputMode={inputMode ?? (decimais > 0 ? 'decimal' : 'numeric')}
            autoComplete={autoComplete ?? 'off'}
            value={valor}
            onChange={event => {
                const nativo = event.nativeEvent as InputEvent;
                const { texto, cursor } = aplicarEdicao({
                    bruto: event.target.value,
                    cursor: event.target.selectionStart ?? event.target.value.length,
                    anterior: valor,
                    tipo: nativo?.inputType,
                    digitado: nativo?.data,
                    decimais,
                });
                cursorPendente.current = cursor;
                aoMudar(texto);
            }}
        />
    );
});
