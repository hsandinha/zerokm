'use client';

import { useState, useEffect, useRef } from 'react';
import styles from './AutocompleteInput.module.css';

interface AutocompleteInputProps {
    value: string;
    onChange: (value: string) => void;
    options?: string[];
    getSuggestions?: (searchTerm: string) => string[];
    placeholder?: string;
    label?: string;
    name?: string;
    required?: boolean;
    onFocus?: () => void;
    loading?: boolean;
    disabled?: boolean;
}

const DEFAULT_OPTIONS: string[] = [];

export function AutocompleteInput({
    value,
    onChange,
    options = DEFAULT_OPTIONS,
    getSuggestions,
    placeholder,
    label,
    name,
    required = false,
    onFocus,
    loading = false,
    disabled = false
}: AutocompleteInputProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [filteredOptions, setFilteredOptions] = useState<string[]>([]);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const blurTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Filtrar opções baseado no valor digitado
    useEffect(() => {
        if (value.length === 0) {
            setFilteredOptions([]);
            setIsOpen(false);
            return;
        }

        let filtered: string[] = [];

        if (getSuggestions) {
            // Usar função de sugestões dinâmicas
            filtered = getSuggestions(value);
        } else {
            // Usar lista estática de opções
            filtered = options.filter(option =>
                option.toLowerCase().includes(value.toLowerCase())
            ).slice(0, 10); // Limitar a 10 resultados
        }

        setFilteredOptions(filtered);
        setIsOpen(value.length > 0);
        setHighlightedIndex(-1);
    }, [value, options, getSuggestions]);

    // Cleanup timeout ao desmontar componente
    useEffect(() => {
        return () => {
            if (blurTimeoutRef.current) {
                clearTimeout(blurTimeoutRef.current);
            }
        };
    }, []);

    // Lidar com teclas de navegação
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen || filteredOptions.length === 0) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightedIndex(prev =>
                    prev < filteredOptions.length - 1 ? prev + 1 : 0
                );
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex(prev =>
                    prev > 0 ? prev - 1 : filteredOptions.length - 1
                );
                break;
            case 'Enter':
                e.preventDefault();
                if (highlightedIndex >= 0) {
                    handleSelectOption(filteredOptions[highlightedIndex]);
                }
                break;
            case 'Escape':
                setIsOpen(false);
                setHighlightedIndex(-1);
                inputRef.current?.blur();
                break;
        }
    };

    const handleSelectOption = (option: string) => {
        // Cancelar qualquer timeout de blur pendente
        if (blurTimeoutRef.current) {
            clearTimeout(blurTimeoutRef.current);
            blurTimeoutRef.current = null;
        }

        onChange(option);
        setIsOpen(false);
        setHighlightedIndex(-1);

        // Forçar blur do input após seleção
        setTimeout(() => {
            inputRef.current?.blur();
        }, 10);
    };

    const handleInputFocus = () => {
        // Cancelar timeout de blur se o input receber foco novamente
        if (blurTimeoutRef.current) {
            clearTimeout(blurTimeoutRef.current);
            blurTimeoutRef.current = null;
        }

        if (onFocus) {
            onFocus();
        }
        if (value.length > 0) {
            setIsOpen(true);
        }
    };

    const handleInputBlur = () => {
        // Agendar fechamento do dropdown
        blurTimeoutRef.current = setTimeout(() => {
            setIsOpen(false);
            setHighlightedIndex(-1);
            blurTimeoutRef.current = null;
        }, 150);
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
                    ref={inputRef}
                    type="text"
                    name={name}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    required={required}
                    className={styles.input}
                    autoComplete="off"
                    disabled={disabled}
                />
                {loading && (
                    <div className={styles.loadingSpinner}>⏳</div>
                )}
            </div>

            {isOpen && (
                <div ref={listRef} className={styles.optionsList}>
                    {filteredOptions.length > 0 ? (
                        filteredOptions.map((option, index) => (
                            <div
                                key={option}
                                className={`${styles.option} ${index === highlightedIndex ? styles.highlighted : ''
                                    }`}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    handleSelectOption(option);
                                }}
                                onMouseEnter={() => setHighlightedIndex(index)}
                            >
                                {option}
                            </div>
                        ))
                    ) : (
                        <div className={styles.option}>
                            Sem sugestão
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}