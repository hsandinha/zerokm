import React, { useState, useEffect, useRef } from 'react';

export interface EditableCurrencyCellProps {
    value?: number;
    onSave: (newValue: number | undefined) => void;
}

export interface EditableTextCellProps {
    value?: string;
    onSave: (newValue: string) => void;
    placeholder?: string;
}

export function EditableTextCell({ value, onSave, placeholder = '' }: EditableTextCellProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [localValue, setLocalValue] = useState<string>(value || '');

    useEffect(() => {
        setLocalValue(value || '');
    }, [value]);

    const handleBlur = () => {
        setIsEditing(false);
        if (localValue !== value) {
            onSave(localValue);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleBlur();
        }
        if (e.key === 'Escape') {
            setLocalValue(value || '');
            setIsEditing(false);
        }
    };

    if (isEditing) {
        return (
            <input
                autoFocus
                type="text"
                value={localValue}
                onChange={(e) => setLocalValue(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                onClick={(e) => e.stopPropagation()}
                style={{ width: '150px', padding: '4px', borderRadius: '4px', border: '1px solid #ccc', color: '#000' }}
                placeholder={placeholder}
            />
        );
    }

    return (
        <div
            onClick={(e) => {
                e.stopPropagation();
                setLocalValue(value || '');
                setIsEditing(true);
            }}
            style={{ cursor: 'pointer', minHeight: '20px', minWidth: '50px', borderBottom: '1px dashed #ccc' }}
            title="Clique para editar"
        >
            {value || '-'}
        </div>
    );
}

export function EditableCurrencyCell({ value, onSave }: EditableCurrencyCellProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [localValue, setLocalValue] = useState<string>('');

    useEffect(() => {
        if (value !== undefined) {
            setLocalValue((value * 100).toFixed(0));
        } else {
            setLocalValue('');
        }
    }, [value]);

    const formatDisplay = (val?: number) => {
        if (val === undefined || val === null) return '-';
        return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const digits = e.target.value.replace(/\D/g, '');
        setLocalValue(digits);
    };

    const handleBlur = () => {
        setIsEditing(false);
        if (!localValue) {
            onSave(undefined);
            return;
        }
        const num = parseInt(localValue, 10) / 100;
        if (num !== value) {
            onSave(num);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleBlur();
        }
    };

    if (isEditing) {
        const display = localValue
            ? (parseInt(localValue, 10) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
            : '0,00';

        return (
            <input
                autoFocus
                type="text"
                value={display}
                onChange={handleChange}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                onClick={(e) => e.stopPropagation()}
                style={{ width: '100px', padding: '4px', borderRadius: '4px', border: '1px solid #ccc', color: '#000' }}
            />
        );
    }

    return (
        <div
            onClick={(e) => {
                e.stopPropagation();
                setLocalValue(value ? (value * 100).toFixed(0) : '');
                setIsEditing(true);
            }}
            style={{ cursor: 'pointer', minHeight: '20px', minWidth: '50px', borderBottom: '1px dashed #ccc' }}
            title="Clique para editar"
        >
            {formatDisplay(value)}
        </div>
    );
}

export interface EditableSelectCellProps {
    value?: string;
    options: string[];
    onSave: (newValue: string) => void;
    placeholder?: string;
}

export function EditableSelectCell({ value, options, onSave, placeholder = 'Selecione...' }: EditableSelectCellProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [localValue, setLocalValue] = useState<string>(value || '');

    useEffect(() => {
        setLocalValue(value || '');
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newValue = e.target.value;
        setLocalValue(newValue);
        if (newValue !== value) {
            onSave(newValue);
        }
        setIsEditing(false);
    };

    const handleBlur = () => {
        setIsEditing(false);
    };

    if (isEditing) {
        return (
            <select
                autoFocus
                value={localValue}
                onChange={handleChange}
                onBlur={handleBlur}
                onClick={(e) => e.stopPropagation()}
                style={{ width: '150px', padding: '4px', borderRadius: '4px', border: '1px solid #ccc', color: '#000', fontSize: '0.875rem' }}
            >
                <option value="">{placeholder}</option>
                {options.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                ))}
            </select>
        );
    }

    return (
        <div
            onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
            }}
            style={{ cursor: 'pointer', minHeight: '20px', minWidth: '50px', borderBottom: '1px dashed #ccc' }}
            title="Clique para editar"
        >
            {value || '-'}
        </div>
    );
}

export interface EditableAutocompleteCellProps {
    value?: string;
    options: string[];
    onSave: (newValue: string) => void;
    placeholder?: string;
}

export function EditableAutocompleteCell({ value, options, onSave, placeholder = 'Digite para buscar...' }: EditableAutocompleteCellProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [inputValue, setInputValue] = useState<string>(value || '');
    const [filteredOptions, setFilteredOptions] = useState<string[]>([]);
    const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
    const [showDropdown, setShowDropdown] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setInputValue(value || '');
    }, [value]);

    useEffect(() => {
        if (inputValue.trim()) {
            const normalizedInput = inputValue.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const filtered = options.filter(opt =>
                opt.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(normalizedInput)
            ).slice(0, 10);
            setFilteredOptions(filtered);
            setShowDropdown(filtered.length > 0);
        } else {
            setFilteredOptions(options.slice(0, 10));
            setShowDropdown(true);
        }
        setHighlightedIndex(-1);
    }, [inputValue, options]);

    const handleSelect = (selectedValue: string) => {
        setInputValue(selectedValue);
        setShowDropdown(false);
        setIsEditing(false);
        if (selectedValue !== value) {
            onSave(selectedValue);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value);
        setShowDropdown(true);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIndex(prev => Math.min(prev + 1, filteredOptions.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
                handleSelect(filteredOptions[highlightedIndex]);
            } else if (inputValue.trim()) {
                handleSelect(inputValue.trim());
            }
        } else if (e.key === 'Escape') {
            setInputValue(value || '');
            setIsEditing(false);
            setShowDropdown(false);
        } else if (e.key === 'Tab') {
            if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
                handleSelect(filteredOptions[highlightedIndex]);
            } else if (inputValue.trim() && inputValue !== value) {
                onSave(inputValue.trim());
            }
            setIsEditing(false);
            setShowDropdown(false);
        }
    };

    const handleBlur = (e: React.FocusEvent) => {
        if (dropdownRef.current?.contains(e.relatedTarget as Node)) {
            return;
        }
        setTimeout(() => {
            if (inputValue.trim() && inputValue !== value) {
                onSave(inputValue.trim());
            }
            setIsEditing(false);
            setShowDropdown(false);
        }, 150);
    };

    if (isEditing) {
        return (
            <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                <input
                    ref={inputRef}
                    autoFocus
                    type="text"
                    value={inputValue}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    onBlur={handleBlur}
                    onFocus={() => setShowDropdown(true)}
                    placeholder={placeholder}
                    style={{
                        width: '180px',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        border: '1px solid #2563eb',
                        color: '#000',
                        fontSize: '0.875rem',
                        outline: 'none'
                    }}
                />
                {showDropdown && filteredOptions.length > 0 && (
                    <div
                        ref={dropdownRef}
                        style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            maxHeight: '200px',
                            overflowY: 'auto',
                            backgroundColor: '#fff',
                            border: '1px solid #ccc',
                            borderRadius: '4px',
                            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                            zIndex: 1000,
                            marginTop: '2px'
                        }}
                    >
                        {filteredOptions.map((opt, index) => (
                            <div
                                key={opt}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    handleSelect(opt);
                                }}
                                onMouseEnter={() => setHighlightedIndex(index)}
                                style={{
                                    padding: '6px 10px',
                                    cursor: 'pointer',
                                    backgroundColor: highlightedIndex === index ? '#e7f1ff' : '#fff',
                                    fontSize: '0.875rem',
                                    borderBottom: index < filteredOptions.length - 1 ? '1px solid #eee' : 'none'
                                }}
                            >
                                {opt}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div
            onClick={(e) => {
                e.stopPropagation();
                setInputValue(value || '');
                setIsEditing(true);
            }}
            style={{ cursor: 'pointer', minHeight: '20px', minWidth: '50px', borderBottom: '1px dashed #ccc' }}
            title="Clique para editar"
        >
            {value || '-'}
        </div>
    );
}

export interface EditableYearCellProps {
    value?: string;
    onSave: (newValue: string) => void;
}

export function EditableYearCell({ value, onSave }: EditableYearCellProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [localValue, setLocalValue] = useState<string>(value || '');

    useEffect(() => {
        setLocalValue(value || '');
    }, [value]);

    const applyMask = (input: string) => {
        const digits = input.replace(/\D/g, '');
        if (digits.length <= 2) {
            return digits;
        }
        return `${digits.slice(0, 2)}/${digits.slice(2, 4)}`;
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const masked = applyMask(e.target.value);
        setLocalValue(masked);
    };

    const handleBlur = () => {
        setIsEditing(false);
        if (localValue !== value) {
            onSave(localValue);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleBlur();
        }
        if (e.key === 'Escape') {
            setLocalValue(value || '');
            setIsEditing(false);
        }
    };

    if (isEditing) {
        return (
            <input
                autoFocus
                type="text"
                value={localValue}
                onChange={handleChange}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                onClick={(e) => e.stopPropagation()}
                maxLength={5}
                placeholder="XX/XX"
                style={{ width: '70px', padding: '4px', borderRadius: '4px', border: '1px solid #ccc', color: '#000', textAlign: 'center' }}
            />
        );
    }

    return (
        <div
            onClick={(e) => {
                e.stopPropagation();
                setLocalValue(value || '');
                setIsEditing(true);
            }}
            style={{ cursor: 'pointer', minHeight: '20px', minWidth: '50px', borderBottom: '1px dashed #ccc' }}
            title="Clique para editar"
        >
            {value || '-'}
        </div>
    );
}
