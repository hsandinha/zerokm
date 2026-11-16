'use client';

import { useEffect, useRef, useState } from 'react';
import { CampoValor } from '@/components/ui/CampoValor';
import { lerValor, valorParaCampo } from '@/lib/utils/campoValor';
import styles from './AutocompleteInput.module.css'; // Reutilizando estilos

interface CurrencyInputProps {
    value: number | undefined;
    onValueChange: (value: number | undefined) => void;
    placeholder?: string;
    label?: string;
    name?: string;
    required?: boolean;
}

/**
 * Campo de reais com número de entrada e saída. Formata enquanto digita, como
 * os outros campos de valor da plataforma: 10000 vira 10.000 (antes virava 100,00).
 */
export function CurrencyInput({
    value,
    onValueChange,
    placeholder,
    label,
    name,
    required = false
}: CurrencyInputProps) {
    const [texto, setTexto] = useState(() => valorParaCampo(value));
    // Número que este campo acabou de mandar: quando ele volta pelo `value`, o texto
    // digitado fica como está (senão "10.000," perderia a vírgula no meio da digitação).
    const enviado = useRef<number | undefined>(value);

    useEffect(() => {
        // Campo apagado que o formulário guarda como 0 continua vazio na tela.
        if (value === enviado.current || (enviado.current === undefined && value === 0)) return;
        enviado.current = value;
        setTexto(valorParaCampo(value));
    }, [value]);

    return (
        <div className={styles.container}>
            {label && (
                <label htmlFor={name} className={styles.label}>
                    {label}{required && '*'}
                </label>
            )}
            <div className={styles.inputWrapper}>
                <CampoValor
                    id={name}
                    name={name}
                    className={styles.input}
                    valor={texto}
                    aoMudar={novo => {
                        setTexto(novo);
                        const numero = lerValor(novo) ?? undefined;
                        enviado.current = numero;
                        onValueChange(numero);
                    }}
                    placeholder={placeholder}
                    required={required}
                />
            </div>
        </div>
    );
}
