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
import { FaWhatsapp } from 'react-icons/fa';
import { VehicleGrid, getStatusColor } from './VehicleGrid';
import { VehicleTable } from './VehicleTable';
import { VehicleSidebar } from './VehicleSidebar';
import { VehicleFiltersBar } from './VehicleFiltersBar';
import { VehicleActionsHeader } from './VehicleActionsHeader';

import { BRAZIL_STATES, STATUS_OPTIONS, YEAR_REGEX, fuelLookup, statusLookup, transmissionLookup } from '../../lib/utils/constants';
import { calculateDaysSinceUpdate, formatDate, formatDateForInput, getUpdateStatusColor, normalizeString } from '../../lib/utils/formatters';

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
    const isClientReadOnly = true; // All edits moved to Pricing Catalog
    const { margem, fixedMargin, marginMode, setMargem, setMarginConfig } = useConfig();
    const [showMargemModal, setShowMargemModal] = useState(false);
    const [inputMargem, setInputMargem] = useState<string>(margem.toString());
    const [inputFixedMargin, setInputFixedMargin] = useState<string>(fixedMargin.toString());
    const [inputMarginMode, setInputMarginMode] = useState<'percent' | 'fixed'>(marginMode);

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

        alert(`Margem de ${margemLabel} salva. Os preços exibidos serão recalculados automaticamente.`);

        setShowMargemModal(false);
    };

    // Estado efetivo (aplicado) para busca e filtros
    const [searchTerm, setSearchTerm] = useState('');
    // Estado pendente (digitando) para evitar disparar requisições a cada tecla
    const [pendingSearchTerm, setPendingSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
    const [showVehicleForm, setShowVehicleForm] = useState(false);
    const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);

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
                    'Opcionais', 'Preço Compra', 'Status',
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

    // Calcula o preço exibido ao cliente usando o preço base e a margem configurada.
    const calculateClientPrice = (vehicle: { preco?: number }) => {
        const basePrice = vehicle.preco || 0;
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

            <VehicleActionsHeader
                role={role}
                selectedIds={selectedIds}
                handleBulkUpdateDate={handleBulkUpdateDate}
                handleBulkDelete={handleBulkDelete}
                showExportMenu={showExportMenu}
                setShowExportMenu={setShowExportMenu}
                isExporting={isExporting}
                handleExport={handleExport}
                setShowMargemModal={setShowMargemModal}
                viewMode={viewMode}
                setViewMode={setViewMode}
                onClose={onClose}
                setShowUpgradeModal={setShowUpgradeModal}
            />

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
                <VehicleSidebar
                    modelSearch={modelSearch}
                    setModelSearch={setModelSearch}
                    handleModelSearchKeyDown={handleModelSearchKeyDown}
                    selectedModel={selectedModel}
                    handleModelSelect={handleModelSelect}
                    filteredModels={filteredModels}
                    focusedModelIndex={focusedModelIndex}
                    modelListRef={modelListRef}
                />

                <div className={styles.mainContent}>
                    <VehicleFiltersBar
                        pendingSearchTerm={pendingSearchTerm}
                        setPendingSearchTerm={setPendingSearchTerm}
                        searchTerm={searchTerm}
                        setSearchTerm={setSearchTerm}
                        filters={filters}
                        setFilters={setFilters}
                        clearFilters={clearFilters}
                        prefixWarnings={prefixWarnings}
                        setPrefixWarnings={setPrefixWarnings}
                        setCurrentPage={setCurrentPage}
                        totalItems={totalItems}
                    />

                    <div className={styles.resultsSection}>
                        {viewMode === 'table' ? (
                            <VehicleTable
                                vehicles={displayVehicles}
                                selectedIds={selectedIds}
                                selectedModel={selectedModel}
                                isClientReadOnly={isClientReadOnly}
                                sortConfig={sortConfig as any}
                                pendingSearchTerm={pendingSearchTerm}
                                modeloOptions={modeloOptions}
                                transmissaoOptions={transmissaoOptions}
                                combustivelOptions={combustivelOptions}
                                statusOptions={STATUS_OPTIONS}
                                brazilStates={BRAZIL_STATES}
                                role={role}
                                localCredits={localCredits}
                                margem={margem}
                                fixedMargin={fixedMargin}
                                marginMode={marginMode}
                                handleSelectAll={handleSelectAll}
                                handleSort={handleSort as any}
                                handleSelectOne={handleSelectOne}
                                handleUpdateVehicleField={handleUpdateVehicleField}
                                handleUpdateOpcionais={handleUpdateOpcionais}
                                handleUpdatePreco={handleUpdatePreco}
                                handleLocationClick={handleLocationClick}
                                onWhatsApp={handleWhatsAppClick}
                            />
                        ) : (
                            <VehicleGrid
                                vehicles={displayVehicles}
                                margem={margem}
                                fixedMargin={fixedMargin}
                                marginMode={marginMode}
                                onWhatsApp={handleWhatsAppClick}
                                onLocationClick={handleLocationClick}
                                role={role as any}
                                canViewLocation={(session?.user as any)?.canViewLocation}
                            />
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
                                <label style={{ display: 'block', fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem' }}>Contato Principal</label>
                                <div style={{ fontSize: '1rem', color: '#334155' }}>{locationVehicle.nomeContato || '-'}</div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem' }}>Telefone</label>
                                <div style={{ fontSize: '1rem', color: '#334155', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    {locationVehicle.telefone || '-'}
                                    {locationVehicle.telefone && (
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
                                    )}
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
}
