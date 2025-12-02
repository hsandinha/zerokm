'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useConfig } from '../../lib/contexts/ConfigContext';
import { useVehicleDatabase } from '../../lib/hooks/useVehicleDatabase';
import { useTablesDatabase } from '../../lib/hooks/useTablesDatabase';
import { Vehicle } from '../../lib/services/vehicleService';
import { AddVehicleModal } from './AddVehicleModal';
import styles from './VehicleConsultation.module.css';
import modalStyles from './TablesManagement.module.css';
import { HighlightText } from '../HighlightText';

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
    'licenciado': 'Licenciado'
};

const YEAR_REGEX = /^\d{4}$/;

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

interface VehicleConsultationProps {
    onClose?: () => void;
    role?: 'admin' | 'operator' | 'client' | 'dealership';
}

type FiltersState = {
    modelo: string;
    cor: string;
    ano: string;
    status: string;
    combustivel: string;
    transmissao: string;
    opcionais: string;
};

const INITIAL_FILTERS: FiltersState = {
    modelo: '',
    cor: '',
    ano: '',
    status: '',
    combustivel: '',
    transmissao: '',
    opcionais: ''
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

export function VehicleConsultation({ onClose, role = 'operator' }: VehicleConsultationProps) {
    const { margem } = useConfig();
    // Estado efetivo (aplicado) para busca e filtros
    const [searchTerm, setSearchTerm] = useState('');
    // Estado pendente (digitando) para evitar disparar requisições a cada tecla
    const [pendingSearchTerm, setPendingSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
    const [showVehicleForm, setShowVehicleForm] = useState(false);
    const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
    const [showImportModal, setShowImportModal] = useState(false);
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [importResults, setImportResults] = useState<{
        success: number;
        headers?: string[];
        errors: Array<{ line: number; reason: string; raw?: string; columns?: string[] }>;
    } | null>(null);
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

    // Usar o hook do banco de dados
    const { vehicles, totalItems, loading, error, refreshVehicles, updateVehicle, deleteVehicle, deleteVehicles, getVehiclesPaginated } = useVehicleDatabase();
    const { importVeiculosFromCSV } = useTablesDatabase();
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const percent = importProgress.total > 0
        ? Math.max(0, Math.min(100, Math.round((importProgress.current / importProgress.total) * 100)))
        : 0;

    // Carregar cores conhecidas para detecção automática
    useEffect(() => {
        const abortController = new AbortController();

        const loadColors = async () => {
            try {
                const res = await fetch('/api/vehicles/suggestions?fields=cor&limit=200', { signal: abortController.signal });
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
                const res = await fetch('/api/vehicles/suggestions?fields=modelo&limit=1000', { signal: abortController.signal });
                if (!res.ok) return;
                const data = await res.json();
                if (data.suggestions?.modelo) {
                    setAvailableModels(data.suggestions.modelo);
                }
            } catch (error: any) {
                if (error?.name !== 'AbortError') {
                    console.error('Erro ao carregar modelos:', error);
                }
            }
        };

        loadColors();
        loadModels();

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

        const datasetOrder: FilterKey[] = ['transmissao', 'combustivel', 'status', 'cor', 'ano'];

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
            opcionais: (vehicle) => vehicle.opcionais
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
                const response = await fetch(`/api/vehicles/suggestions?fields=modelo,opcionais,cor&searchTerm=${encodeURIComponent(token)}&limit=20`, { signal });
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

            const prefixMatch = trimmed.match(/^(combustivel|transmissao|status|ano|preco|cor|modelo|opcionais):(.+)$/i);
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
                const suggestionOrder: FilterKey[] = ['cor'];

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
    }, [vehicles, normalizedColorMap, filters, selectedModel]);

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

    // Função para calcular preço com margem
    const calculatePriceWithMargin = (basePrice: number) => {
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
            `Olá, tenho interesse no veículo ${vehicle.modelo} ${vehicle.cor} ${vehicle.ano} (R$ ${calculatePriceWithMargin(vehicle.preco || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`
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
    const downloadErrorsCsv = () => {
        if (!importResults || !importResults.errors || importResults.errors.length === 0) return;
        const header = 'linha,motivo,conteudo';
        const rows = importResults.errors.map((e) => {
            const reason = (e.reason || '').replace(/"/g, '""');
            const raw = (e.raw || '').replace(/"/g, '""');
            return `${e.line},"${reason}","${raw}"`;
        });
        const csv = [header, ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'relatorio-erros-importacao.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const downloadErrorsCsvWithOriginalColumns = () => {
        if (!importResults || !importResults.errors?.length) return;
        const originalHeaders = (importResults.headers && importResults.headers.length === 16)
            ? importResults.headers
            : [
                'dataEntrada', 'modelo', 'transmissao', 'combustivel', 'cor', 'ano', 'opcionais', 'preco', 'status', 'observacoes',
                'cidade', 'estado', 'concessionaria', 'telefone', 'nomeContato', 'operador'
            ];
        const header = [...originalHeaders, 'erro'].join(',');
        const rows = importResults.errors.map((e) => {
            const cols = e.columns ? [...e.columns] : new Array(originalHeaders.length).fill('');
            while (cols.length < originalHeaders.length) cols.push('');
            while (cols.length > originalHeaders.length) cols.length = originalHeaders.length;
            const escaped = cols.map(v => `"${(v ?? '').replace(/"/g, '""')}"`);
            const reason = `"${(e.reason || '').replace(/"/g, '""')}"`;
            return [...escaped, reason].join(',');
        });
        const csv = [header, ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'erros-com-colunas-originais.csv';
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

    const handleModelSelect = (model: string | null) => {
        setSelectedModel(model);
        setFilters(prev => ({ ...prev, modelo: model || '' }));
        setCurrentPage(1);
    };

    const filteredModels = availableModels.filter(m =>
        normalizeString(m).includes(normalizeString(modelSearch))
    );

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
                <div className={styles.headerActions}>
                    {role !== 'client' && selectedIds.length > 0 && (
                        <button
                            className={styles.deleteButton}
                            onClick={handleBulkDelete}
                            title="Excluir Selecionados"
                            style={{ marginRight: '10px', backgroundColor: '#dc3545', color: 'white' }}
                        >
                            🗑️ Excluir ({selectedIds.length})
                        </button>
                    )}
                    {role !== 'client' && (
                        <>
                            <button
                                className={styles.importButton}
                                onClick={() => setShowImportModal(true)}
                                title="Importar Veículos do CSV"
                            >
                                📂 Importar CSV
                            </button>
                            <button
                                className={styles.addButton}
                                onClick={handleNewVehicleClick}
                                title={showVehicleForm ? 'Fechar formulário' : 'Cadastrar Novo Veículo'}
                            >
                                {showVehicleForm ? 'Cancelar' : '+ Novo Veículo'}
                            </button>
                        </>
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
                        </div>

                        <div className={styles.searchInfo}>
                            <button onClick={clearFilters} className={styles.clearButton}>
                                Limpar Busca
                            </button>
                            {/* Chips de filtros aplicados */}
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
                                {filters.status && (
                                    <span style={{ background: '#eef', border: '1px solid #99c', borderRadius: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', color: '#1a1a1a' }}>
                                        Status: {filters.status}
                                        <button onClick={() => { setFilters({ ...filters, status: '' }); setCurrentPage(1); }} style={{ marginLeft: '6px', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
                                    </span>
                                )}
                                {filters.ano && (
                                    <span style={{ background: '#eef', border: '1px solid #99c', borderRadius: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', color: '#1a1a1a' }}>
                                        Ano: {filters.ano}
                                        <button onClick={() => { setFilters({ ...filters, ano: '' }); setCurrentPage(1); }} style={{ marginLeft: '6px', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
                                    </span>
                                )}
                                {filters.cor && (
                                    <span style={{ background: '#eef', border: '1px solid #99c', borderRadius: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', color: '#1a1a1a' }}>
                                        Cor: {filters.cor}
                                        <button onClick={() => { setFilters({ ...filters, cor: '' }); setCurrentPage(1); }} style={{ marginLeft: '6px', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
                                    </span>
                                )}
                                {filters.opcionais && (
                                    <span style={{ background: '#eef', border: '1px solid #99c', borderRadius: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', color: '#1a1a1a' }}>
                                        Opcionais: {filters.opcionais}
                                        <button onClick={() => { setFilters((prev) => ({ ...prev, opcionais: '' })); setCurrentPage(1); }} style={{ marginLeft: '6px', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
                                    </span>
                                )}
                            </div>
                            {/* Warnings de prefixos */}
                            {prefixWarnings.length > 0 && (
                                <div style={{ marginTop: '6px', color: '#a66', fontSize: '0.85rem' }}>
                                    {prefixWarnings.map((w, i) => (<div key={i}>⚠️ {w}</div>))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className={styles.resultsSection}>
                        <h3>Resultados ({totalItems})</h3>

                        {viewMode === 'table' ? (
                            <div className={styles.tableContainer}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th className={styles.tableHeader}>
                                                <input
                                                    type="checkbox"
                                                    onChange={handleSelectAll}
                                                    checked={displayVehicles.length > 0 && selectedIds.length === displayVehicles.length}
                                                />
                                            </th>
                                            <th className={styles.tableHeader} onClick={() => handleSort('dataEntrada')} style={{ cursor: 'pointer' }}>
                                                DATA ENTRADA {sortConfig.key === 'dataEntrada' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
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
                                            <th className={styles.tableHeader} onClick={() => handleSort('opcionais')} style={{ cursor: 'pointer' }}>
                                                OPCIONAIS {sortConfig.key === 'opcionais' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                                            </th>
                                            <th className={styles.tableHeader} onClick={() => handleSort('preco')} style={{ cursor: 'pointer' }}>
                                                VALOR (R$) {sortConfig.key === 'preco' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                                            </th>
                                            <th className={styles.tableHeader} onClick={() => handleSort('status')} style={{ cursor: 'pointer' }}>
                                                STATUS {sortConfig.key === 'status' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                                            </th>
                                            <th className={styles.tableHeader} onClick={() => handleSort('observacoes')} style={{ cursor: 'pointer' }}>
                                                OBSERVAÇÕES {sortConfig.key === 'observacoes' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                                            </th>
                                            <th className={styles.tableHeader} onClick={() => handleSort('cidade')} style={{ cursor: 'pointer' }}>
                                                CIDADE {sortConfig.key === 'cidade' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                                            </th>
                                            <th className={styles.tableHeader} onClick={() => handleSort('estado')} style={{ cursor: 'pointer' }}>
                                                ESTADO {sortConfig.key === 'estado' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                                            </th>
                                            <th className={styles.tableHeader} onClick={() => handleSort('concessionaria')} style={{ cursor: 'pointer' }}>
                                                CONCESSIONÁRIA {sortConfig.key === 'concessionaria' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                                            </th>
                                            <th className={styles.tableHeader} onClick={() => handleSort('telefone')} style={{ cursor: 'pointer' }}>
                                                TELEFONE {sortConfig.key === 'telefone' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                                            </th>
                                            <th className={styles.tableHeader} onClick={() => handleSort('nomeContato')} style={{ cursor: 'pointer' }}>
                                                NOME DO CONTATO {sortConfig.key === 'nomeContato' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                                            </th>
                                            {role !== 'client' && (
                                                <th className={styles.tableHeader} onClick={() => handleSort('operador')} style={{ cursor: 'pointer' }}>
                                                    OPERADOR {sortConfig.key === 'operador' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                                                </th>
                                            )}
                                            <th className={styles.tableHeader}>AÇÕES</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {displayVehicles.map((vehicle) => (
                                            <tr key={vehicle.id} className={styles.tableRow}>
                                                <td className={styles.tableCell}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedIds.includes(vehicle.id || '')}
                                                        onChange={() => handleSelectOne(vehicle.id || '')}
                                                    />
                                                </td>
                                                <td className={styles.tableCell}><HighlightText text={formatDate(vehicle.dataEntrada)} searchTerm={pendingSearchTerm} /></td>
                                                {!selectedModel && (
                                                    <td className={styles.tableCell}><HighlightText text={vehicle.modelo} searchTerm={pendingSearchTerm} /></td>
                                                )}
                                                <td className={styles.tableCell}><HighlightText text={vehicle.transmissao} searchTerm={pendingSearchTerm} /></td>
                                                <td className={styles.tableCell}><HighlightText text={vehicle.combustivel} searchTerm={pendingSearchTerm} /></td>
                                                <td className={styles.tableCell}><HighlightText text={vehicle.cor} searchTerm={pendingSearchTerm} /></td>
                                                <td className={styles.tableCell}><HighlightText text={vehicle.ano} searchTerm={pendingSearchTerm} /></td>
                                                <td className={styles.tableCell}><HighlightText text={vehicle.opcionais} searchTerm={pendingSearchTerm} /></td>
                                                <td className={styles.tableCell}>
                                                    R$ {calculatePriceWithMargin(vehicle.preco || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className={styles.tableCell}>
                                                    <span className={`${styles.statusBadge} ${getStatusColor(vehicle.status)}`}>
                                                        {vehicle.status}
                                                    </span>
                                                </td>
                                                <td className={styles.tableCell}><HighlightText text={vehicle.observacoes} searchTerm={pendingSearchTerm} /></td>
                                                <td className={styles.tableCell}><HighlightText text={vehicle.cidade} searchTerm={pendingSearchTerm} /></td>
                                                <td className={styles.tableCell}><HighlightText text={vehicle.estado} searchTerm={pendingSearchTerm} /></td>
                                                <td className={styles.tableCell}><HighlightText text={vehicle.concessionaria} searchTerm={pendingSearchTerm} /></td>
                                                <td className={styles.tableCell}><HighlightText text={vehicle.telefone} searchTerm={pendingSearchTerm} /></td>
                                                <td className={styles.tableCell}><HighlightText text={vehicle.nomeContato} searchTerm={pendingSearchTerm} /></td>
                                                {role !== 'client' && (
                                                    <td className={styles.tableCell}><HighlightText text={vehicle.operador} searchTerm={pendingSearchTerm} /></td>
                                                )}
                                                <td className={styles.tableCell}>
                                                    <div className={styles.actionButtons}>
                                                        {role === 'client' ? (
                                                            <button
                                                                className={styles.whatsappButton}
                                                                title="Contatar Vendedor via WhatsApp"
                                                                onClick={() => handleWhatsAppClick(vehicle)}
                                                                style={{ backgroundColor: '#25D366', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}
                                                            >
                                                                💬 WhatsApp
                                                            </button>
                                                        ) : (
                                                            <>
                                                                <button className={styles.proposalButton} title="Criar Proposta">
                                                                    📋
                                                                </button>
                                                                <button className={styles.whatsappButton} title="WhatsApp">
                                                                    💬
                                                                </button>
                                                                <button
                                                                    className={styles.editButton}
                                                                    title="Editar"
                                                                    onClick={() => handleEditVehicle(vehicle)}
                                                                >
                                                                    ✏️
                                                                </button>
                                                                <button
                                                                    className={styles.deleteButton}
                                                                    title="Excluir"
                                                                    onClick={() => handleDeleteVehicle(vehicle)}
                                                                >
                                                                    🗑️
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
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
                                        onEdit={handleEditVehicle}
                                        onDelete={handleDeleteVehicle}
                                        onWhatsApp={handleWhatsAppClick}
                                        role={role}
                                    />
                                ))}
                            </div>
                        )}

                        <div className={styles.paginationContainer} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', padding: '10px', borderTop: '1px solid #eee' }}>
                            <div className={styles.itemsPerPage}>
                                <label htmlFor="itemsPerPage">Itens por página: </label>
                                <select
                                    id="itemsPerPage"
                                    value={itemsPerPage}
                                    onChange={handleItemsPerPageChange}
                                    style={{ marginLeft: '10px', padding: '5px', borderRadius: '4px', border: '1px solid #ccc' }}
                                >
                                    <option value={25}>25</option>
                                    <option value={50}>50</option>
                                    <option value={75}>75</option>
                                    <option value={100}>100</option>
                                    <option value={-1}>Todos</option>
                                </select>
                            </div>

                            <div className={styles.paginationControls} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <button
                                    onClick={() => handlePageChange(currentPage - 1)}
                                    disabled={currentPage === 1}
                                    style={{
                                        padding: '5px 10px',
                                        cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                                        opacity: currentPage === 1 ? 0.5 : 1,
                                        border: '1px solid #ccc',
                                        borderRadius: '4px',
                                        background: '#fff'
                                    }}
                                >
                                    Anterior
                                </button>
                                <span>
                                    Página {currentPage} de {totalPages}
                                </span>
                                <button
                                    onClick={() => handlePageChange(currentPage + 1)}
                                    disabled={currentPage === totalPages}
                                    style={{
                                        padding: '5px 10px',
                                        cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                                        opacity: currentPage === totalPages ? 0.5 : 1,
                                        border: '1px solid #ccc',
                                        borderRadius: '4px',
                                        background: '#fff'
                                    }}
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
                                <h4>📋 Formato do arquivo CSV (16 colunas):</h4>
                                <ul>
                                    <li>Primeira linha deve conter os cabeçalhos: <strong>dataEntrada,modelo,transmissao,combustivel,cor,ano,opcionais,preco,status,observacoes,cidade,estado,concessionaria,telefone,nomeContato,operador</strong></li>
                                    <li>As linhas seguintes devem conter os dados separados por vírgula</li>
                                    <li><strong>Campos obrigatórios:</strong> modelo, transmissao, combustivel, ano, preco, status, cidade, estado, concessionaria, telefone, nomeContato</li>
                                    <li><strong>Campos opcionais:</strong> dataEntrada, cor, opcionais, observacoes, operador</li>
                                    <li><strong>Status válidos:</strong> A faturar, Refaturamento, Licenciado</li>
                                    <li><strong>Combustível válido:</strong> Flex, Gasolina, Etanol, Diesel, Elétrico, Híbrido</li>
                                    <li><strong>Transmissão válida:</strong> Manual, Automático, CVT</li>
                                    <li>Exemplo (role horizontalmente):</li>
                                </ul>
                                <pre className={modalStyles.csvExample} style={{ overflowX: 'auto', whiteSpace: 'nowrap' }}>
                                    dataEntrada,modelo,transmissao,combustivel,cor,ano,opcionais,preco,status,observacoes,cidade,estado,concessionaria,telefone,nomeContato,operador{"\n"}20/11/2025,COROLLA ALTIS 2.0,Automático,Flex,BRANCO POLAR,2024,AR CONDICIONADO,154920,A faturar,Veículo novo,São Paulo,SP,Toyota Prime,11999991001,CARLOS SILVA,JOÃO
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
                                <div className={modalStyles.importResults}>
                                    <h4>✅ Importação Concluída!</h4>
                                    <p><strong>Veículos importados com sucesso:</strong> {importResults.success}</p>
                                    {importResults.errors.length > 0 && (
                                        <p style={{ color: '#dc2626', marginTop: '0.5rem' }}>
                                            <strong>⚠️ Linhas com erro:</strong> {importResults.errors.length}
                                        </p>
                                    )}
                                    {importResults.errors.length > 0 && (
                                        <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}>
                                            Use os botões abaixo para baixar o relatório detalhado dos erros e corrigi-los.
                                        </p>
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
                            {importResults && importResults.errors?.length > 0 && !importProgress.isImporting && (
                                <button
                                    type="button"
                                    className={modalStyles.addButton || modalStyles.cancelButton}
                                    onClick={downloadErrorsCsv}
                                >
                                    ⬇️ Baixar relatório (CSV)
                                </button>
                            )}
                            {importResults && importResults.errors?.length > 0 && !importProgress.isImporting && (
                                <button
                                    type="button"
                                    className={modalStyles.addButton || modalStyles.cancelButton}
                                    onClick={downloadErrorsCsvWithOriginalColumns}
                                >
                                    ⬇️ Baixar CSV (colunas + erro)
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
        default:
            return styles.statusDefault;
    }
}

interface VehicleCardProps {
    vehicle: Vehicle;
    margem: number;
    onEdit: (vehicle: Vehicle) => void;
    onDelete: (vehicle: Vehicle) => void;
    onWhatsApp: (vehicle: Vehicle) => void;
    role?: 'admin' | 'operator' | 'client' | 'dealership';
}

function VehicleCard({ vehicle, margem, onEdit, onDelete, onWhatsApp, role = 'operator' }: VehicleCardProps) {
    // Função para calcular preço com margem
    const calculatePriceWithMargin = (basePrice: number) => {
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
                    <span className={styles.cardLabel}>Cor:</span>
                    <span className={styles.cardValue}>{vehicle.cor}</span>
                </div>
                <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Concessionária:</span>
                    <span className={styles.cardValue}>{vehicle.concessionaria}</span>
                </div>
                <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Cidade:</span>
                    <span className={styles.cardValue}>{vehicle.cidade} - {vehicle.estado}</span>
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
                    <span className={styles.cardLabel}>Contato:</span>
                    <span className={styles.cardValue}>{vehicle.nomeContato}</span>
                </div>
                <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Telefone:</span>
                    <span className={styles.cardValue}>{vehicle.telefone}</span>
                </div>
                {role !== 'client' && vehicle.operador && (
                    <div className={styles.cardRow}>
                        <span className={styles.cardLabel}>Operador:</span>
                        <span className={styles.cardValue}>{vehicle.operador}</span>
                    </div>
                )}
                {vehicle.observacoes && (
                    <div className={styles.cardRow}>
                        <span className={styles.cardLabel}>Observações:</span>
                        <span className={styles.cardValue}>{vehicle.observacoes}</span>
                    </div>
                )}
            </div>

            <div className={styles.cardFooter}>
                <div className={styles.priceSection}>
                    <span className={styles.priceLabel}>Preço:</span>
                    <span className={styles.priceValue}>
                        R$ {calculatePriceWithMargin(vehicle.preco || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                </div>
                <div className={styles.cardActions}>
                    {role === 'client' ? (
                        <button
                            className={styles.whatsappButton}
                            title="Contatar Vendedor via WhatsApp"
                            onClick={() => onWhatsApp(vehicle)}
                            style={{ backgroundColor: '#25D366', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', width: '100%' }}
                        >
                            💬 WhatsApp
                        </button>
                    ) : (
                        <>
                            <button className={styles.proposalButton} title="Criar Proposta">
                                📋
                            </button>
                            <button
                                className={styles.whatsappButton}
                                title="WhatsApp"
                                onClick={() => onWhatsApp(vehicle)}
                            >
                                💬
                            </button>
                            <button
                                className={styles.editButton}
                                title="Editar"
                                onClick={() => onEdit(vehicle)}
                            >
                                ✏️
                            </button>
                            <button
                                className={styles.deleteButton}
                                title="Excluir"
                                onClick={() => onDelete(vehicle)}
                            >
                                🗑️
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}