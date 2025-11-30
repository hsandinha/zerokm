'use client';

import { useState, useCallback, useEffect } from 'react';
import { useConfig } from '../../lib/contexts/ConfigContext';
import { useVehicleDatabase } from '../../lib/hooks/useVehicleDatabase';
import { useTablesDatabase } from '../../lib/hooks/useTablesDatabase';
import { Vehicle } from '../../lib/services/vehicleService';
import { AddVehicleModal } from './AddVehicleModal';
import styles from './VehicleConsultation.module.css';
import modalStyles from './TablesManagement.module.css';
import { AutocompleteInput } from './AutocompleteInput';
import { HighlightText } from '../HighlightText';

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

export function VehicleConsultation({ onClose, role = 'operator' }: VehicleConsultationProps) {
    const { margem } = useConfig();
    // Estado efetivo (aplicado) para busca e filtros
    const [searchTerm, setSearchTerm] = useState('');
    // Estado pendente (digitando) para evitar disparar requisições a cada tecla
    const [pendingSearchTerm, setPendingSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
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
    const [filters, setFilters] = useState({
        marca: '',
        modelo: '',
        categoria: '',
        cor: '',
        ano: '',
        status: '',
        combustivel: '',
        transmissao: ''
    });
    // Filtros pendentes enquanto o usuário digita
    const [pendingFilters, setPendingFilters] = useState(filters);
    const [sortConfig, setSortConfig] = useState<{ key: keyof Vehicle | null; direction: 'asc' | 'desc' }>({
        key: null,
        direction: 'asc'
    });
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(50);

    // Usar o hook do banco de dados
    const { vehicles, totalItems, loading, error, refreshVehicles, updateVehicle, deleteVehicle, deleteVehicles, getVehiclesPaginated } = useVehicleDatabase();
    const { importVeiculosFromCSV, marcas, cores, refreshMarcas, refreshCores } = useTablesDatabase();
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const percent = importProgress.total > 0
        ? Math.max(0, Math.min(100, Math.round((importProgress.current / importProgress.total) * 100)))
        : 0;

    // Carregar marcas e cores para detecção automática
    useEffect(() => {
        refreshMarcas();
        refreshCores();
    }, []);

    // Carregar dados paginados do servidor
    useEffect(() => {
        const loadData = async () => {
            // Se busca tiver menos de 3 caracteres, não dispara (segue placeholder)
            const effectiveSearch = searchTerm && searchTerm.length < 3 ? '' : searchTerm;
            await getVehiclesPaginated({
                page: currentPage,
                itemsPerPage: itemsPerPage === -1 ? 1000 : itemsPerPage,
                searchTerm: effectiveSearch,
                filters,
                sortConfig: sortConfig.key ? sortConfig : undefined
            });
        };

        // Debounce apenas quando estados efetivos mudam
        const timeoutId = setTimeout(() => {
            loadData();
        }, 400);

        return () => clearTimeout(timeoutId);
    }, [currentPage, itemsPerPage, searchTerm, filters, sortConfig, getVehiclesPaginated]);

    // Auto-aplicar busca com debounce quando usuário digita (busca server-side automática com suporte a prefixos)
    useEffect(() => {
        const raw = pendingSearchTerm || '';
        const term = raw.trim();
        // Se menos de 3 caracteres e não está vazio, aguarda mais caracteres
        if (term.length > 0 && term.length < 3) return;

        const timeoutId = setTimeout(() => {
            // Parser simples de prefixos: combustivel:, transmissao:, status:, ano:, preco:
            const parts = term.split(/\s+/);
            // Inicializar filtros vazios - reprocessar tudo do zero
            const nextFilters = {
                marca: '',
                modelo: '',
                categoria: '',
                cor: '',
                ano: '',
                status: '',
                combustivel: '',
                transmissao: ''
            };
            let freeText: string[] = [];

            const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
            const fuelMap: Record<string, string> = {
                'flex': 'Flex',
                'gasolina': 'Gasolina',
                'etanol': 'Etanol',
                'alcool': 'Etanol',
                'diesel': 'Diesel',
                'eletrico': 'Elétrico',
                'hibrido': 'Híbrido'
            };
            const transMap: Record<string, string> = {
                'manual': 'Manual',
                'automatico': 'Automático',
                'cvt': 'CVT'
            };
            const statusMap: Record<string, string> = {
                'afaturar': 'A faturar',
                'refaturamento': 'Refaturamento',
                'licenciado': 'Licenciado'
            };

            const warnings: string[] = [];
            // Criar mapas de detecção para marca e cor (normalizado)
            const marcasMap: Record<string, string> = {};
            marcas.forEach(m => {
                const normalized = norm(m.nome);
                marcasMap[normalized] = m.nome;
            });
            const coresMap: Record<string, string> = {};
            cores.forEach(c => {
                const normalized = norm(c.nome);
                coresMap[normalized] = c.nome;
            });

            for (const p of parts) {
                const m = p.match(/^(combustivel|transmissao|status|ano|preco|marca|cor):(.+)$/i);
                if (!m) {
                    // Detecção automática: verificar se é marca ou cor conhecida
                    const normalizedPart = norm(p);

                    // Verificar se corresponde a um combustível conhecido
                    if (fuelMap[normalizedPart]) {
                        nextFilters.combustivel = fuelMap[normalizedPart];
                        continue;
                    }
                    // Verificar se corresponde a uma transmissão conhecida
                    if (transMap[normalizedPart]) {
                        nextFilters.transmissao = transMap[normalizedPart];
                        continue;
                    }
                    // Verificar se corresponde a um status conhecido
                    if (statusMap[normalizedPart]) {
                        nextFilters.status = statusMap[normalizedPart];
                        continue;
                    }
                    // Verificar se corresponde a uma marca conhecida
                    if (marcasMap[normalizedPart]) {
                        nextFilters.marca = marcasMap[normalizedPart];
                        continue;
                    }
                    // Verificar se corresponde a uma cor conhecida
                    if (coresMap[normalizedPart]) {
                        nextFilters.cor = coresMap[normalizedPart];
                        continue;
                    }

                    // Se não corresponde a nada conhecido, adiciona como busca livre
                    freeText.push(p);
                    continue;
                }
                const [, key, valueRaw] = m;
                const value = valueRaw.trim();
                switch (key.toLowerCase()) {
                    case 'combustivel': {
                        const mapped = fuelMap[norm(value)] || value;
                        nextFilters.combustivel = mapped;
                        break;
                    }
                    case 'transmissao': {
                        const mapped = transMap[norm(value)] || value;
                        nextFilters.transmissao = mapped;
                        break;
                    }
                    case 'status': {
                        const mapped = statusMap[norm(value)] || value;
                        nextFilters.status = mapped;
                        break;
                    }
                    case 'ano': {
                        nextFilters.ano = value;
                        break;
                    }
                    case 'marca': {
                        nextFilters.marca = value;
                        break;
                    }
                    case 'cor': {
                        nextFilters.cor = value;
                        break;
                    }
                    case 'preco': {
                        // Prefixo suportado no cliente; servidor atual não usa preco no GET
                        // Mantemos no freeText para não perder o termo
                        freeText.push(p);
                        warnings.push('Prefixo preco não é aplicado na busca do servidor.');
                        break;
                    }
                }
            }

            setFilters(nextFilters);
            setSearchTerm(freeText.join(' ').trim());
            setPrefixWarnings(warnings);
            setCurrentPage(1);
        }, 400); // Debounce de 400ms

        return () => clearTimeout(timeoutId);
    }, [pendingSearchTerm]);

    // Cache de sugestões carregadas uma vez da API dedicada (evita reload por tecla)
    const [suggestionsCache, setSuggestionsCache] = useState<Record<string, string[]>>({});
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const [prefixWarnings, setPrefixWarnings] = useState<string[]>([]);

    useEffect(() => {
        // Carrega apenas quando usuário abre filtros avançados e ainda não tem cache
        if (!showAdvancedFilters) return;
        if (Object.keys(suggestionsCache).length > 0) return;
        const fetchSuggestions = async () => {
            setLoadingSuggestions(true);
            try {
                const res = await fetch('/api/vehicles/suggestions?fields=modelo,cor,ano,status,combustivel,transmissao');
                if (res.ok) {
                    const data = await res.json();
                    setSuggestionsCache(data.suggestions || {});
                }
            } catch (e) {
                console.error('Erro ao carregar sugestões:', e);
            } finally {
                setLoadingSuggestions(false);
            }
        };
        fetchSuggestions();
    }, [showAdvancedFilters, suggestionsCache]);

    const getUniqueSuggestions = useCallback((field: keyof Vehicle, searchTerm: string): string[] => {
        if (!searchTerm) return [];
        const list = suggestionsCache[field as string] || [];
        return list.filter(v => v.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 10);
    }, [suggestionsCache]);

    const getModeloSuggestions = useCallback((searchTerm: string) => getUniqueSuggestions('modelo', searchTerm), [getUniqueSuggestions]);
    const getCorSuggestions = useCallback((searchTerm: string) => getUniqueSuggestions('cor', searchTerm), [getUniqueSuggestions]);
    const getAnoSuggestions = useCallback((searchTerm: string) => getUniqueSuggestions('ano', searchTerm), [getUniqueSuggestions]);
    const getStatusSuggestions = useCallback((searchTerm: string) => getUniqueSuggestions('status', searchTerm), [getUniqueSuggestions]);
    const getCombustivelSuggestions = useCallback((searchTerm: string) => getUniqueSuggestions('combustivel', searchTerm), [getUniqueSuggestions]);
    const getTransmissaoSuggestions = useCallback((searchTerm: string) => getUniqueSuggestions('transmissao', searchTerm), [getUniqueSuggestions]);

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
        setCurrentPage(1);
    };

    const applyAdvancedFilters = () => {
        setFilters(pendingFilters);
        setCurrentPage(1);
    };

    const clearAllFilters = () => {
        setPendingSearchTerm('');
        setSearchTerm('');
        const cleared = {
            marca: '',
            modelo: '',
            categoria: '',
            cor: '',
            ano: '',
            status: '',
            combustivel: '',
            transmissao: ''
        };
        setFilters(cleared);
        setPendingFilters(cleared);
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

    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.loadingMessage}>
                    Carregando veículos...
                </div>
            </div>
        );
    }

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

            <div className={styles.searchSection}>
                <div className={styles.searchContainer}>
                    <input
                        type="text"
                        placeholder="Digite para pesquisar (ex: argo, combustivel:diesel, transmissao:manual, marca:fiat, cor:preto, ano:2024)"
                        value={pendingSearchTerm}
                        onChange={(e) => setPendingSearchTerm(e.target.value)}
                        className={styles.searchInput}
                    />
                    <button
                        className={styles.applyButton}
                        style={{ marginLeft: '8px' }}
                        onClick={() => { setSearchTerm(pendingSearchTerm); setCurrentPage(1); }}
                        disabled={pendingSearchTerm.length > 0 && pendingSearchTerm.length < 3}
                        title={pendingSearchTerm.length > 0 && pendingSearchTerm.length < 3 ? 'Digite pelo menos 3 caracteres' : 'Aplicar busca no servidor'}
                    >
                        Buscar
                    </button>

                </div>

                {showAdvancedFilters && (
                    <div className={styles.advancedFilters}>
                        <h3>Filtros Avançados {loadingSuggestions && <span style={{ fontSize: '0.75rem', marginLeft: '6px' }}>carregando...</span>}</h3>
                        <div className={styles.filterGrid}>
                            <div className={styles.filterItem}>
                                <AutocompleteInput
                                    label="Modelo"
                                    value={pendingFilters.modelo}
                                    onChange={(value) => setPendingFilters({ ...pendingFilters, modelo: value })}
                                    getSuggestions={getModeloSuggestions}
                                    placeholder="Filtrar por modelo"
                                />
                            </div>
                            <div className={styles.filterItem}>
                                <AutocompleteInput
                                    label="Cor"
                                    value={pendingFilters.cor}
                                    onChange={(value) => setPendingFilters({ ...pendingFilters, cor: value })}
                                    getSuggestions={getCorSuggestions}
                                    placeholder="Filtrar por cor"
                                />
                            </div>
                            <div className={styles.filterItem}>
                                <AutocompleteInput
                                    label="Ano"
                                    value={pendingFilters.ano}
                                    onChange={(value) => setPendingFilters({ ...pendingFilters, ano: value })}
                                    getSuggestions={getAnoSuggestions}
                                    placeholder="Filtrar por ano"
                                />
                            </div>
                            <div className={styles.filterItem}>
                                <AutocompleteInput
                                    label="Status"
                                    value={pendingFilters.status}
                                    onChange={(value) => setPendingFilters({ ...pendingFilters, status: value })}
                                    getSuggestions={getStatusSuggestions}
                                    placeholder="Filtrar por status"
                                />
                            </div>
                            <div className={styles.filterItem}>
                                <AutocompleteInput
                                    label="Combustível"
                                    value={pendingFilters.combustivel}
                                    onChange={(value) => setPendingFilters({ ...pendingFilters, combustivel: value })}
                                    getSuggestions={getCombustivelSuggestions}
                                    placeholder="Filtrar por combustível"
                                />
                            </div>
                            <div className={styles.filterItem}>
                                <AutocompleteInput
                                    label="Transmissão"
                                    value={pendingFilters.transmissao}
                                    onChange={(value) => setPendingFilters({ ...pendingFilters, transmissao: value })}
                                    getSuggestions={getTransmissaoSuggestions}
                                    placeholder="Filtrar por transmissão"
                                />
                            </div>
                        </div>
                        <div className={styles.filterActions}>
                            <button onClick={applyAdvancedFilters} className={styles.applyButton}>
                                Aplicar Filtros
                            </button>
                            <button onClick={clearAllFilters} className={styles.clearButton}>
                                Limpar Filtros
                            </button>
                        </div>
                    </div>
                )}

                <div className={styles.searchInfo}>
                    <button
                        className={styles.filterToggle}
                        onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                        title="Filtros avançados"
                    >
                        Filtros Avançados {showAdvancedFilters ? '▲' : '▼'}
                    </button>
                    <button onClick={clearFilters} className={styles.clearButton}>
                        Limpar Busca
                    </button>
                    {/* Chips de filtros aplicados */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                        {searchTerm && (
                            <span style={{ background: '#eef', border: '1px solid #99c', borderRadius: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center' }}>
                                Busca: {searchTerm}
                                <button onClick={() => { setSearchTerm(''); setPendingSearchTerm(''); setCurrentPage(1); }} style={{ marginLeft: '6px', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
                            </span>
                        )}
                        {filters.combustivel && (
                            <span style={{ background: '#eef', border: '1px solid #99c', borderRadius: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center' }}>
                                Combustível: {filters.combustivel}
                                <button onClick={() => { setFilters({ ...filters, combustivel: '' }); setCurrentPage(1); }} style={{ marginLeft: '6px', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
                            </span>
                        )}
                        {filters.transmissao && (
                            <span style={{ background: '#eef', border: '1px solid #99c', borderRadius: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center' }}>
                                Transmissão: {filters.transmissao}
                                <button onClick={() => { setFilters({ ...filters, transmissao: '' }); setCurrentPage(1); }} style={{ marginLeft: '6px', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
                            </span>
                        )}
                        {filters.status && (
                            <span style={{ background: '#eef', border: '1px solid #99c', borderRadius: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center' }}>
                                Status: {filters.status}
                                <button onClick={() => { setFilters({ ...filters, status: '' }); setCurrentPage(1); }} style={{ marginLeft: '6px', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
                            </span>
                        )}
                        {filters.ano && (
                            <span style={{ background: '#eef', border: '1px solid #99c', borderRadius: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center' }}>
                                Ano: {filters.ano}
                                <button onClick={() => { setFilters({ ...filters, ano: '' }); setCurrentPage(1); }} style={{ marginLeft: '6px', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
                            </span>
                        )}
                        {filters.marca && (
                            <span style={{ background: '#eef', border: '1px solid #99c', borderRadius: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center' }}>
                                Marca: {filters.marca}
                                <button onClick={() => { setFilters({ ...filters, marca: '' }); setCurrentPage(1); }} style={{ marginLeft: '6px', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
                            </span>
                        )}
                        {filters.cor && (
                            <span style={{ background: '#eef', border: '1px solid #99c', borderRadius: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center' }}>
                                Cor: {filters.cor}
                                <button onClick={() => { setFilters({ ...filters, cor: '' }); setCurrentPage(1); }} style={{ marginLeft: '6px', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
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
                                    <th className={styles.tableHeader} onClick={() => handleSort('modelo')} style={{ cursor: 'pointer' }}>
                                        MODELO {sortConfig.key === 'modelo' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                                    </th>
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
                                        <td className={styles.tableCell}><HighlightText text={vehicle.modelo} searchTerm={pendingSearchTerm} /></td>
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