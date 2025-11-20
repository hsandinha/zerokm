'use client';

import { useState, useEffect, useCallback } from 'react';
import styles from './AutocompleteInput.module.css'; // Usando os mesmos estilos

interface MaskedInputProps {
    value: string;
    onChange: (value: string) => void;
    mask: 'phone' | 'cpf' | 'cnpj' | 'chassi' | 'currency' | 'cep';
    placeholder?: string;
    label?: string;
    name?: string;
    required?: boolean;
    maxLength?: number;
}

export function MaskedInput({
    value,
    onChange,
    mask,
    placeholder,
    label,
    name,
    required = false,
    maxLength
}: MaskedInputProps) {
    const [displayValue, setDisplayValue] = useState('');

    // Máscara de telefone brasileiro (XX)XXXXX-XXXX
    const applyPhoneMask = (numbers: string): string => {
        if (numbers.length <= 2) {
            return numbers;
        } else if (numbers.length <= 7) {
            return `(${numbers.slice(0, 2)})${numbers.slice(2)}`;
        } else if (numbers.length <= 11) {
            return `(${numbers.slice(0, 2)})${numbers.slice(2, 7)}-${numbers.slice(7)}`;
        } else {
            // Limita a 11 dígitos
            return `(${numbers.slice(0, 2)})${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`;
        }
    };

    // Máscara de CPF XXX.XXX.XXX-XX
    const applyCpfMask = (numbers: string): string => {
        if (numbers.length <= 3) {
            return numbers;
        } else if (numbers.length <= 6) {
            return `${numbers.slice(0, 3)}.${numbers.slice(3)}`;
        } else if (numbers.length <= 9) {
            return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6)}`;
        } else {
            return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6, 9)}-${numbers.slice(9, 11)}`;
        }
    };

    // Máscara de CNPJ XX.XXX.XXX/XXXX-XX
    const applyCnpjMask = (numbers: string): string => {
        if (numbers.length <= 2) {
            return numbers;
        } else if (numbers.length <= 5) {
            return `${numbers.slice(0, 2)}.${numbers.slice(2)}`;
        } else if (numbers.length <= 8) {
            return `${numbers.slice(0, 2)}.${numbers.slice(2, 5)}.${numbers.slice(5)}`;
        } else if (numbers.length <= 12) {
            return `${numbers.slice(0, 2)}.${numbers.slice(2, 5)}.${numbers.slice(5, 8)}/${numbers.slice(8)}`;
        } else {
            return `${numbers.slice(0, 2)}.${numbers.slice(2, 5)}.${numbers.slice(5, 8)}/${numbers.slice(8, 12)}-${numbers.slice(12, 14)}`;
        }
    };

    // Máscara de CEP XXXXX-XXX
    const applyCepMask = (numbers: string): string => {
        if (numbers.length <= 5) {
            return numbers;
        } else {
            return `${numbers.slice(0, 5)}-${numbers.slice(5, 8)}`;
        }
    };

    // Máscara de Chassi (formato padrão: ABC1D23E4FG567890)
    const applyChassiMask = (inputValue: string): string => {
        // Remove caracteres especiais e converte para maiúsculas
        const cleanValue = inputValue.replace(/[^A-Z0-9]/gi, '').toUpperCase();

        // Chassi padrão tem 17 caracteres
        if (cleanValue.length <= 3) {
            return cleanValue;
        } else if (cleanValue.length <= 4) {
            return `${cleanValue.slice(0, 3)}${cleanValue.slice(3)}`;
        } else if (cleanValue.length <= 6) {
            return `${cleanValue.slice(0, 3)}${cleanValue.slice(3, 4)}${cleanValue.slice(4)}`;
        } else if (cleanValue.length <= 8) {
            return `${cleanValue.slice(0, 3)}${cleanValue.slice(3, 4)}${cleanValue.slice(4, 6)}${cleanValue.slice(6)}`;
        } else if (cleanValue.length <= 11) {
            return `${cleanValue.slice(0, 3)}${cleanValue.slice(3, 4)}${cleanValue.slice(4, 6)}${cleanValue.slice(6, 8)}${cleanValue.slice(8)}`;
        } else {
            // Limita a 17 caracteres
            return `${cleanValue.slice(0, 3)}${cleanValue.slice(3, 4)}${cleanValue.slice(4, 6)}${cleanValue.slice(6, 8)}${cleanValue.slice(8, 11)}${cleanValue.slice(11, 17)}`;
        }
    };

    // Máscara de moeda brasileira (R$ X.XXX.XXX,XX)
    const applyCurrencyMask = (numbers: string): string => {
        if (!numbers) return '';

        // Converte para número (centavos) para facilitar a manipulação
        const numberValue = parseInt(numbers) || 0;

        // Converte centavos para reais (divide por 100)
        const reais = numberValue / 100;

        // Formata usando toLocaleString
        const formatted = reais.toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

        return formatted;
    };

    // Aplicar máscara baseado no tipo
    const applyMask = useCallback((inputValue: string): string => {
        // Remove tudo que não for número
        const numbers = inputValue.replace(/\D/g, '');

        switch (mask) {
            case 'phone':
                return applyPhoneMask(numbers);
            case 'cpf':
                return applyCpfMask(numbers);
            case 'cnpj':
                return applyCnpjMask(numbers);
            case 'chassi':
                return applyChassiMask(inputValue); // Chassi permite letras e números
            case 'currency':
                return applyCurrencyMask(numbers);
            case 'cep':
                return applyCepMask(numbers);
            default:
                return numbers;
        }
    }, [mask]);

    // Remover máscara para obter apenas números (ou alfanumérico para chassi)
    const removeMask = (maskedValue: string): string => {
        if (mask === 'chassi') {
            return maskedValue.replace(/[^A-Z0-9]/gi, '').toUpperCase();
        } else if (mask === 'currency') {
            // Para moeda, remove tudo exceto números e retorna o valor em centavos
            const numbers = maskedValue.replace(/\D/g, '');
            return numbers;
        }
        return maskedValue.replace(/\D/g, '');
    };

    // Sincronizar com o valor externo
    useEffect(() => {
        const masked = applyMask(value);
        setDisplayValue(masked);
    }, [value, applyMask]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const inputValue = e.target.value;
        const masked = applyMask(inputValue);
        const unmasked = removeMask(inputValue);

        setDisplayValue(masked);
        onChange(unmasked); // Passa apenas os números para o componente pai
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        // Permitir teclas especiais (backspace, delete, tab, etc.)
        const allowedKeys = [
            'Backspace', 'Delete', 'Tab', 'Escape', 'Enter',
            'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
            'Home', 'End'
        ];

        if (allowedKeys.includes(e.key)) {
            return;
        }

        // Para chassi, permitir letras e números
        if (mask === 'chassi') {
            if (!/^[A-Z0-9]$/i.test(e.key)) {
                e.preventDefault();
            }
        } else {
            // Para outros tipos, permitir apenas números
            if (!/^\d$/.test(e.key)) {
                e.preventDefault();
            }
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
                    type="text"
                    name={name}
                    value={displayValue}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    required={required}
                    maxLength={maxLength}
                    className={styles.input}
                    autoComplete="off"
                />
            </div>
        </div>
    );
}