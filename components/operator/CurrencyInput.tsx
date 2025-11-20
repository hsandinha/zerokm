'use client';

import { useCallback, useEffect, useState } from 'react';
import styles from './AutocompleteInput.module.css'; // Reutilizando estilos

interface CurrencyInputProps {
    value: number | undefined;
    onValueChange: (value: number | undefined) => void;
    placeholder?: string;
    label?: string;
    name?: string;
    required?: boolean;
}

const formatCurrency = (value: number): string => {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
};

export function CurrencyInput({
    value,
    onValueChange,
    placeholder,
    label,
    name,
    required = false
}: CurrencyInputProps) {
    const [displayValue, setDisplayValue] = useState('');

    const updateDisplayFromNumber = useCallback((numericValue?: number) => {
        if (numericValue === undefined) {
            setDisplayValue('');
            return;
        }
        setDisplayValue(formatCurrency(numericValue));
    }, []);

    useEffect(() => {
        updateDisplayFromNumber(value);
    }, [value, updateDisplayFromNumber]);

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const digits = event.target.value.replace(/\D/g, '');
        if (!digits) {
            setDisplayValue('');
            onValueChange(undefined);
            return;
        }

        const numericValue = Number(digits) / 100;
        updateDisplayFromNumber(numericValue);
        onValueChange(numericValue);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        const allowedKeys = [
            'Backspace', 'Delete', 'Tab', 'Escape', 'Enter',
            'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
            'Home', 'End'
        ];

        if (allowedKeys.includes(event.key)) {
            return;
        }

        if (!/^[0-9]$/.test(event.key)) {
            event.preventDefault();
        }
    };

    return (
        <div className={styles.container}>
            {label && (
                <label htmlFor={name} className={styles.label}>
                    {label}{required && '*'}
                </label>
            )}
            <div className={styles.inputWrapper}>
                <input
                    id={name}
                    name={name}
                    className={styles.input}
                    value={displayValue}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    required={required}
                    autoComplete="off"
                />
            </div>
        </div>
    );
}
