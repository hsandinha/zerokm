'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useConfig } from '../../lib/contexts/ConfigContext';
import { useVehicleDatabase } from '../../lib/hooks/useVehicleDatabase';
import { useTablesDatabase } from '../../lib/hooks/useTablesDatabase';
import { Vehicle, VehicleService } from '../../lib/services/vehicleService';
import { TransportadoraService, Transportadora } from '../../lib/services/transportadoraService';
import { AddVehicleModal } from './AddVehicleModal';
import styles from './VehicleConsultation.module.css';
import modalStyles from './TablesManagement.module.css';
import { HighlightText } from '../HighlightText';
import { UpgradeModal } from './UpgradeModal';

const normalizeString = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

const fuelLookup: Record<string, string> = {
    'flex': 'Flex',
    'gasolina': 'Gasolina',
    'etanol': 'Etanol',
    'alcool': 'Etanol',
    'álcool': 'Etanol',
    'diesel': 'Diesel',
    'eletrico': 'Elétrico',
    'elétrico': 'Elétrico',
    'hibrido': 'Híbrido',
    'híbrido': 'Híbrido'
};

const transmissionLookup: Record<string, string> = {
    'manual': 'Manual',
    'automatico': 'Automático',
    'automático': 'Automático',
    'cvt': 'CVT'
};

const statusLookup: Record<string, string> = {
    'a faturar': 'A faturar',
    'faturar': 'A faturar',
    'refaturamento': 'Refaturamento',
    'licenciado': 'Licenciado',
    'pedido de fabrica': 'Pedido de fábrica',
    'pedido de fábrica': 'Pedido de fábrica',
    'pedido': 'Pedido de fábrica'
};

const YEAR_REGEX = /^\d{4}$/;

const BRAZIL_STATES = [
    'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO',
    'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR',
    'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'
];
const STATUS_OPTIONS = ['A faturar', 'Refaturamento', 'Licenciado', 'Pedido de fábrica'];

const formatDate = (dateInput: string | Date | undefined) => {
    if (!dateInput) return '';
    try {
        if (dateInput instanceof Date) {
            return dateInput.toLocaleDateString('pt-BR');
        }
        const date = new Date(dateInput);
        if (isNaN(date.getTime())) return dateInput;
        return date.toLocaleDateString('pt-BR');
    } catch (e) {
        return typeof dateInput === 'string' ? dateInput : '';
    }
};

const formatDateForInput = (dateInput: string | Date | undefined) => {
    if (!dateInput) return '';
    if (dateInput instanceof Date) {
        if (isNaN(dateInput.getTime())) return '';
        return dateInput.toISOString().slice(0, 10);
    }
    const trimmed = dateInput.trim();
    const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (match) {
        const [, dd, mm, yyyy] = match;
        return `${yyyy}-${mm}-${dd}`;
    }
    const parsed = new Date(trimmed);
    if (isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
};

const calculateDaysSinceUpdate = (updatedAt: string | Date | undefined): number => {
    if (!updatedAt) return 0;
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Zera horas para comparar apenas datas
    const updateDate = new Date(updatedAt);
    updateDate.setHours(0, 0, 0, 0); // Zera horas para comparar apenas datas
    const diffTime = Math.abs(now.getTime() - updateDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
};

const getUpdateStatusColor = (days: number): string => {
    if (days <= 1) return '#10b981'; // Verde
    if (days <= 3) return '#f59e0b'; // Amarelo
    return '#ef4444'; // Vermelho
};

interface VehicleConsultationProps {
    onClose?: () => void;
    role?: 'admin' | 'administrador' | 'operator' | 'operador' | 'administrativo' | 'client' | 'gratis' | 'dealership' | 'gerente' | 'vendedor';
    isInvitee?: boolean;
}

type FiltersState = {
    modelo: string;
    cor: string;
    ano: string;
    status: string;
    combustivel: string;
    transmissao: string;
    opcionais: string;
    estado: string;
    operador: string;
    cidade: string;
    concessionaria: string;
    nomeContato: string;
};

const INITIAL_FILTERS: FiltersState = {
    modelo: '',
    cor: '',
    ano: '',
    status: '',
    combustivel: '',
    transmissao: '',
    opcionais: '',
    estado: '',
    operador: '',
    cidade: '',
    concessionaria: '',
    nomeContato: ''
};

type FilterKey = keyof FiltersState;

const areFiltersEqual = (a: FiltersState, b: FiltersState) => {
    const keys = Object.keys(a) as FilterKey[];
    for (const key of keys) {
        if (a[key] !== b[key]) {
            return false;
        }
    }
    return true;
};

interface EditableCurrencyCellProps {
    value?: number;
    onSave: (newValue: number | undefined) => void;
}

interface EditableTextCellProps {
    value?: string;
    onSave: (newValue: string) => void;
    placeholder?: string;
}

function EditableTextCell({ value, onSave, placeholder = '' }: EditableTextCellProps) {
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

function EditableCurrencyCell({ value, onSave }: EditableCurrencyCellProps) {
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

// Componente para select editável inline (listbox)
interface EditableSelectCellProps {
    value?: string;
    options: string[];
    onSave: (newValue: string) => void;
    placeholder?: string;
}

function EditableSelectCell({ value, options, onSave, placeholder = 'Selecione...' }: EditableSelectCellProps) {
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

// Componente para autocomplete editável inline (input com filtro de listbox)
interface EditableAutocompleteCellProps {
    value?: string;
    options: string[];
    onSave: (newValue: string) => void;
    placeholder?: string;
}

function EditableAutocompleteCell({ value, options, onSave, placeholder = 'Digite para buscar...' }: EditableAutocompleteCellProps) {
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
            ).slice(0, 10); // Limita a 10 resultados
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
        // Verificar se o foco foi para dentro do dropdown
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

// Componente para ano com máscara XX/XX
interface EditableYearCellProps {
    value?: string;
    onSave: (newValue: string) => void;
}

function EditableYearCell({ value, onSave }: EditableYearCellProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [localValue, setLocalValue] = useState<string>(value || '');

    useEffect(() => {
        setLocalValue(value || '');
    }, [value]);

    const applyMask = (input: string) => {
        // Remove tudo que não é número
        const digits = input.replace(/\D/g, '');
        // Aplica máscara XX/XX
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

interface EditableDateCellProps {
    value?: string | Date;
    onSave: (newValue: string) => void;
}

function EditableDateCell({ value, onSave }: EditableDateCellProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [localValue, setLocalValue] = useState<string>(formatDateForInput(value));

    useEffect(() => {
        setLocalValue(formatDateForInput(value));
    }, [value]);

    const handleBlur = () => {
        const normalizedCurrent = formatDateForInput(value);
        setIsEditing(false);
        if (!localValue) {
            setLocalValue(normalizedCurrent);
            return;
        }
        if (localValue !== normalizedCurrent) {
            onSave(localValue);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleBlur();
        }
        if (e.key === 'Escape') {
            setLocalValue(formatDateForInput(value));
            setIsEditing(false);
        }
    };

    if (isEditing) {
        return (
            <input
                autoFocus
                type="date"
                value={localValue}
                onChange={(e) => setLocalValue(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                onClick={(e) => e.stopPropagation()}
                style={{ width: '145px', padding: '4px', borderRadius: '4px', border: '1px solid #ccc', color: '#000' }}
            />
        );
    }

    return (
        <div
            onClick={(e) => {
                e.stopPropagation();
                setLocalValue(formatDateForInput(value));
                setIsEditing(true);
            }}
            style={{ cursor: 'pointer', minHeight: '20px', minWidth: '90px', borderBottom: '1px dashed #ccc' }}
            title="Clique para editar"
        >
            {formatDate(value)}
        </div>
    );
}

export function VehicleConsultation({ onClose, role = 'operator', isInvitee = false }: VehicleConsultationProps) {
    const { data: session } = useSession();
    const isClientReadOnly = role === 'client' || role === 'gratis' || role === 'vendedor';
    const { margem, fixedMargin, marginMode, setMargem, setMarginConfig } = useConfig();
    const [showMargemModal, setShowMargemModal] = useState(false);
    const [inputMargem, setInputMargem] = useState<string>(margem.toString());
    const [inputFixedMargin, setInputFixedMargin] = useState<string>(fixedMargin.toString());
    const [inputMarginMode, setInputMarginMode] = useState<'percent' | 'fixed'>(marginMode);
    const [forceUpdate, setForceUpdate] = useState(false);

    useEffect(() => {
        setInputMargem(margem.toString());
        setInputFixedMargin(fixedMargin.toString());
        setInputMarginMode(marginMode);
    }, [margem, fixedMargin, marginMode]);

    const handleSaveMargem = async () => {
        const newMargem = parseFloat(inputMargem) || 0;
        const newFixedMargin = parseFloat(inputFixedMargin) || 0;

        // Usar setMarginConfig se disponível para atualizar todos os valores
        if (setMarginConfig) {
            setMarginConfig({ margem: newMargem, marginMode: inputMarginMode, fixedMargin: newFixedMargin });
        } else {
            setMargem(newMargem);
        }

        const margemLabel = inputMarginMode === 'percent'
            ? `${newMargem}%`
            : `R$ ${newFixedMargin.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

        if (forceUpdate) {
            try {
                const res = await fetch('/api/vehicles', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'reset_sales_price' })
                });

                if (res.ok) {
                    alert(`Margem de ${margemLabel} salva e aplicada a todos os veículos!`);
                    // Recarregar lista para refletir mudanças
                    const effectiveSearch = searchTerm && searchTerm.length < 3 ? '' : searchTerm;
                    await getVehiclesPaginated({
                        page: currentPage,
                        itemsPerPage: itemsPerPage === -1 ? 1000 : itemsPerPage,
                        searchTerm: effectiveSearch,
                        filters,
                        sortConfig: sortConfig.key ? sortConfig : undefined
                    });
                } else {
                    alert('Margem salva, mas erro ao atualizar veículos.');
                }
            } catch (error) {
                console.error('Erro ao resetar preços:', error);
                alert('Margem salva, mas erro ao atualizar veículos.');
            }
        } else {
            alert(`Margem de ${margemLabel} salva com sucesso!`);
        }

        setShowMargemModal(false);
        setForceUpdate(false);
    };

    // Estado efetivo (aplicado) para busca e filtros
    const [searchTerm, setSearchTerm] = useState('');
    // Estado pendente (digitando) para evitar disparar requisições a cada tecla
    const [pendingSearchTerm, setPendingSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
    const [showVehicleForm, setShowVehicleForm] = useState(false);
    const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
    const [showImportModal, setShowImportModal] = useState(false);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [localCredits, setLocalCredits] = useState<number>((session?.user as any)?.credits ?? 0);
    const [confirmCreditVehicle, setConfirmCreditVehicle] = useState<Vehicle | null>(null);
    const [isConsumingCredit, setIsConsumingCredit] = useState(false);

    // Sync localCredits when session loads (JWT might arrive after first render)
    useEffect(() => {
        const sessionCredits = (session?.user as any)?.credits;
        if (typeof sessionCredits === 'number') {
            setLocalCredits(sessionCredits);
        }
    }, [(session?.user as any)?.credits]);

    const handleLocationClick = async (vehicle: Vehicle) => {
        if (role !== 'gratis') {
            setLocationVehicle(vehicle);
            return;
        }
        if (localCredits > 0) {
            setConfirmCreditVehicle(vehicle);
        } else {
            setShowUpgradeModal(true);
        }
    };

    const confirmConsumeCredit = async () => {
        if (!confirmCreditVehicle) return;
        setIsConsumingCredit(true);
        try {
            const res = await fetch('/api/user/credits', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'use' }),
            });
            if (res.ok) {
                const data = await res.json();
                setLocalCredits(data.credits);
                setLocationVehicle(confirmCreditVehicle);
                setConfirmCreditVehicle(null);
            } else {
                setShowUpgradeModal(true);
                setConfirmCreditVehicle(null);
            }
        } catch {
            setShowUpgradeModal(true);
            setConfirmCreditVehicle(null);
        } finally {
            setIsConsumingCredit(false);
        }
    };
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [importResults, setImportResults] = useState<{
        success: number;
        headers?: string[];
        errors: Array<{ line: number; reason: string; raw?: string; columns?: string[] }>;
        rows: Array<{ line: number; status: 'ok' | 'error'; columns: string[]; modelo?: string; cor?: string; reason?: string }>;
    } | null>(null);
    const [importResultTab, setImportResultTab] = useState<'success' | 'error'>('success');
    const [importProgress, setImportProgress] = useState<{ current: number; total: number; isImporting: boolean }>({
        current: 0,
        total: 0,
        isImporting: false
    });
    const [filters, setFilters] = useState<FiltersState>(() => ({ ...INITIAL_FILTERS }));
    const [knownColors, setKnownColors] = useState<string[]>([]);
    const [availableModels, setAvailableModels] = useState<string[]>([]);
    const [modelSearch, setModelSearch] = useState('');
    const [selectedModel, setSelectedModel] = useState<string | null>(null);
    const [focusedModelIndex, setFocusedModelIndex] = useState<number>(-1);
    const modelListRef = useRef<HTMLDivElement>(null);
    const suggestionsCacheRef = useRef<Map<string, Record<string, string[]>>>(new Map());
    const normalizedColorMap = useMemo(() => {
        const map: Record<string, string> = {};
        knownColors.forEach((color) => {
            map[normalizeString(color)] = color;
        });
        return map;
    }, [knownColors]);
    const [sortConfig, setSortConfig] = useState<{ key: keyof Vehicle | null; direction: 'asc' | 'desc' }>({
        key: 'preco',
        direction: 'asc'
    });
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(50);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [locationVehicle, setLocationVehicle] = useState<Vehicle | null>(null);
    const [transportadoras, setTransportadoras] = useState<Transportadora[]>([]);
    const [freteModal, setFreteModal] = useState<{ isOpen: boolean; items: Transportadora[]; estado: string }>({
        isOpen: false,
        items: [],
        estado: ''
    });
    const [isExporting, setIsExporting] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);

    const handleExport = async (format: 'csv' | 'json') => {
        try {
            setIsExporting(true);
            setShowExportMenu(false);

            // Fetch all data with current filters
            // Using a large limit to get all matching records
            const result = await getVehiclesPaginated({
                page: 1,
                itemsPerPage: 100000,
                searchTerm: searchTerm,
                filters: filters,
                sortConfig: sortConfig.key ? sortConfig : undefined
            });

            const dataToExport = result.data;

            if (format === 'json') {
                const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `veiculos_${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            } else if (format === 'csv') {
                // Generate CSV
                const headers = [
                    'Modelo', 'Transmissão', 'Combustível', 'Cor', 'Ano',
                    'Opcionais', 'Preço Compra', 'Preço Venda', 'Status',
                    'Data Entrada', 'Cidade', 'Estado', 'Concessionária',
                    'Operador', 'Contato', 'Observações'
                ];

                const csvContent = [
                    headers.join(','),
                    ...dataToExport.map(v => {
                        const escapeCsv = (field: any) => {
                            if (field === null || field === undefined) return '';
                            const stringValue = String(field);
                            if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
                                return `"${stringValue.replace(/"/g, '""')}"`;
                            }
                            return stringValue;
                        };

                        return [
                            escapeCsv(v.modelo),
                            escapeCsv(v.transmissao),
                            escapeCsv(v.combustivel),
                            escapeCsv(v.cor),
                            escapeCsv(v.ano),
                            escapeCsv(v.opcionais),
                            escapeCsv((v.preco || 0).toFixed(2)),
                            escapeCsv((v.valorVenda || 0).toFixed(2)),
                            escapeCsv(v.status),
                            escapeCsv(v.dataEntrada ? new Date(v.dataEntrada).toLocaleDateString('pt-BR') : ''),
                            escapeCsv(v.cidade),
                            escapeCsv(v.estado),
                            escapeCsv(v.concessionaria),
                            escapeCsv(v.operador),
                            escapeCsv(v.nomeContato),
                            escapeCsv(v.observacoes)
                        ].join(',');
                    })
                ].join('\n');

                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `veiculos_${new Date().toISOString().split('T')[0]}.csv`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }
        } catch (error) {
            console.error('Erro ao exportar:', error);
            alert('Erro ao exportar dados.');
        } finally {
            setIsExporting(false);
        }
    };

    const percent = importProgress.total > 0
        ? Math.max(0, Math.min(100, Math.round((importProgress.current / importProgress.total) * 100)))
        : 0;

    // Usar o hook do banco de dados
    const { vehicles, totalItems, loading, error, refreshVehicles, updateVehicle, deleteVehicle, deleteVehicles, getVehiclesPaginated } = useVehicleDatabase(role);
    const { importVeiculosFromCSV, modelos, cores } = useTablesDatabase();

    // Listas de opções para os selects editáveis
    const modeloOptions = useMemo(() => modelos.map(m => m.nome).sort(), [modelos]);
    const transmissaoOptions = ['Manual', 'Automático', 'CVT', 'Automatizado'];
    const combustivelOptions = ['Flex', 'Gasolina', 'Etanol', 'Diesel', 'Elétrico', 'Híbrido'];

    // Carregar cores conhecidas para detecção automática
    useEffect(() => {
        const abortController = new AbortController();

        const loadColors = async () => {
            try {
                const res = await fetch(`/api/vehicles/suggestions?fields=cor&limit=200&accessProfile=${encodeURIComponent(role || '')}`, { signal: abortController.signal });
                if (!res.ok) {
                    console.error('Não foi possível carregar sugestões de cor:', res.status);
                    return;
                }
                const data = await res.json();
                const suggestions = Array.isArray(data?.suggestions?.cor)
                    ? data.suggestions.cor
                    : Array.isArray(data?.suggestions)
                        ? data.suggestions
                        : [];
                const uniqueColors = Array.from(new Set((suggestions as string[]).filter(Boolean)));
                setKnownColors(uniqueColors);
            } catch (error: any) {
                if (error?.name !== 'AbortError') {
                    console.error('Erro ao carregar cores para busca inteligente:', error);
                }
            }
        };

        const loadModels = async () => {
            try {
                const res = await fetch(`/api/vehicles/suggestions?fields=modelo&limit=1000&accessProfile=${encodeURIComponent(role || '')}`, { signal: abortController.signal });
                if (!res.ok) return;
                const data = await res.json();
                if (data.suggestions?.modelo) {
                    // Ordena alfabeticamente (A-Z)
                    const sortedModels = [...data.suggestions.modelo].sort((a, b) =>
                        a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
                    );
                    setAvailableModels(sortedModels);
                }
            } catch (error: any) {
                if (error?.name !== 'AbortError') {
                    console.error('Erro ao carregar modelos:', error);
                }
            }
        };

        loadColors();
        loadModels();

        // Carregar transportadoras
        TransportadoraService.getAllTransportadoras()
            .then(data => setTransportadoras(data.filter(t => t.ativo)))
            .catch(err => console.error('Erro ao carregar transportadoras:', err));

        return () => abortController.abort();
    }, []);

    // Carregar dados paginados do servidor
    useEffect(() => {
        const loadData = async () => {
            // Se busca tiver menos de 3 caracteres, não dispara (segue placeholder)
            const effectiveSearch = searchTerm && searchTerm.length < 3 ? '' : searchTerm;

            try {
                await getVehiclesPaginated({
                    page: currentPage,
                    itemsPerPage: itemsPerPage === -1 ? 1000 : itemsPerPage,
                    searchTerm: effectiveSearch,
                    filters,
                    sortConfig: sortConfig.key ? sortConfig : undefined
                });
            } catch (error) {
                console.error('Erro ao carregar dados paginados:', error);
            }
        };

        // Debounce apenas quando estados efetivos mudam
        const timeoutId = setTimeout(() => {
            loadData();
        }, 700);

        return () => clearTimeout(timeoutId);
    }, [currentPage, itemsPerPage, searchTerm, filters, sortConfig, getVehiclesPaginated]);

    const getFreteInfo = (estado: string) => {
        if (!estado) return { count: 0, items: [], value: 0 };
        // Normalizar estado para comparação (pegar sigla se tiver "Nome - UF")
        const uf = estado.includes('-') ? estado.split('-')[1].trim() : estado;

        // Tentar encontrar por UF exata ou string completa
        const items = transportadoras.filter(t =>
            t.estado.toLowerCase() === uf.toLowerCase() ||
            t.estado.toLowerCase() === estado.toLowerCase() ||
            (t.estado.includes('-') && t.estado.split('-')[1].trim().toLowerCase() === uf.toLowerCase())
        );

        return {
            count: items.length,
            items,
            value: items.length > 0 ? items[0].valor : 0
        };
    };

    const handleUpdateValorVenda = async (vehicle: Vehicle, newValue: number | undefined) => {
        try {
            if (!vehicle.id) return;

            // Usar o serviço diretamente para evitar que o hook resete a ordenação/paginação
            await VehicleService.updateVehicle(vehicle.id, { ...vehicle, valorVenda: newValue });

            // Recarregar mantendo o estado atual
            const effectiveSearch = searchTerm && searchTerm.length < 3 ? '' : searchTerm;
            await getVehiclesPaginated({
                page: currentPage,
                itemsPerPage: itemsPerPage === -1 ? 1000 : itemsPerPage,
                searchTerm: effectiveSearch,
                filters,
                sortConfig: sortConfig.key ? sortConfig : undefined
            });
        } catch (error) {
            console.error('Erro ao atualizar valor de venda:', error);
            alert('Erro ao atualizar valor de venda');
        }
    };

    const handleUpdateOpcionais = async (vehicle: Vehicle, newValue: string) => {
        try {
            if (!vehicle.id) return;

            await VehicleService.updateVehicle(vehicle.id, { ...vehicle, opcionais: newValue });

            const effectiveSearch = searchTerm && searchTerm.length < 3 ? '' : searchTerm;
            await getVehiclesPaginated({
                page: currentPage,
                itemsPerPage: itemsPerPage === -1 ? 1000 : itemsPerPage,
                searchTerm: effectiveSearch,
                filters,
                sortConfig: sortConfig.key ? sortConfig : undefined
            });
        } catch (error) {
            console.error('Erro ao atualizar opcionais:', error);
            alert('Erro ao atualizar opcionais');
        }
    };

    // Função genérica para atualizar campos do veículo
    const handleUpdateVehicleField = async (
        vehicle: Vehicle,
        field: keyof Vehicle,
        newValue: string | number | Date | undefined
    ) => {
        try {
            if (!vehicle.id) return;

            let normalizedValue: string | number | Date | undefined = newValue;
            // Evita deslocamento de data por fuso ao salvar valores YYYY-MM-DD.
            if (field === 'dataEntrada' && typeof newValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(newValue)) {
                normalizedValue = `${newValue}T12:00:00Z`;
            }

            await VehicleService.updateVehicle(vehicle.id, { ...vehicle, [field]: normalizedValue });

            const effectiveSearch = searchTerm && searchTerm.length < 3 ? '' : searchTerm;
            await getVehiclesPaginated({
                page: currentPage,
                itemsPerPage: itemsPerPage === -1 ? 1000 : itemsPerPage,
                searchTerm: effectiveSearch,
                filters,
                sortConfig: sortConfig.key ? sortConfig : undefined
            });
        } catch (error) {
            console.error(`Erro ao atualizar ${field}:`, error);
            alert(`Erro ao atualizar ${field}`);
        }
    };

    const handleUpdatePreco = async (vehicle: Vehicle, newValue: number | undefined) => {
        try {
            if (!vehicle.id) return;

            await VehicleService.updateVehicle(vehicle.id, { ...vehicle, preco: newValue });

            const effectiveSearch = searchTerm && searchTerm.length < 3 ? '' : searchTerm;
            await getVehiclesPaginated({
                page: currentPage,
                itemsPerPage: itemsPerPage === -1 ? 1000 : itemsPerPage,
                searchTerm: effectiveSearch,
                filters,
                sortConfig: sortConfig.key ? sortConfig : undefined
            });
        } catch (error) {
            console.error('Erro ao atualizar preço de compra:', error);
            alert('Erro ao atualizar preço de compra');
        }
    };

    const [prefixWarnings, setPrefixWarnings] = useState<string[]>([]);

    const processInput = useCallback(async (input: string, signal: AbortSignal) => {
        const tokens = input.split(/\s+/).filter(Boolean);
        if (!tokens.length) {
            // Don't clear filters/search if input is empty - let explicit clear button handle it
            return;
        }

        // Start with current filters to allow additive filtering
        const nextFilters = { ...filters };
        const warnings: string[] = [];
        const residualTokens: string[] = [];

        // Determine allowed fields based on role
        const canViewContactInfo = ['admin', 'administrador', 'administrativo', 'gerente', 'dealership', 'operator', 'operador', 'vendedor'].includes(role);

        let allowedFields: FilterKey[] = ['transmissao', 'combustivel', 'status', 'cor', 'ano', 'estado', 'opcionais'];
        if (canViewContactInfo) {
            allowedFields.push('operador', 'cidade', 'concessionaria', 'nomeContato');
        }

        const datasetOrder: FilterKey[] = allowedFields;

        // If a model is already selected via sidebar, do not auto-detect model from search input
        // This prevents the search input from overriding the sidebar selection
        if (selectedModel) {
            // No need to remove 'modelo' as it is not in datasetOrder anymore
        }

        const datasetFieldGetters: Record<FilterKey, (vehicle: Vehicle) => string | undefined> = {
            modelo: (vehicle) => vehicle.modelo,
            cor: (vehicle) => vehicle.cor,
            ano: (vehicle) => vehicle.ano,
            status: (vehicle) => vehicle.status,
            combustivel: (vehicle) => vehicle.combustivel,
            transmissao: (vehicle) => vehicle.transmissao,
            opcionais: (vehicle) => vehicle.opcionais,
            estado: (vehicle) => vehicle.estado,
            operador: (vehicle) => vehicle.operador,
            cidade: (vehicle) => vehicle.cidade,
            concessionaria: (vehicle) => vehicle.concessionaria,
            nomeContato: (vehicle) => vehicle.nomeContato
        };

        const applyFilterValue = (field: FilterKey, value: string) => {
            nextFilters[field] = value;
        };

        const findInVehicles = (normalizedToken: string): { field: FilterKey; value: string } | null => {
            for (const field of datasetOrder) {
                for (const vehicle of vehicles) {
                    const fieldValue = datasetFieldGetters[field](vehicle);
                    if (!fieldValue) continue;
                    if (normalizeString(fieldValue).includes(normalizedToken)) {
                        return { field, value: fieldValue };
                    }
                }
            }
            return null;
        };

        const fetchSuggestionsForToken = async (token: string) => {
            const cacheKey = normalizeString(token);
            if (suggestionsCacheRef.current.has(cacheKey)) {
                return suggestionsCacheRef.current.get(cacheKey)!;
            }
            try {
                // Construct fields list dynamically based on permissions
                const suggestionFields = ['modelo', 'opcionais', 'cor'];
                if (canViewContactInfo) {
                    suggestionFields.push('concessionaria', 'nomeContato', 'cidade', 'operador');
                }

                const response = await fetch(`/api/vehicles/suggestions?fields=${suggestionFields.join(',')}&searchTerm=${encodeURIComponent(token)}&limit=20&accessProfile=${encodeURIComponent(role || '')}`, { signal });
                if (!response.ok) {
                    return null;
                }
                const data = await response.json();
                if (signal.aborted) {
                    return null;
                }
                const suggestions = (data?.suggestions || {}) as Record<string, string[]>;
                suggestionsCacheRef.current.set(cacheKey, suggestions);
                return suggestions;
            } catch (error: any) {
                if (error?.name === 'AbortError' || signal.aborted) {
                    return null;
                }
                console.error('Erro ao buscar sugestões para auto-filtro:', error);
                return null;
            }
        };

        for (const token of tokens) {
            if (signal.aborted) {
                return;
            }

            const trimmed = token.trim();
            if (!trimmed) {
                continue;
            }

            const prefixPattern = new RegExp(`^(${allowedFields.join('|')}|modelo|preco):(.+)$`, 'i');
            const prefixMatch = trimmed.match(prefixPattern);
            if (prefixMatch) {
                const [, key, rawValue] = prefixMatch;
                const value = rawValue.trim();
                if (!value) {
                    residualTokens.push(trimmed);
                    continue;
                }
                switch (key.toLowerCase()) {
                    case 'combustivel': {
                        const mapped = fuelLookup[normalizeString(value)] || value;
                        applyFilterValue('combustivel', mapped);
                        break;
                    }
                    case 'transmissao': {
                        const mapped = transmissionLookup[normalizeString(value)] || value;
                        applyFilterValue('transmissao', mapped);
                        break;
                    }
                    case 'status': {
                        const mapped = statusLookup[normalizeString(value)] || value;
                        applyFilterValue('status', mapped);
                        break;
                    }
                    case 'ano': {
                        applyFilterValue('ano', value);
                        break;
                    }
                    case 'cor': {
                        const normalizedValue = normalizeString(value);
                        const canonical = normalizedColorMap[normalizedValue] || value;
                        applyFilterValue('cor', canonical);
                        break;
                    }
                    case 'modelo': {
                        applyFilterValue('modelo', value);
                        break;
                    }
                    case 'opcionais': {
                        applyFilterValue('opcionais', value);
                        break;
                    }
                    case 'estado': {
                        applyFilterValue('estado', value);
                        break;
                    }
                    case 'operador': {
                        applyFilterValue('operador', value);
                        break;
                    }
                    case 'cidade': {
                        applyFilterValue('cidade', value);
                        break;
                    }
                    case 'concessionaria': {
                        applyFilterValue('concessionaria', value);
                        break;
                    }
                    case 'nomecontato': {
                        applyFilterValue('nomeContato', value);
                        break;
                    }
                    case 'preco': {
                        residualTokens.push(trimmed);
                        warnings.push('Prefixo preco não é aplicado na busca do servidor.');
                        break;
                    }
                    default: {
                        residualTokens.push(trimmed);
                        break;
                    }
                }
                continue;
            }

            const normalizedToken = normalizeString(trimmed);

            if (fuelLookup[normalizedToken]) {
                applyFilterValue('combustivel', fuelLookup[normalizedToken]);
                continue;
            }
            if (transmissionLookup[normalizedToken]) {
                applyFilterValue('transmissao', transmissionLookup[normalizedToken]);
                continue;
            }
            if (statusLookup[normalizedToken]) {
                applyFilterValue('status', statusLookup[normalizedToken]);
                continue;
            }
            if (YEAR_REGEX.test(trimmed)) {
                applyFilterValue('ano', trimmed);
                continue;
            }

            if (BRAZIL_STATES.includes(trimmed.toUpperCase())) {
                applyFilterValue('estado', trimmed.toUpperCase());
                continue;
            }

            const colorCanonical = normalizedColorMap[normalizedToken];
            if (colorCanonical) {
                applyFilterValue('cor', colorCanonical);
                continue;
            }

            const datasetMatch = findInVehicles(normalizedToken);
            if (datasetMatch) {
                const { field, value } = datasetMatch;
                if (field === 'modelo' || field === 'opcionais') {
                    applyFilterValue(field, trimmed);
                } else if (field === 'cor') {
                    const normalizedValue = normalizeString(value);
                    applyFilterValue('cor', normalizedColorMap[normalizedValue] || value);
                } else if (field === 'ano') {
                    applyFilterValue('ano', trimmed);
                } else {
                    applyFilterValue(field, value);
                }
                continue;
            }

            if (trimmed.length < 2) {
                residualTokens.push(trimmed);
                continue;
            }

            const suggestions = await fetchSuggestionsForToken(trimmed);
            if (signal.aborted) {
                return;
            }
            if (suggestions) {
                // Prioritize fields based on role
                const suggestionOrder: FilterKey[] = ['cor', 'modelo'];
                if (canViewContactInfo) {
                    suggestionOrder.push('concessionaria', 'nomeContato', 'cidade', 'operador');
                }
                suggestionOrder.push('opcionais');

                // If model is selected, don't use model suggestions to override filter
                if (selectedModel) {
                    // No need to remove 'modelo' as it is not in suggestionOrder anymore
                }

                let matchedSuggestion = false;
                for (const field of suggestionOrder) {
                    const values = suggestions[field];
                    if (Array.isArray(values) && values.length > 0) {
                        if (field === 'cor') {
                            const match = values.find((option) => normalizeString(option) === normalizedToken) || values[0];
                            applyFilterValue('cor', match || trimmed);
                        } else if (field === 'concessionaria' || field === 'nomeContato' || field === 'cidade' || field === 'operador') {
                            // For these fields, use the exact suggestion value if possible, or the trimmed token
                            const match = values.find((option) => normalizeString(option).includes(normalizedToken)) || values[0];
                            applyFilterValue(field, match || trimmed);
                        } else {
                            applyFilterValue(field, trimmed);
                        }
                        matchedSuggestion = true;
                        break;
                    }
                }
                if (matchedSuggestion) {
                    continue;
                }
            }

            residualTokens.push(trimmed);
        }

        if (signal.aborted) {
            return;
        }

        const residual = residualTokens.join(' ');

        let filtersChanged = false;
        setFilters((prev) => {
            if (areFiltersEqual(prev, nextFilters)) {
                return prev;
            }
            filtersChanged = true;
            return nextFilters;
        });

        let searchChanged = false;
        setSearchTerm((prev) => {
            if (prev === residual) {
                return prev;
            }
            searchChanged = true;
            return residual;
        });

        setPendingSearchTerm((prev) => (prev === residual ? prev : residual));

        setPrefixWarnings((prev) => {
            if (prev.length === warnings.length && prev.every((value, index) => value === warnings[index])) {
                return prev;
            }
            return warnings;
        });

        if (filtersChanged || searchChanged) {
            setCurrentPage(1);
        }
    }, [vehicles, normalizedColorMap, filters, selectedModel, role, session]);

    // Auto-aplicar busca com debounce quando usuário digita (detecta coluna automaticamente)
    useEffect(() => {
        const raw = pendingSearchTerm || '';
        const term = raw.trim();

        // If empty and all filters are clear, just clear warnings and return
        const hasAnyFilter = Object.values(filters).some(v => v !== '');
        if (!term && !hasAnyFilter) {
            setPrefixWarnings([]);
            return;
        }

        // If term is empty but filters exist, don't process (avoid clearing existing filters)
        if (!term) {
            return;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            processInput(term, controller.signal).catch((error: any) => {
                if (error?.name === 'AbortError' || controller.signal.aborted) {
                    return;
                }
                console.error('Erro ao processar busca inteligente:', error);
            });
        }, 1000);

        return () => {
            controller.abort();
            clearTimeout(timeoutId);
        };
    }, [pendingSearchTerm, processInput, filters]);

    // Função para calcular preço com margem (percentual ou valor fixo)
    const calculatePriceWithMargin = (basePrice: number) => {
        if (marginMode === 'fixed') {
            return (basePrice || 0) + (fixedMargin || 0);
        }
        return (basePrice || 0) * (1 + margem / 100);
    };

    // Função para calcular preço para o cliente (aplica margem do cliente sobre o valorVenda)
    const calculateClientPrice = (vehicle: { preco?: number; valorVenda?: number }) => {
        // Pega o valorVenda já definido, ou se não existir, o preço de compra
        const basePrice = vehicle.valorVenda || vehicle.preco || 0;
        if (marginMode === 'fixed') {
            return basePrice + (fixedMargin || 0);
        }
        return basePrice * (1 + margem / 100);
    };

    // Função para editar veículo
    const handleEditVehicle = (vehicle: Vehicle) => {
        setEditingVehicle(vehicle);
        setShowVehicleForm(true);
    };

    const handleCloseVehicleForm = () => {
        setShowVehicleForm(false);
        setEditingVehicle(null);
    };

    const handleNewVehicleClick = () => {
        if (showVehicleForm && !editingVehicle) {
            handleCloseVehicleForm();
            return;
        }
        setEditingVehicle(null);
        setShowVehicleForm(true);
    };

    const handleWhatsAppClick = (vehicle: Vehicle) => {
        if (!vehicle.telefone) {
            alert('Telefone não disponível para este veículo.');
            return;
        }

        // Remove non-numeric characters
        const phone = vehicle.telefone.replace(/\D/g, '');
        const message = encodeURIComponent(
            `Olá, tenho interesse no veículo ${vehicle.modelo} ${vehicle.cor} ${vehicle.ano} (R$ ${calculateClientPrice(vehicle).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`
        );

        window.open(`https://wa.me/55${phone}?text=${message}`, '_blank');
    };

    // Função para excluir veículo
    const handleDeleteVehicle = async (vehicle: Vehicle) => {
        if (window.confirm(`Tem certeza que deseja excluir o veículo ${vehicle.modelo}?`)) {
            try {
                const success = await deleteVehicle(vehicle.id!);
                if (success) {
                    alert('Veículo excluído com sucesso!');
                } else {
                    alert('Erro ao excluir veículo.');
                }
            } catch (error) {
                console.error('Erro ao excluir veículo:', error);
                alert('Erro ao excluir veículo.');
            }
        }
    };

    // Importação CSV - helpers e handlers
    const downloadFullReportCsv = () => {
        if (!importResults) return;
        const originalHeaders = (importResults.headers && importResults.headers.length > 0)
            ? importResults.headers
            : ['dataEntrada', 'modelo', 'transmissao', 'combustivel', 'cor', 'ano', 'opcionais', 'preco', 'status',
                'observacoes', 'cidade', 'estado', 'frete', 'telefone', 'concessionaria', 'nomeContato', 'operador'];
        const header = ['linha', 'resultado', 'motivo', ...originalHeaders].join(';');
        const rows = importResults.rows.map((r) => {
            const cols = r.columns ? [...r.columns] : new Array(originalHeaders.length).fill('');
            while (cols.length < originalHeaders.length) cols.push('');
            while (cols.length > originalHeaders.length) cols.length = originalHeaders.length;
            const escaped = cols.map(v => `"${(v ?? '').replace(/"/g, '""')}"`);
            const resultado = r.status === 'ok' ? 'INSERIDO' : 'ERRO';
            const motivo = `"${(r.reason || '').replace(/"/g, '""')}"`;
            return [r.line, resultado, motivo, ...escaped].join(';');
        });
        const csv = '\uFEFF' + [header, ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `relatorio-importacao-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && file.type === 'text/csv') {
            setCsvFile(file);
        } else {
            alert('Por favor, selecione um arquivo CSV válido.');
        }
    };

    const handleImportCSV = async () => {
        if (!csvFile) {
            alert('Selecione um arquivo CSV primeiro.');
            return;
        }

        try {
            const text = await csvFile.text();
            const lines = text.split('\n').filter(line => line.trim()).length - 1;

            setImportProgress({ current: 0, total: lines, isImporting: true });

            const results = await importVeiculosFromCSV(text, (current, total) => {
                setImportProgress({ current, total, isImporting: true });
            }, {
                validModelos: modelos.map(m => m.nome),
                validCores: cores.map(c => c.nome)
            });

            setImportResults(results);
            setImportProgress({ current: 0, total: 0, isImporting: false });

            if (results.success > 0) {
                alert(`Importação concluída! ${results.success} veículos processados com sucesso.`);
                if (results.errors.length > 0) {
                    console.warn('Erros durante a importação:', results.errors);
                }
                await refreshVehicles();
            } else {
                alert('Nenhum veículo foi importado. Verifique o formato do arquivo.');
            }
        } catch (error) {
            console.error('Erro na importação:', error);
            alert('Erro ao processar o arquivo CSV.');
            setImportProgress({ current: 0, total: 0, isImporting: false });
        }
    };

    const handleSort = (key: keyof Vehicle) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    // Lógica de Paginação (Server-side)
    // Os veículos já vêm filtrados e paginados do servidor via auto-search com debounce
    const totalPages = itemsPerPage === -1 ? 1 : Math.ceil(totalItems / itemsPerPage);
    const displayVehicles = vehicles; // Server-side já traz filtrado

    const handlePageChange = (page: number) => {
        if (page >= 1 && page <= totalPages) {
            setCurrentPage(page);
        }
    };

    const handleItemsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = parseInt(e.target.value);
        setItemsPerPage(value);
        setCurrentPage(1);
    };

    const clearFilters = () => {
        setPendingSearchTerm('');
        setSearchTerm('');
        setFilters({ ...INITIAL_FILTERS });
        setPrefixWarnings([]);
        setCurrentPage(1);
    };
    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            const allIds = displayVehicles.map(v => v.id).filter(Boolean) as string[];
            setSelectedIds(allIds);
        } else {
            setSelectedIds([]);
        }
    };

    const handleSelectOne = (id: string) => {
        setSelectedIds(prev => {
            if (prev.includes(id)) {
                return prev.filter(i => i !== id);
            } else {
                return [...prev, id];
            }
        });
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;

        if (confirm(`Tem certeza que deseja excluir ${selectedIds.length} veículos selecionados?`)) {
            const success = await deleteVehicles(selectedIds);
            if (success) {
                alert('Veículos excluídos com sucesso!');
                setSelectedIds([]);
            } else {
                alert('Erro ao excluir alguns veículos.');
            }
        }
    };

    const handleBulkUpdateDate = async () => {
        if (selectedIds.length === 0) return;

        if (confirm(`Deseja atualizar a data de ${selectedIds.length} veículos para hoje?`)) {
            try {
                const res = await fetch('/api/vehicles', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'update_date', ids: selectedIds })
                });

                if (res.ok) {
                    const data = await res.json();
                    alert(`Data de atualização atualizada para ${data.modifiedCount} veículos!`);
                    setSelectedIds([]);
                    // Recarregar lista para refletir mudanças
                    const effectiveSearch = searchTerm && searchTerm.length < 3 ? '' : searchTerm;
                    await getVehiclesPaginated({
                        page: currentPage,
                        itemsPerPage: itemsPerPage === -1 ? 1000 : itemsPerPage,
                        searchTerm: effectiveSearch,
                        filters,
                        sortConfig: sortConfig.key ? sortConfig : undefined
                    });
                } else {
                    alert('Erro ao atualizar data dos veículos.');
                }
            } catch (error) {
                console.error('Erro ao atualizar data:', error);
                alert('Erro ao atualizar data dos veículos.');
            }
        }
    };

    const handleModelSelect = (model: string | null) => {
        setSelectedModel(model);
        setFilters(prev => ({ ...prev, modelo: model || '' }));
        setCurrentPage(1);
    };

    const filteredModels = useMemo(() => {
        const filtered = availableModels.filter(m =>
            normalizeString(m).includes(normalizeString(modelSearch))
        );
        // If no search, show top 25 (since availableModels is already sorted by count from backend)
        if (!modelSearch) {
            return filtered.slice(0, 25);
        }
        return filtered;
    }, [availableModels, modelSearch]);

    // Sync filters.modelo with selectedModel in case it changes via search input
    useEffect(() => {
        if (filters.modelo !== (selectedModel || '')) {
            if (filters.modelo === '') {
                setSelectedModel(null);
            } else {
                setSelectedModel(filters.modelo);
            }
        }
    }, [filters.modelo]);

    const handleModelSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const totalItems = filteredModels.length + 1; // +1 for "Todos os Modelos"

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setFocusedModelIndex(prev => {
                const nextIndex = prev + 1;
                return nextIndex >= totalItems ? 0 : nextIndex;
            });
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setFocusedModelIndex(prev => {
                const nextIndex = prev - 1;
                return nextIndex < 0 ? totalItems - 1 : nextIndex;
            });
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (focusedModelIndex === 0) {
                handleModelSelect(null);
            } else if (focusedModelIndex > 0) {
                const modelToSelect = filteredModels[focusedModelIndex - 1];
                if (modelToSelect) {
                    handleModelSelect(modelToSelect);
                }
            }
        }
    };

    // Reset focused index when search changes
    useEffect(() => {
        setFocusedModelIndex(0);
    }, [modelSearch]);

    // Scroll focused item into view
    useEffect(() => {
        if (focusedModelIndex >= 0 && modelListRef.current) {
            const listItems = modelListRef.current.children;
            if (listItems[focusedModelIndex]) {
                listItems[focusedModelIndex].scrollIntoView({
                    block: 'nearest',
                    behavior: 'smooth'
                });
            }
        }
    }, [focusedModelIndex]);

    if (error) {
        return (
            <div className={styles.container}>
                <div className={styles.errorMessage}>
                    Erro ao carregar veículos: {error}
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            {loading && (
                <div className={styles.loadingOverlay}>
                    <div className={styles.loadingOverlayMessage}>Atualizando resultados...</div>
                </div>
            )}

            <div className={styles.header}>
                <h2>Consulta de Veículos</h2>
                {role === 'gratis' && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        background: '#1e3a5f',
                        border: '1px solid #3b82f6',
                        borderRadius: '8px', padding: '6px 14px', fontSize: '0.85rem', fontWeight: 600,
                    }}>
                        <span>🔒</span>
                        <span style={{ color: '#93c5fd' }}>
                            Assine um plano para desbloquear localização e contato das concessionárias
                        </span>
                        <button
                            onClick={() => setShowUpgradeModal(true)}
                            style={{
                                background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '5px',
                                padding: '3px 10px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700,
                            }}
                        >
                            Ver planos
                        </button>
                    </div>
                )}
                <div className={styles.headerActions}>
                    {role !== 'client' && selectedIds.length > 0 && (
                        <>
                            <button
                                className={styles.importButton}
                                onClick={handleBulkUpdateDate}
                                title="Atualizar Data de Atualização"
                                style={{ marginRight: '8px' }}
                            >
                                📅 Atualizar Data ({selectedIds.length})
                            </button>
                            <button
                                className={styles.bulkDeleteButton}
                                onClick={handleBulkDelete}
                                title="Excluir Selecionados"
                            >
                                🗑️ Excluir ({selectedIds.length})
                            </button>
                        </>
                    )}
                    {role !== 'client' && role !== 'gratis' && role !== 'dealership' && role !== 'vendedor' && (
                        <>
                            <div className={styles.exportWrapper} style={{ position: 'relative', display: 'inline-block' }}>
                                <button
                                    className={styles.importButton}
                                    onClick={() => setShowExportMenu(!showExportMenu)}
                                    title="Exportar Veículos"
                                    disabled={isExporting}
                                    style={{ marginRight: '8px' }}
                                >
                                    {isExporting ? 'Exportando...' : '📤 Exportar'}
                                </button>
                                {showExportMenu && (
                                    <div className={styles.exportMenu} style={{
                                        position: 'absolute',
                                        top: '100%',
                                        left: 0,
                                        zIndex: 10,
                                        background: 'white',
                                        border: '1px solid #ccc',
                                        borderRadius: '4px',
                                        boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        minWidth: '120px'
                                    }}>
                                        <button
                                            onClick={() => handleExport('csv')}
                                            style={{ padding: '8px 12px', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', borderBottom: '1px solid #eee', color: '#333' }}
                                        >
                                            CSV (.csv)
                                        </button>
                                        <button
                                            onClick={() => handleExport('json')}
                                            style={{ padding: '8px 12px', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', color: '#333' }}
                                        >
                                            JSON (.json)
                                        </button>
                                    </div>
                                )}
                            </div>
                            <button
                                className={styles.importButton}
                                onClick={() => setShowImportModal(true)}
                                title="Importar Veículos do CSV"
                            >
                                📂 Importar CSV
                            </button>
                        </>
                    )}
                    {/* Margem: admin, gerente e client (plano pago) editam */}
                    {['admin', 'administrador', 'gerente', 'client'].includes(role) && (
                        <button
                            className={styles.importButton}
                            onClick={() => setShowMargemModal(true)}
                            title="Configurar Margem"
                            style={{ marginRight: '8px' }}
                        >
                            💹 Margem
                        </button>
                    )}
                    {['admin', 'administrador', 'administrativo', 'gerente', 'operador', 'operator', 'dealership'].includes(role) && (
                        <button
                            className={styles.addButton}
                            onClick={handleNewVehicleClick}
                            title={showVehicleForm ? 'Fechar formulário' : 'Cadastrar Novo Veículo'}
                        >
                            {showVehicleForm ? 'Cancelar' : '+ Novo Veículo'}
                        </button>
                    )}
                    <div className={styles.viewToggle}>
                        <button
                            className={`${styles.viewButton} ${viewMode === 'table' ? styles.active : ''}`}
                            onClick={() => setViewMode('table')}
                            title="Visualização em Tabela"
                        >
                            📊
                        </button>
                        <button
                            className={`${styles.viewButton} ${viewMode === 'grid' ? styles.active : ''}`}
                            onClick={() => setViewMode('grid')}
                            title="Visualização em Grade"
                        >
                            ⊞
                        </button>
                    </div>
                    {onClose && (
                        <button className={styles.closeButton} onClick={onClose}>
                            ✕
                        </button>
                    )}
                </div>
            </div>

            {showVehicleForm && (
                <div className={styles.inlineFormWrapper}>
                    <AddVehicleModal
                        isOpen={showVehicleForm}
                        onClose={handleCloseVehicleForm}
                        onVehicleAdded={refreshVehicles}
                        editingVehicle={editingVehicle ?? undefined}
                        isEditing={Boolean(editingVehicle)}
                        role={role}
                    />
                </div>
            )}

            <div className={styles.splitLayout}>
                <div className={styles.sidebar}>
                    <div className={styles.sidebarHeader}>
                        <input
                            type="text"
                            placeholder="Filtrar modelos..."
                            className={styles.modelSearchInput}
                            value={modelSearch}
                            onChange={(e) => setModelSearch(e.target.value)}
                            onKeyDown={handleModelSearchKeyDown}
                        />
                    </div>
                    <div className={styles.modelList} ref={modelListRef}>
                        <div
                            className={`${styles.modelItem} ${selectedModel === null ? styles.active : ''} ${focusedModelIndex === 0 ? styles.focused : ''}`}
                            onClick={() => handleModelSelect(null)}
                        >
                            Todos os Modelos
                        </div>
                        {filteredModels.map((model, index) => (
                            <div
                                key={model}
                                className={`${styles.modelItem} ${selectedModel === model ? styles.active : ''} ${focusedModelIndex === index + 1 ? styles.focused : ''}`}
                                onClick={() => handleModelSelect(model)}
                            >
                                {model}
                            </div>
                        ))}
                    </div>
                </div>

                <div className={styles.mainContent}>
                    <div className={styles.searchSection}>
                        <div className={styles.searchContainer}>
                            <input
                                type="text"
                                placeholder="Digite para pesquisar (ex: argo, combustivel:diesel, transmissao:manual, cor:preto, ano:2024)"
                                value={pendingSearchTerm}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    setPendingSearchTerm(value);
                                    if (value === '') {
                                        setSearchTerm('');
                                        setPrefixWarnings([]);
                                    }
                                }}
                                className={styles.searchInput}
                            />
                            <button onClick={clearFilters} className={styles.clearButton}>
                                Limpar filtros
                            </button>
                        </div>

                        <div className={styles.searchInfo}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', width: '100%' }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                                    {searchTerm && (
                                        <span style={{ background: '#eef', border: '1px solid #99c', borderRadius: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', color: '#1a1a1a' }}>
                                            Busca: {searchTerm}
                                            <button onClick={() => { setSearchTerm(''); setPendingSearchTerm(''); setCurrentPage(1); }} style={{ marginLeft: '6px', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
                                        </span>
                                    )}
                                    {filters.modelo && (
                                        <span style={{ background: '#eef', border: '1px solid #99c', borderRadius: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', color: '#1a1a1a' }}>
                                            Modelo: {filters.modelo}
                                            <button onClick={() => { setFilters((prev) => ({ ...prev, modelo: '' })); setCurrentPage(1); }} style={{ marginLeft: '6px', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
                                        </span>
                                    )}
                                    {filters.combustivel && (
                                        <span style={{ background: '#eef', border: '1px solid #99c', borderRadius: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', color: '#1a1a1a' }}>
                                            Combustível: {filters.combustivel}
                                            <button onClick={() => { setFilters({ ...filters, combustivel: '' }); setCurrentPage(1); }} style={{ marginLeft: '6px', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
                                        </span>
                                    )}
                                    {filters.transmissao && (
                                        <span style={{ background: '#eef', border: '1px solid #99c', borderRadius: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', color: '#1a1a1a' }}>
                                            Transmissão: {filters.transmissao}
                                            <button onClick={() => { setFilters({ ...filters, transmissao: '' }); setCurrentPage(1); }} style={{ marginLeft: '6px', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
                                        </span>
                                    )}
                                    {filters.cor && (
                                        <span style={{ background: '#eef', border: '1px solid #99c', borderRadius: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', color: '#1a1a1a' }}>
                                            Cor: {filters.cor}
                                            <button onClick={() => { setFilters({ ...filters, cor: '' }); setCurrentPage(1); }} style={{ marginLeft: '6px', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
                                        </span>
                                    )}
                                    {filters.ano && (
                                        <span style={{ background: '#eef', border: '1px solid #99c', borderRadius: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', color: '#1a1a1a' }}>
                                            Ano: {filters.ano}
                                            <button onClick={() => { setFilters({ ...filters, ano: '' }); setCurrentPage(1); }} style={{ marginLeft: '6px', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
                                        </span>
                                    )}
                                    {filters.status && (
                                        <span style={{ background: '#eef', border: '1px solid #99c', borderRadius: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', color: '#1a1a1a' }}>
                                            Status: {filters.status}
                                            <button onClick={() => { setFilters({ ...filters, status: '' }); setCurrentPage(1); }} style={{ marginLeft: '6px', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
                                        </span>
                                    )}
                                    {filters.estado && (
                                        <span style={{ background: '#eef', border: '1px solid #99c', borderRadius: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', color: '#1a1a1a' }}>
                                            UF: {filters.estado}
                                            <button onClick={() => { setFilters({ ...filters, estado: '' }); setCurrentPage(1); }} style={{ marginLeft: '6px', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
                                        </span>
                                    )}
                                    {filters.operador && (
                                        <span style={{ background: '#eef', border: '1px solid #99c', borderRadius: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', color: '#1a1a1a' }}>
                                            Operador: {filters.operador}
                                            <button onClick={() => { setFilters({ ...filters, operador: '' }); setCurrentPage(1); }} style={{ marginLeft: '6px', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
                                        </span>
                                    )}
                                    {filters.cidade && (
                                        <span style={{ background: '#eef', border: '1px solid #99c', borderRadius: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', color: '#1a1a1a' }}>
                                            Cidade: {filters.cidade}
                                            <button onClick={() => { setFilters({ ...filters, cidade: '' }); setCurrentPage(1); }} style={{ marginLeft: '6px', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
                                        </span>
                                    )}
                                    {filters.concessionaria && (
                                        <span style={{ background: '#eef', border: '1px solid #99c', borderRadius: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', color: '#1a1a1a' }}>
                                            Concessionária: {filters.concessionaria}
                                            <button onClick={() => { setFilters({ ...filters, concessionaria: '' }); setCurrentPage(1); }} style={{ marginLeft: '6px', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
                                        </span>
                                    )}
                                    {filters.nomeContato && (
                                        <span style={{ background: '#eef', border: '1px solid #99c', borderRadius: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', color: '#1a1a1a' }}>
                                            Contato: {filters.nomeContato}
                                            <button onClick={() => { setFilters({ ...filters, nomeContato: '' }); setCurrentPage(1); }} style={{ marginLeft: '6px', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
                                        </span>
                                    )}
                                    {filters.opcionais && (
                                        <span style={{ background: '#eef', border: '1px solid #99c', borderRadius: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', color: '#1a1a1a' }}>
                                            Opcionais: {filters.opcionais}
                                            <button onClick={() => { setFilters((prev) => ({ ...prev, opcionais: '' })); setCurrentPage(1); }} style={{ marginLeft: '6px', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
                                        </span>
                                    )}
                                </div>

                                <h3 style={{ margin: 0, marginLeft: 'auto' }}>Veículos Disponíveis ({totalItems})</h3>
                            </div>
                            {/* Chips de filtros aplicados */}

                            {/* Warnings de prefixos */}
                            {prefixWarnings.length > 0 && (
                                <div style={{ marginTop: '6px', color: '#a66', fontSize: '0.85rem' }}>
                                    {prefixWarnings.map((w, i) => (<div key={i}>⚠️ {w}</div>))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className={styles.resultsSection}>
                        {viewMode === 'table' ? (
                            <div className={styles.tableContainer}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th className={styles.tableHeader}>
                                                <input
                                                    type="checkbox"
                                                    onChange={(e) => {
                                                        if (!isClientReadOnly) {
                                                            handleSelectAll(e);
                                                        }
                                                    }}
                                                    checked={displayVehicles.length > 0 && selectedIds.length === displayVehicles.length}
                                                    disabled={isClientReadOnly}
                                                />
                                            </th>
                                            {!selectedModel && (
                                                <th className={styles.tableHeader} onClick={() => handleSort('modelo')} style={{ cursor: 'pointer' }}>
                                                    MODELO {sortConfig.key === 'modelo' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                                                </th>
                                            )}
                                            <th className={styles.tableHeader} onClick={() => handleSort('transmissao')} style={{ cursor: 'pointer' }}>
                                                TRANSMISSÃO {sortConfig.key === 'transmissao' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                                            </th>
                                            <th className={styles.tableHeader} onClick={() => handleSort('combustivel')} style={{ cursor: 'pointer' }}>
                                                COMBUSTÍVEL {sortConfig.key === 'combustivel' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                                            </th>
                                            <th className={styles.tableHeader} onClick={() => handleSort('cor')} style={{ cursor: 'pointer' }}>
                                                COR {sortConfig.key === 'cor' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                                            </th>
                                            <th className={styles.tableHeader} onClick={() => handleSort('ano')} style={{ cursor: 'pointer' }}>
                                                ANO {sortConfig.key === 'ano' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                                            </th>
                                            <th className={`${styles.tableHeader} ${styles.colOpcionais}`} onClick={() => handleSort('opcionais')} style={{ cursor: 'pointer' }}>
                                                OPCIONAIS {sortConfig.key === 'opcionais' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                                            </th>
                                            <th className={styles.tableHeader} onClick={() => handleSort('preco')} style={{ cursor: 'pointer' }}>
                                                PREÇO (R$) {sortConfig.key === 'preco' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                                            </th>
                                            {['admin', 'administrador', 'administrativo', 'operator', 'operador', 'gerente'].includes(role) && (
                                                <th className={styles.tableHeader} onClick={() => handleSort('valorVenda')} style={{ cursor: 'pointer' }}>
                                                    PREÇO VENDA (R$) {sortConfig.key === 'valorVenda' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                                                </th>
                                            )}
                                            <th className={styles.tableHeader} onClick={() => handleSort('status')} style={{ cursor: 'pointer' }}>
                                                STATUS {sortConfig.key === 'status' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                                            </th>
                                            {role !== 'dealership' && role !== 'gratis' && (
                                                <th className={styles.tableHeader} onClick={() => handleSort('estado')} style={{ cursor: 'pointer' }}>
                                                    UF {sortConfig.key === 'estado' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                                                </th>
                                            )}
                                            <th className={styles.tableHeader} onClick={() => handleSort('observacoes')} style={{ cursor: 'pointer' }}>
                                                OBSERVAÇÕES {sortConfig.key === 'observacoes' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                                            </th>
                                            {!['dealership', 'client', 'gratis'].includes(role) && (
                                                <th className={styles.tableHeader} onClick={() => handleSort('frete')} style={{ cursor: 'pointer' }}>
                                                    FRETE {sortConfig.key === 'frete' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                                                </th>
                                            )}
                                            {role !== 'client' && role !== 'gratis' && (
                                                <th className={styles.tableHeader} onClick={() => handleSort('operador')} style={{ cursor: 'pointer' }}>
                                                    OPERADOR {sortConfig.key === 'operador' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                                                </th>
                                            )}
                                            <th className={styles.tableHeader} onClick={() => handleSort('updatedAt')} style={{ cursor: 'pointer' }}>
                                                DATAS {sortConfig.key === 'updatedAt' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                                            </th>
                                            {['admin', 'administrador', 'administrativo', 'gerente', 'operator', 'operador', 'dealership', 'client', 'gratis', 'vendedor'].includes(role) && (
                                                <th className={styles.tableHeader}>AÇÕES</th>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {displayVehicles.map((vehicle) => (
                                            <tr key={vehicle.id} className={styles.tableRow}>
                                                <td className={styles.tableCell}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedIds.includes(vehicle.id || '')}
                                                        onChange={() => {
                                                            if (!isClientReadOnly) {
                                                                handleSelectOne(vehicle.id || '');
                                                            }
                                                        }}
                                                        disabled={isClientReadOnly}
                                                    />
                                                </td>
                                                {!selectedModel && (
                                                    <td className={styles.tableCell}>
                                                        {isClientReadOnly ? (
                                                            <HighlightText text={vehicle.modelo} searchTerm={pendingSearchTerm} />
                                                        ) : (
                                                            <EditableAutocompleteCell
                                                                value={vehicle.modelo}
                                                                options={modeloOptions}
                                                                onSave={(newValue) => handleUpdateVehicleField(vehicle, 'modelo', newValue)}
                                                                placeholder="Digite para buscar modelo..."
                                                            />
                                                        )}
                                                    </td>
                                                )}
                                                <td className={styles.tableCell}>
                                                    {isClientReadOnly ? (
                                                        <HighlightText text={vehicle.transmissao} searchTerm={pendingSearchTerm} />
                                                    ) : (
                                                        <EditableSelectCell
                                                            value={vehicle.transmissao}
                                                            options={transmissaoOptions}
                                                            onSave={(newValue) => handleUpdateVehicleField(vehicle, 'transmissao', newValue)}
                                                            placeholder="Selecione"
                                                        />
                                                    )}
                                                </td>
                                                <td className={styles.tableCell}>
                                                    {isClientReadOnly ? (
                                                        <HighlightText text={vehicle.combustivel} searchTerm={pendingSearchTerm} />
                                                    ) : (
                                                        <EditableSelectCell
                                                            value={vehicle.combustivel}
                                                            options={combustivelOptions}
                                                            onSave={(newValue) => handleUpdateVehicleField(vehicle, 'combustivel', newValue)}
                                                            placeholder="Selecione"
                                                        />
                                                    )}
                                                </td>
                                                <td className={styles.tableCell}>
                                                    {isClientReadOnly ? (
                                                        <HighlightText text={vehicle.cor} searchTerm={pendingSearchTerm} />
                                                    ) : (
                                                        <EditableTextCell
                                                            value={vehicle.cor}
                                                            onSave={(newValue) => handleUpdateVehicleField(vehicle, 'cor', newValue)}
                                                            placeholder="Cor"
                                                        />
                                                    )}
                                                </td>
                                                <td className={styles.tableCell}>
                                                    {isClientReadOnly ? (
                                                        <HighlightText text={vehicle.ano} searchTerm={pendingSearchTerm} />
                                                    ) : (
                                                        <EditableYearCell
                                                            value={vehicle.ano}
                                                            onSave={(newValue) => handleUpdateVehicleField(vehicle, 'ano', newValue)}
                                                        />
                                                    )}
                                                </td>
                                                <td className={`${styles.tableCell} ${styles.colOpcionais}`}>
                                                    {isClientReadOnly ? (
                                                        <HighlightText text={vehicle.opcionais} searchTerm={pendingSearchTerm} />
                                                    ) : (
                                                        <EditableTextCell
                                                            value={vehicle.opcionais}
                                                            onSave={(newValue) => handleUpdateOpcionais(vehicle, newValue)}
                                                            placeholder="Opcionais"
                                                        />
                                                    )}
                                                </td>
                                                <td className={styles.tableCell}>
                                                    {isClientReadOnly ? (
                                                        `R$ ${calculateClientPrice(vehicle).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                                                    ) : (
                                                        <EditableCurrencyCell
                                                            value={vehicle.preco}
                                                            onSave={(newValue) => handleUpdatePreco(vehicle, newValue)}
                                                        />
                                                    )}
                                                </td>
                                                {['admin', 'administrador', 'administrativo', 'operator', 'operador', 'gerente'].includes(role) && (
                                                    <td className={styles.tableCell}>
                                                        <EditableCurrencyCell
                                                            value={vehicle.valorVenda || calculatePriceWithMargin(vehicle.preco || 0)}
                                                            onSave={(newValue) => handleUpdateValorVenda(vehicle, newValue)}
                                                        />
                                                    </td>
                                                )}
                                                <td className={styles.tableCell}>
                                                    {isClientReadOnly ? (
                                                        <span className={`${styles.statusBadge} ${getStatusColor(vehicle.status)}`}>
                                                            {vehicle.status}
                                                        </span>
                                                    ) : (
                                                        <EditableSelectCell
                                                            value={vehicle.status}
                                                            options={STATUS_OPTIONS}
                                                            onSave={(newValue) => handleUpdateVehicleField(vehicle, 'status', newValue)}
                                                            placeholder="Selecione"
                                                        />
                                                    )}
                                                </td>
                                                {role !== 'dealership' && role !== 'gratis' && (
                                                    <td className={styles.tableCell}>
                                                        {isClientReadOnly ? (
                                                            <HighlightText text={vehicle.estado} searchTerm={pendingSearchTerm} />
                                                        ) : (
                                                            <EditableAutocompleteCell
                                                                value={vehicle.estado}
                                                                options={BRAZIL_STATES}
                                                                onSave={(newValue) => handleUpdateVehicleField(vehicle, 'estado', newValue)}
                                                                placeholder="Digite UF..."
                                                            />
                                                        )}
                                                    </td>
                                                )}
                                                <td className={styles.tableCell}>
                                                    {isClientReadOnly ? (
                                                        <HighlightText text={vehicle.observacoes} searchTerm={pendingSearchTerm} />
                                                    ) : (
                                                        <EditableTextCell
                                                            value={vehicle.observacoes}
                                                            onSave={(newValue) => handleUpdateVehicleField(vehicle, 'observacoes', newValue)}
                                                            placeholder="Observações"
                                                        />
                                                    )}
                                                </td>
                                                {!['dealership', 'client', 'gratis'].includes(role) && (
                                                    <td className={styles.tableCell}>
                                                        <EditableCurrencyCell
                                                            value={vehicle.frete}
                                                            onSave={(newValue) => handleUpdateVehicleField(vehicle, 'frete', newValue ?? 0)}
                                                        />
                                                    </td>
                                                )}
                                                {role !== 'client' && role !== 'gratis' && (
                                                    <td className={styles.tableCell}>
                                                        <EditableTextCell
                                                            value={vehicle.operador}
                                                            onSave={(newValue) => handleUpdateVehicleField(vehicle, 'operador', newValue)}
                                                            placeholder="Operador"
                                                        />
                                                    </td>
                                                )}
                                                <td className={styles.tableCell} style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                        {vehicle.createdAt && (
                                                            <span style={{ color: 'var(--color-text-muted)' }}>📅 {formatDate(vehicle.createdAt)}</span>
                                                        )}
                                                        {vehicle.updatedAt ? (() => {
                                                            const days = calculateDaysSinceUpdate(vehicle.updatedAt);
                                                            const color = getUpdateStatusColor(days);
                                                            return (
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                                    <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                                                                    <span>{formatDate(vehicle.updatedAt)}</span>
                                                                </div>
                                                            );
                                                        })() : '—'}
                                                    </div>
                                                </td>
                                                {['admin', 'administrador', 'administrativo', 'gerente', 'operator', 'operador', 'dealership', 'client', 'gratis', 'vendedor'].includes(role) && (
                                                    <td className={styles.tableCell}>
                                                        <div className={styles.actionButtons}>
                                                            <span
                                                                className={styles.locationButton}
                                                                onClick={() => handleLocationClick(vehicle)}
                                                                title={role === 'gratis' && localCredits === 0 ? 'Assine um plano para desbloquear' : 'Ver localização e contato'}
                                                                role="button"
                                                                tabIndex={0}
                                                            >
                                                                📍
                                                            </span>
                                                            {!['dealership', 'client', 'gratis', 'vendedor'].includes(role) && (
                                                                <>
                                                                    <span
                                                                        className={styles.editButton}
                                                                        title="Editar"
                                                                        onClick={() => handleEditVehicle(vehicle)}
                                                                        role="button"
                                                                        tabIndex={0}
                                                                    >
                                                                        ✏️
                                                                    </span>
                                                                    <span
                                                                        className={styles.deleteButton}
                                                                        title="Excluir"
                                                                        onClick={() => handleDeleteVehicle(vehicle)}
                                                                        role="button"
                                                                        tabIndex={0}
                                                                    >
                                                                        🗑️
                                                                    </span>
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className={styles.gridContainer}>
                                {displayVehicles.map((vehicle) => (
                                    <VehicleCard
                                        key={vehicle.id}
                                        vehicle={vehicle}
                                        margem={margem}
                                        fixedMargin={fixedMargin}
                                        marginMode={marginMode}
                                        onEdit={handleEditVehicle}
                                        onDelete={handleDeleteVehicle}
                                        onWhatsApp={handleWhatsAppClick}
                                        onLocationClick={handleLocationClick}
                                        role={role}
                                        canViewLocation={(session?.user as any)?.canViewLocation}
                                    />
                                ))}
                            </div>
                        )}

                        <div className={styles.paginationContainer}>
                            <div className={styles.itemsPerPage}>
                                <label htmlFor="itemsPerPage">Itens por página: </label>
                                <select
                                    id="itemsPerPage"
                                    value={itemsPerPage}
                                    onChange={handleItemsPerPageChange}
                                >
                                    <option value={25}>25</option>
                                    <option value={50}>50</option>
                                    <option value={75}>75</option>
                                    <option value={100}>100</option>
                                    <option value={-1}>Todos</option>
                                </select>
                            </div>

                            <div className={styles.paginationControls}>
                                <button
                                    onClick={() => handlePageChange(currentPage - 1)}
                                    disabled={currentPage === 1}
                                    className={styles.paginationButton}
                                >
                                    Anterior
                                </button>
                                <span>
                                    Página {currentPage} de {totalPages}
                                </span>
                                <button
                                    onClick={() => handlePageChange(currentPage + 1)}
                                    disabled={currentPage === totalPages}
                                    className={styles.paginationButton}
                                >
                                    Próxima
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal de Importação CSV */}
            {showImportModal && (
                <div className={modalStyles.overlay}>
                    <div className={modalStyles.modal}>
                        <div className={modalStyles.modalHeader}>
                            <h3>Importar Veículos do CSV</h3>
                            <button className={modalStyles.closeButton} onClick={() => setShowImportModal(false)}>✕</button>
                        </div>

                        <div className={modalStyles.form}>
                            <div className={modalStyles.importInstructions}>
                                <h4>📋 Formato do arquivo CSV (17 colunas):</h4>
                                <ul>
                                    <li>Primeira linha deve conter os cabeçalhos: <strong>dataEntrada,modelo,transmissao,combustivel,cor,ano,opcionais,preco,status,observacoes,cidade,estado,frete,telefone,concessionaria,nomeContato,operador</strong></li>
                                    <li>As linhas seguintes devem conter os dados separados por vírgula</li>
                                    <li><strong>Campos obrigatórios:</strong> modelo, transmissao, combustivel, ano, preco, status, cidade, estado, frete, telefone, concessionaria, nomeContato</li>
                                    <li><strong>Campos opcionais:</strong> dataEntrada, cor, opcionais, observacoes, operador</li>
                                    <li><strong>Status válidos:</strong> A faturar, Refaturamento, Licenciado</li>
                                    <li><strong>Combustível válido:</strong> Flex, Gasolina, Etanol, Diesel, Elétrico, Híbrido</li>
                                    <li><strong>Transmissão válida:</strong> Manual, Automático, CVT</li>
                                    <li>Exemplo (role horizontalmente):</li>
                                </ul>
                                <pre className={modalStyles.csvExample} style={{ overflowX: 'auto', whiteSpace: 'nowrap' }}>
                                    dataEntrada,modelo,transmissao,combustivel,cor,ano,opcionais,preco,status,observacoes,cidade,estado,frete,telefone,concessionaria,nomeContato,operador{"\n"}20/11/2025,COROLLA ALTIS 2.0,Automático,Flex,BRANCO POLAR,2024,AR CONDICIONADO,154920,A faturar,Veículo novo,São Paulo,SP,1500,11999991001,RENAULT ANDRETA,CARLOS SILVA,JOÃO
                                </pre>
                            </div>

                            <div className={modalStyles.formGroup}>
                                <label htmlFor="csvFile">Selecionar arquivo CSV:</label>
                                <input
                                    type="file"
                                    id="csvFile"
                                    accept=".csv"
                                    onChange={handleFileChange}
                                    className={modalStyles.fileInput}
                                />
                            </div>

                            {csvFile && (
                                <div className={modalStyles.fileInfo}>
                                    <strong>Arquivo selecionado:</strong> {csvFile.name}
                                </div>
                            )}

                            {importProgress.isImporting && (
                                <div className={modalStyles.progressContainer}>
                                    <h4>
                                        <span className={modalStyles.spinner} aria-label="Carregando"></span>
                                        Importando veículos...
                                        <span className={modalStyles.percentBadge} style={{ marginLeft: '0.5rem' }}>{percent}%</span>
                                    </h4>
                                    <div className={modalStyles.progressBar}>
                                        <div
                                            className={modalStyles.progressFill}
                                            style={{
                                                width: `${percent}%`
                                            }}
                                        ></div>
                                        <div className={modalStyles.progressPercent}>{percent}%</div>
                                    </div>
                                    <p className={modalStyles.progressText}>
                                        {importProgress.current} de {importProgress.total} ({percent}%)
                                    </p>
                                </div>
                            )}

                            {importResults && !importProgress.isImporting && (
                                <div style={{ marginTop: '1rem' }}>
                                    {/* Cabeçalho com resumo */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        <h4 style={{ margin: 0 }}>Relatório de Importação</h4>
                                        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem' }}>
                                            <span style={{ color: 'var(--color-positive)', fontWeight: 600 }}>✅ Inseridos: {importResults.success}</span>
                                            <span style={{ color: 'var(--color-negative)', fontWeight: 600 }}>❌ Erros: {importResults.errors.length}</span>
                                            <span style={{ color: 'var(--color-text-muted)' }}>Total: {importResults.rows.length}</span>
                                        </div>
                                    </div>

                                    {/* Seletor de abas */}
                                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                        <button
                                            onClick={() => setImportResultTab('success')}
                                            style={{
                                                padding: '0.4rem 1.1rem',
                                                borderRadius: '8px',
                                                border: 'none',
                                                cursor: 'pointer',
                                                fontWeight: importResultTab === 'success' ? 700 : 400,
                                                background: importResultTab === 'success' ? 'var(--color-positive)' : 'var(--color-highlight)',
                                                color: importResultTab === 'success' ? '#fff' : 'var(--color-text-muted)',
                                                fontSize: '0.85rem',
                                            }}
                                        >
                                            ✅ Sucesso ({importResults.rows.filter(r => r.status === 'ok').length})
                                        </button>
                                        <button
                                            onClick={() => setImportResultTab('error')}
                                            style={{
                                                padding: '0.4rem 1.1rem',
                                                borderRadius: '8px',
                                                border: 'none',
                                                cursor: 'pointer',
                                                fontWeight: importResultTab === 'error' ? 700 : 400,
                                                background: importResultTab === 'error' ? 'var(--color-negative)' : 'var(--color-highlight)',
                                                color: importResultTab === 'error' ? '#fff' : 'var(--color-text-muted)',
                                                fontSize: '0.85rem',
                                            }}
                                        >
                                            ❌ Erros ({importResults.errors.length})
                                        </button>
                                    </div>

                                    {/* Aba Sucesso */}
                                    {importResultTab === 'success' && (
                                        <div style={{ overflowY: 'auto', maxHeight: '300px', border: '1px solid var(--color-highlight)', borderRadius: '8px' }}>
                                            {importResults.rows.filter(r => r.status === 'ok').length === 0 ? (
                                                <p style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-text-muted)', margin: 0 }}>Nenhum registro inserido com sucesso.</p>
                                            ) : (
                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                                    <thead style={{ position: 'sticky', top: 0, background: 'var(--color-surface)', zIndex: 1 }}>
                                                        <tr>
                                                            <th style={{ padding: '7px 10px', textAlign: 'left', borderBottom: '1px solid var(--color-highlight)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>Linha</th>
                                                            <th style={{ padding: '7px 10px', textAlign: 'left', borderBottom: '1px solid var(--color-highlight)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>Modelo</th>
                                                            <th style={{ padding: '7px 10px', textAlign: 'left', borderBottom: '1px solid var(--color-highlight)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>Cor</th>
                                                            <th style={{ padding: '7px 10px', textAlign: 'left', borderBottom: '1px solid var(--color-highlight)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>Transmissão</th>
                                                            <th style={{ padding: '7px 10px', textAlign: 'left', borderBottom: '1px solid var(--color-highlight)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>Combustível</th>
                                                            <th style={{ padding: '7px 10px', textAlign: 'left', borderBottom: '1px solid var(--color-highlight)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>Ano</th>
                                                            <th style={{ padding: '7px 10px', textAlign: 'left', borderBottom: '1px solid var(--color-highlight)', color: 'var(--color-text-muted)' }}>Preço</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {importResults.rows.filter(r => r.status === 'ok').map(r => (
                                                            <tr key={r.line} style={{ borderBottom: '1px solid var(--color-highlight)' }}>
                                                                <td style={{ padding: '6px 10px', color: 'var(--color-text-muted)' }}>{r.line}</td>
                                                                <td style={{ padding: '6px 10px', fontWeight: 600 }}>{r.modelo || r.columns?.[1] || '—'}</td>
                                                                <td style={{ padding: '6px 10px' }}>{r.cor || r.columns?.[4] || '—'}</td>
                                                                <td style={{ padding: '6px 10px' }}>{r.columns?.[2] || '—'}</td>
                                                                <td style={{ padding: '6px 10px' }}>{r.columns?.[3] || '—'}</td>
                                                                <td style={{ padding: '6px 10px' }}>{r.columns?.[5] || '—'}</td>
                                                                <td style={{ padding: '6px 10px', color: 'var(--color-positive)', fontWeight: 600 }}>{r.columns?.[7] ? `R$ ${parseFloat(r.columns[7]).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            )}
                                        </div>
                                    )}

                                    {/* Aba Erros */}
                                    {importResultTab === 'error' && (
                                        <div style={{ overflowY: 'auto', maxHeight: '300px', border: '1px solid var(--color-highlight)', borderRadius: '8px' }}>
                                            {importResults.errors.length === 0 ? (
                                                <p style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-text-muted)', margin: 0 }}>🎉 Nenhum erro encontrado! Todos os registros foram inseridos.</p>
                                            ) : (
                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                                    <thead style={{ position: 'sticky', top: 0, background: 'var(--color-surface)', zIndex: 1 }}>
                                                        <tr>
                                                            <th style={{ padding: '7px 10px', textAlign: 'left', borderBottom: '1px solid var(--color-highlight)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>Linha</th>
                                                            <th style={{ padding: '7px 10px', textAlign: 'left', borderBottom: '1px solid var(--color-highlight)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>Modelo</th>
                                                            <th style={{ padding: '7px 10px', textAlign: 'left', borderBottom: '1px solid var(--color-highlight)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>Cor</th>
                                                            <th style={{ padding: '7px 10px', textAlign: 'left', borderBottom: '1px solid var(--color-highlight)', color: 'var(--color-text-muted)' }}>Motivo do Erro</th>
                                                            <th style={{ padding: '7px 10px', textAlign: 'left', borderBottom: '1px solid var(--color-highlight)', color: 'var(--color-text-muted)' }}>Dados brutos</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {importResults.rows.filter(r => r.status === 'error').map(r => (
                                                            <tr key={r.line} style={{ borderBottom: '1px solid var(--color-highlight)', background: 'rgba(239,68,68,0.05)' }}>
                                                                <td style={{ padding: '6px 10px', color: 'var(--color-text-muted)' }}>{r.line}</td>
                                                                <td style={{ padding: '6px 10px' }}>{r.modelo || r.columns?.[1] || '—'}</td>
                                                                <td style={{ padding: '6px 10px' }}>{r.cor || r.columns?.[4] || '—'}</td>
                                                                <td style={{ padding: '6px 10px', color: 'var(--color-negative)', fontWeight: 600 }}>{r.reason || '—'}</td>
                                                                <td style={{ padding: '6px 10px', color: 'var(--color-text-muted)', fontSize: '0.72rem', wordBreak: 'break-all' }}>{r.columns?.join(' | ') || '—'}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className={modalStyles.modalActions}>
                            <button
                                type="button"
                                className={modalStyles.cancelButton}
                                onClick={() => setShowImportModal(false)}
                            >
                                Fechar
                            </button>
                            {importResults && importResults.rows?.length > 0 && !importProgress.isImporting && (
                                <button
                                    type="button"
                                    className={modalStyles.addButton || modalStyles.cancelButton}
                                    onClick={downloadFullReportCsv}
                                >
                                    ⬇️ Baixar relatório completo (CSV)
                                </button>
                            )}
                            <button
                                type="button"
                                className={modalStyles.submitButton}
                                onClick={handleImportCSV}
                                disabled={!csvFile || importProgress.isImporting}
                            >
                                {importProgress.isImporting ? (
                                    <>
                                        <span className={modalStyles.spinner} aria-hidden="true"></span> Importando... {percent}%
                                    </>
                                ) : (
                                    'Importar Dados'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Opções de Frete */}
            {freteModal.isOpen && (
                <div className={modalStyles.overlay}>
                    <div className={modalStyles.modal} style={{ maxWidth: '500px' }}>
                        <div className={modalStyles.modalHeader}>
                            <h3>Opções de Frete - {freteModal.estado}</h3>
                            <button
                                className={modalStyles.closeButton}
                                onClick={() => setFreteModal({ ...freteModal, isOpen: false })}
                            >
                                ✕
                            </button>
                        </div>
                        <div className={modalStyles.form}>
                            <div className={styles.tableContainer} style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th className={styles.tableHeader}>Valor</th>
                                            <th className={styles.tableHeader}>Observação</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {freteModal.items.map((item, idx) => (
                                            <tr key={item.id || idx} className={styles.tableRow}>
                                                <td className={styles.tableCell}>
                                                    {item.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                </td>
                                                <td className={styles.tableCell}>{item.observacao || '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className={modalStyles.modalActions}>
                            <button
                                type="button"
                                className={modalStyles.cancelButton}
                                onClick={() => setFreteModal({ ...freteModal, isOpen: false })}
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Margem */}
            {showMargemModal && (
                <div className={modalStyles.overlay}>
                    <div className={modalStyles.modal} style={{ maxWidth: '500px' }}>
                        <div className={modalStyles.modalHeader}>
                            <h3>Configurar Margem</h3>
                            <button
                                className={modalStyles.closeButton}
                                onClick={() => setShowMargemModal(false)}
                            >
                                ✕
                            </button>
                        </div>
                        <div className={modalStyles.form}>
                            <div className={styles.configSection}>
                                <p>Defina a margem aplicada ao preço de compra para calcular o preço de venda sugerido.</p>

                                {/* Seletor de Modo */}
                                {(['admin', 'administrador', 'gerente', 'operator', 'operador', 'client'].includes(role)) && (
                                    <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                                        <button
                                            type="button"
                                            onClick={() => setInputMarginMode('percent')}
                                            disabled={isInvitee}
                                            style={{
                                                flex: 1,
                                                padding: '10px',
                                                border: inputMarginMode === 'percent' ? '2px solid #007bff' : '1px solid #ccc',
                                                borderRadius: '6px',
                                                background: inputMarginMode === 'percent' ? '#e7f1ff' : '#fff',
                                                cursor: isInvitee ? 'not-allowed' : 'pointer',
                                                fontWeight: inputMarginMode === 'percent' ? 600 : 400,
                                                opacity: isInvitee ? 0.6 : 1
                                            }}
                                        >
                                            📊 Percentual (%)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setInputMarginMode('fixed')}
                                            disabled={isInvitee}
                                            style={{
                                                flex: 1,
                                                padding: '10px',
                                                border: inputMarginMode === 'fixed' ? '2px solid #007bff' : '1px solid #ccc',
                                                borderRadius: '6px',
                                                background: inputMarginMode === 'fixed' ? '#e7f1ff' : '#fff',
                                                cursor: isInvitee ? 'not-allowed' : 'pointer',
                                                fontWeight: inputMarginMode === 'fixed' ? 600 : 400,
                                                opacity: isInvitee ? 0.6 : 1
                                            }}
                                        >
                                            💵 Valor Fixo (R$)
                                        </button>
                                    </div>
                                )}

                                {/* Input de margem conforme modo */}
                                {inputMarginMode === 'percent' ? (
                                    <div className={styles.margemInputGroup} style={{ marginTop: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <label htmlFor="margemInput">Margem (%):</label>
                                        <input
                                            id="margemInput"
                                            type="text"
                                            value={inputMargem}
                                            onChange={(e) => {
                                                const value = e.target.value;
                                                if (/^\d*\.?\d*$/.test(value)) {
                                                    setInputMargem(value);
                                                }
                                            }}
                                            className={styles.searchInput}
                                            style={{ width: '100px', opacity: isInvitee ? 0.6 : 1 }}
                                            disabled={isInvitee}
                                        />
                                    </div>
                                ) : (
                                    <div className={styles.margemInputGroup} style={{ marginTop: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <label htmlFor="fixedMarginInput">Valor Fixo (R$):</label>
                                        <input
                                            id="fixedMarginInput"
                                            type="text"
                                            value={inputFixedMargin}
                                            onChange={(e) => {
                                                const value = e.target.value;
                                                if (/^\d*\.?\d*$/.test(value)) {
                                                    setInputFixedMargin(value);
                                                }
                                            }}
                                            className={styles.searchInput}
                                            style={{ width: '120px', opacity: isInvitee ? 0.6 : 1 }}
                                            disabled={isInvitee}
                                        />
                                    </div>
                                )}

                                {/* Informação da margem atual e exemplo */}
                                <div className={styles.margemInfo} style={{ marginTop: '20px', padding: '15px', background: '#f5f5f5', borderRadius: '8px' }}>
                                    <div style={{ marginBottom: '10px' }}>
                                        <span>Margem Atual: </span>
                                        <strong>
                                            {marginMode === 'percent'
                                                ? `${margem}%`
                                                : `R$ ${fixedMargin.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                                        </strong>
                                    </div>
                                    <div>
                                        <span>Exemplo: </span>
                                        {inputMarginMode === 'percent' ? (
                                            <span>R$ 100.000 + {inputMargem || 0}% = R$ {(100000 * (1 + (parseFloat(inputMargem) || 0) / 100)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                        ) : (
                                            <span>R$ 100.000 + R$ {(parseFloat(inputFixedMargin) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} = R$ {(100000 + (parseFloat(inputFixedMargin) || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                        )}
                                    </div>
                                </div>
                                <div style={{ marginTop: '15px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: isInvitee ? 'not-allowed' : 'pointer', userSelect: 'none', opacity: isInvitee ? 0.6 : 1 }}>
                                        <input
                                            type="checkbox"
                                            checked={forceUpdate}
                                            onChange={(e) => setForceUpdate(e.target.checked)}
                                            style={{ width: '16px', height: '16px', cursor: isInvitee ? 'not-allowed' : 'pointer' }}
                                            disabled={isInvitee}
                                        />
                                        <span style={{ fontWeight: 500 }}>Forçar atualização em todos os veículos</span>
                                    </label>
                                    <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '4px', marginLeft: '24px' }}>
                                        ⚠️ Isso irá sobrescrever quaisquer preços de venda definidos manualmente, aplicando a nova margem a todos os veículos.
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className={modalStyles.modalActions}>
                            <button
                                type="button"
                                className={modalStyles.cancelButton}
                                onClick={() => setShowMargemModal(false)}
                            >
                                Cancelar
                            </button>
                            {!isInvitee && (
                                <button
                                    type="button"
                                    className={modalStyles.submitButton}
                                    onClick={handleSaveMargem}
                                    disabled={false}
                                >
                                    Salvar
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {confirmCreditVehicle && (
                <div className={modalStyles.modalOverlay} onClick={() => setConfirmCreditVehicle(null)}>
                    <div className={modalStyles.modalContent} onClick={e => e.stopPropagation()} style={{ maxWidth: '440px', textAlign: 'center', padding: '0', overflow: 'hidden' }}>
                        <div className={modalStyles.modalHeader} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Liberar Contato</h2>
                            <button onClick={() => setConfirmCreditVehicle(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}>&times;</button>
                        </div>
                        <div style={{ padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.2rem', alignItems: 'center' }}>
                            <div style={{ fontSize: '3rem', background: '#e0e7ff', width: '80px', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}>💳</div>
                            <div>
                                <p style={{ fontSize: '1.1rem', color: '#1e293b', fontWeight: 600, margin: '0 0 0.5rem' }}>
                                    Deseja usar <span style={{ color: '#2563eb' }}>1 crédito</span> para ver os detalhes e localização desta concessionária?
                                </p>
                                <p style={{ fontSize: '0.95rem', color: '#64748b', margin: 0 }}>
                                    Você possui <strong>{localCredits}</strong> crédito{localCredits !== 1 ? 's' : ''} em sua conta.
                                </p>
                            </div>
                            <div style={{ display: 'flex', gap: '1rem', width: '100%', marginTop: '0.5rem' }}>
                                <button
                                    onClick={() => setConfirmCreditVehicle(null)}
                                    style={{ flex: 1, padding: '0.875rem', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
                                    disabled={isConsumingCredit}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={confirmConsumeCredit}
                                    style={{ flex: 1, padding: '0.875rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
                                    disabled={isConsumingCredit}
                                >
                                    {isConsumingCredit ? 'Processando...' : 'Confirmar e Ver'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {locationVehicle && (
                <div className={styles.modalOverlay} onClick={() => setLocationVehicle(null)}>
                    <div
                        style={{
                            background: 'white',
                            padding: '2rem',
                            borderRadius: '12px',
                            maxWidth: '500px',
                            width: '90%',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                            position: 'relative'
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        <button
                            onClick={() => setLocationVehicle(null)}
                            style={{
                                position: 'absolute',
                                top: '1rem',
                                right: '1rem',
                                background: 'none',
                                border: 'none',
                                fontSize: '1.5rem',
                                cursor: 'pointer',
                                color: '#64748b'
                            }}
                        >
                            ✕
                        </button>

                        <h3 style={{ marginTop: 0, marginBottom: '1.5rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            📍
                            Localização e Contato
                        </h3>

                        <div style={{ display: 'grid', gap: '1rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem' }}>Cidade</label>
                                    <div style={{ fontSize: '1rem', color: '#334155' }}>{locationVehicle.cidade}</div>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem' }}>Estado</label>
                                    <div style={{ fontSize: '1rem', color: '#334155' }}>{locationVehicle.estado}</div>
                                </div>
                            </div>

                            <div style={{ borderTop: '1px solid #e2e8f0', margin: '0.5rem 0' }}></div>

                            {locationVehicle.concessionaria && (
                                <div style={{ marginBottom: '1rem' }}>
                                    <label style={{ display: 'block', fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem' }}>Concessionária</label>
                                    <div style={{ fontSize: '1rem', color: '#334155' }}>{locationVehicle.concessionaria}</div>
                                </div>
                            )}

                            <div>
                                <label style={{ display: 'block', fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem' }}>Nome do Contato</label>
                                <div style={{ fontSize: '1rem', color: '#334155' }}>{locationVehicle.nomeContato}</div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem' }}>Telefone</label>
                                <div style={{ fontSize: '1rem', color: '#334155', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    {locationVehicle.telefone}
                                    <a
                                        href={`https://wa.me/55${locationVehicle.telefone.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá, tenho interesse no veículo ${locationVehicle.modelo} ${locationVehicle.cor} ${locationVehicle.ano} (R$ ${calculatePriceWithMargin(locationVehicle.preco || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                            fontSize: '0.875rem',
                                            color: '#25d366',
                                            textDecoration: 'none',
                                            background: '#dcfce7',
                                            padding: '2px 8px',
                                            borderRadius: '12px',
                                            fontWeight: 500
                                        }}
                                    >
                                        WhatsApp
                                    </a>
                                </div>
                            </div>
                        </div>

                        <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setLocationVehicle(null)}
                                style={{
                                    padding: '0.5rem 1.5rem',
                                    background: '#f1f5f9',
                                    border: 'none',
                                    borderRadius: '6px',
                                    color: '#475569',
                                    fontWeight: 500,
                                    cursor: 'pointer'
                                }}
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {showUpgradeModal && <UpgradeModal onClose={() => setShowUpgradeModal(false)} paidOnly />}
        </div>
    );
}// Função para determinar cor do status
function getStatusColor(status: string) {
    switch (status?.toLowerCase()) {
        case 'a faturar':
            return styles.statusAvailable; // Verde (reutilizando classe existente por enquanto)
        case 'refaturamento':
            return styles.statusReserved; // Amarelo
        case 'licenciado':
            return styles.statusSold; // Vermelho/Outra cor
        case 'pedido de fábrica':
            return styles.statusReserved; // Amarelo
        default:
            return styles.statusDefault;
    }
}

interface VehicleCardProps {
    vehicle: Vehicle;
    margem: number;
    fixedMargin: number;
    marginMode: 'percent' | 'fixed';
    onEdit: (vehicle: Vehicle) => void;
    onDelete: (vehicle: Vehicle) => void;
    onWhatsApp: (vehicle: Vehicle) => void;
    onLocationClick: (vehicle: Vehicle) => void;
    role?: 'admin' | 'administrador' | 'operator' | 'operador' | 'administrativo' | 'client' | 'gratis' | 'dealership' | 'gerente' | 'vendedor';
    canViewLocation?: boolean;
}

function VehicleCard({ vehicle, margem, fixedMargin, marginMode, onEdit, onDelete, onWhatsApp, onLocationClick, role = 'operator', canViewLocation = false }: VehicleCardProps) {
    // Função para calcular preço com margem (percentual ou valor fixo)
    const calculatePriceWithMargin = (basePrice: number) => {
        if (marginMode === 'fixed') {
            return (basePrice || 0) + (fixedMargin || 0);
        }
        return (basePrice || 0) * (1 + margem / 100);
    };

    // Função para calcular preço para o cliente (aplica margem sobre valorVenda)
    const calculateClientPrice = () => {
        const basePrice = vehicle.valorVenda || vehicle.preco || 0;
        if (marginMode === 'fixed') {
            return basePrice + (fixedMargin || 0);
        }
        return basePrice * (1 + margem / 100);
    };

    return (
        <div className={styles.vehicleCard}>
            <div className={styles.cardHeader}>
                <h4 className={styles.cardTitle}>{vehicle.modelo}</h4>
                <span className={`${styles.statusBadge} ${getStatusColor(vehicle.status)}`}>
                    {vehicle.status}
                </span>
            </div>

            <div className={styles.cardBody}>
                <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Data Entrada:</span>
                    <span className={styles.cardValue}>{formatDate(vehicle.dataEntrada)}</span>
                </div>
                <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Ano:</span>
                    <span className={styles.cardValue}>{vehicle.ano}</span>
                </div>
                <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>UF:</span>
                    <span className={styles.cardValue}>{vehicle.estado}</span>
                </div>
                <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Cor:</span>
                    <span className={styles.cardValue}>{vehicle.cor}</span>
                </div>
                <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Combustível:</span>
                    <span className={styles.cardValue}>{vehicle.combustivel}</span>
                </div>
                <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Transmissão:</span>
                    <span className={styles.cardValue}>{vehicle.transmissao}</span>
                </div>
                <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Localização:</span>
                    <span className={styles.cardValue}>
                        {(['admin', 'administrador', 'administrativo', 'gerente', 'operator', 'operador', 'dealership', 'gratis', 'vendedor'].includes(role) || canViewLocation) ? (
                            <button
                                onClick={() => onLocationClick(vehicle)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: '#2563eb',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: 0,
                                    fontSize: '0.9rem'
                                }}
                            >
                                📍 Ver detalhes
                            </button>
                        ) : (
                            <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Restrito</span>
                        )}
                    </span>
                </div>
                {role !== 'client' && vehicle.operador && (
                    <div className={styles.cardRow}>
                        <span className={styles.cardLabel}>Operador:</span>
                        <span className={styles.cardValue}>{vehicle.operador}</span>
                    </div>
                )}
                <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Última Atualização:</span>
                    <span className={styles.cardValue}>
                        {(() => {
                            const days = calculateDaysSinceUpdate(vehicle.updatedAt);
                            const color = getUpdateStatusColor(days);
                            return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span
                                        style={{
                                            display: 'inline-block',
                                            width: '8px',
                                            height: '8px',
                                            borderRadius: '50%',
                                            backgroundColor: color
                                        }}
                                    />
                                    <span>{formatDate(vehicle.updatedAt)}</span>
                                    <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>({days}d)</span>
                                </div>
                            );
                        })()}
                    </span>
                </div>
                {vehicle.observacoes && (
                    <div className={styles.cardRow}>
                        <span className={styles.cardLabel}>Observações:</span>
                        <span className={styles.cardValue}>{vehicle.observacoes}</span>
                    </div>
                )}
            </div>

            <div className={styles.cardFooter}>
                <div className={styles.priceSection} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                        <span className={styles.priceLabel} style={{ fontSize: '0.8rem' }}>Preço:</span>
                        <span className={styles.priceValue} style={{ fontSize: '0.9rem' }}>
                            R$ {(role === 'client' ? calculateClientPrice() : (vehicle.preco || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                    </div>
                    {['admin', 'administrador', 'operator', 'operador', 'gerente'].includes(role) && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                            <span className={styles.priceLabel} style={{ fontSize: '0.8rem' }}>Preço Venda:</span>
                            <span className={styles.priceValue} style={{ fontSize: '0.9rem' }}>
                                R$ {(vehicle.valorVenda || calculatePriceWithMargin(vehicle.preco || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                        </div>
                    )}
                </div>
                <div className={styles.cardActions}>
                    {role === 'client' ? (
                        <span
                            className={styles.whatsappButton}
                            title="Contatar Vendedor via WhatsApp"
                            onClick={() => onWhatsApp(vehicle)}
                            style={{ backgroundColor: '#25D366', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', width: '100%', display: 'inline-block', textAlign: 'center' }}
                            role="button"
                            tabIndex={0}
                        >
                            💬 WhatsApp
                        </span>
                    ) : (
                        <>
                            <span className={styles.proposalButton} title="Criar Proposta" role="button" tabIndex={0}>
                                📋
                            </span>
                            <span
                                className={styles.whatsappButton}
                                title="WhatsApp"
                                onClick={() => onWhatsApp(vehicle)}
                                role="button"
                                tabIndex={0}
                            >
                                💬
                            </span>
                            {!['client', 'gratis', 'dealership', 'vendedor'].includes(role) && (
                                <>
                                    <span
                                        className={styles.editButton}
                                        title="Editar"
                                        onClick={() => onEdit(vehicle)}
                                        role="button"
                                        tabIndex={0}
                                    >
                                        ✏️
                                    </span>
                                    <span
                                        className={styles.deleteButton}
                                        title="Excluir"
                                        onClick={() => onDelete(vehicle)}
                                        role="button"
                                        tabIndex={0}
                                    >
                                        🗑️
                                    </span>
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
