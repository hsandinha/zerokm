'use client';

import { useState, useCallback } from 'react';
import { useConfig } from '../../lib/contexts/ConfigContext';
import { useVehicleDatabase } from '../../lib/hooks/useVehicleDatabase';
import { useTablesDatabase } from '../../lib/hooks/useTablesDatabase';
import { Vehicle } from '../../lib/services/vehicleService';
import { AddVehicleModal } from './AddVehicleModal';
import styles from './VehicleConsultation.module.css';
import modalStyles from './TablesManagement.module.css';
import { AutocompleteInput } from './AutocompleteInput';



interface VehicleConsultationProps {
    onClose?: () => void;
}

export function VehicleConsultation({ onClose }: VehicleConsultationProps) {
    const { margem } = useConfig();
    const [searchTerm, setSearchTerm] = useState('');
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

    // Usar o hook do banco Firebase
    const { vehicles, loading, error, refreshVehicles, updateVehicle, deleteVehicle, deleteVehicles } = useVehicleDatabase();
    const { importVeiculosFromCSV } = useTablesDatabase();
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const percent = importProgress.total > 0
        ? Math.max(0, Math.min(100, Math.round((importProgress.current / importProgress.total) * 100)))
        : 0;

    // Função para gerar sugestões de autocompletar
    const getUniqueSuggestions = useCallback((field: keyof Vehicle, searchTerm: string): string[] => {
        if (searchTerm.length === 0) return [];
        const allValues = vehicles.map(v => v[field]?.toString() || '').filter(Boolean);
        const uniqueValues = [...new Set(allValues)];
        return uniqueValues.filter(v => v.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 10);
    }, [vehicles]);

    // Funções de sugestão para cada campo
    const getMarcaSuggestions = useCallback((searchTerm: string) => getUniqueSuggestions('marca', searchTerm), [getUniqueSuggestions]);
    const getModeloSuggestions = useCallback((searchTerm: string) => getUniqueSuggestions('modelo', searchTerm), [getUniqueSuggestions]);
    const getCategoriaSuggestions = useCallback((searchTerm: string) => getUniqueSuggestions('versao', searchTerm), [getUniqueSuggestions]);
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

    // Função para excluir veículo
    const handleDeleteVehicle = async (vehicle: Vehicle) => {
        if (window.confirm(`Tem certeza que deseja excluir o veículo ${vehicle.marca} ${vehicle.modelo}?`)) {
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
        const originalHeaders = (importResults.headers && importResults.headers.length === 20)
            ? importResults.headers
            : [
                'marca', 'modelo', 'versao', 'opcionais', 'cor', 'concessionaria', 'preco', 'ano', 'anoModelo', 'status',
                'cidade', 'estado', 'chassi', 'motor', 'combustivel', 'transmissao', 'observacoes', 'dataEntrada', 'vendedor', 'telefone'
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



    // Filtrar veículos baseado na busca e filtros avançados
    const filteredVehicles = vehicles.filter(vehicle => {
        // Filtro de busca geral
        let matchesSearch = true;
        if (searchTerm.length >= 3) {
            const searchFields = [
                vehicle.marca,
                vehicle.modelo,
                vehicle.versao,
                vehicle.cor,
                vehicle.concessionaria,
                vehicle.cidade,
                vehicle.estado,
                vehicle.status,
                vehicle.combustivel,
                vehicle.transmissao,
                vehicle.ano,
                vehicle.anoModelo,
                vehicle.vendedor,
                vehicle.observacoes,
                vehicle.preco?.toString()
            ];

            matchesSearch = searchFields.some(field =>
                field?.toString().toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        // Filtros avançados (usando campos disponíveis no Firebase)
        const matchesAdvancedFilters = (
            (filters.marca === '' || vehicle.marca?.toLowerCase().includes(filters.marca.toLowerCase())) &&
            (filters.modelo === '' || vehicle.modelo?.toLowerCase().includes(filters.modelo.toLowerCase())) &&
            (filters.categoria === '' || vehicle.versao?.toLowerCase().includes(filters.categoria.toLowerCase())) &&
            (filters.cor === '' || vehicle.cor?.toLowerCase().includes(filters.cor.toLowerCase())) &&
            (filters.status === '' || vehicle.status?.toLowerCase().includes(filters.status.toLowerCase())) &&
            (filters.combustivel === '' || vehicle.combustivel?.toLowerCase().includes(filters.combustivel.toLowerCase())) &&
            (filters.transmissao === '' || vehicle.transmissao?.toLowerCase().includes(filters.transmissao.toLowerCase())) &&
            (filters.ano === '' || vehicle.ano?.toString().includes(filters.ano))
        );

        return matchesSearch && matchesAdvancedFilters;
    });

    const clearFilters = () => {
        setSearchTerm('');
    };

    const applyAdvancedFilters = () => {
        // Filtros são aplicados automaticamente através do useState
        console.log('Filtros aplicados:', filters);
    };

    const clearAllFilters = () => {
        setSearchTerm('');
        setFilters({
            marca: '',
            modelo: '',
            categoria: '',
            cor: '',
            ano: '',
            status: '',
            combustivel: '',
            transmissao: ''
        });
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            const allIds = filteredVehicles.map(v => v.id).filter(Boolean) as string[];
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
                    {selectedIds.length > 0 && (
                        <button
                            className={styles.deleteButton}
                            onClick={handleBulkDelete}
                            title="Excluir Selecionados"
                            style={{ marginRight: '10px', backgroundColor: '#dc3545', color: 'white' }}
                        >
                            🗑️ Excluir ({selectedIds.length})
                        </button>
                    )}
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
                        placeholder="Digite para pesquisar (mín. 3 caracteres)..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className={styles.searchInput}
                    />

                </div>

                {showAdvancedFilters && (
                    <div className={styles.advancedFilters}>
                        <h3>Filtros Avançados</h3>
                        <div className={styles.filterGrid}>
                            <div className={styles.filterItem}>
                                <AutocompleteInput
                                    label="Marca"
                                    value={filters.marca}
                                    onChange={(value) => setFilters({ ...filters, marca: value })}
                                    getSuggestions={getMarcaSuggestions}
                                    placeholder="Filtrar por marca"
                                />
                            </div>
                            <div className={styles.filterItem}>
                                <AutocompleteInput
                                    label="Modelo"
                                    value={filters.modelo}
                                    onChange={(value) => setFilters({ ...filters, modelo: value })}
                                    getSuggestions={getModeloSuggestions}
                                    placeholder="Filtrar por modelo"
                                />
                            </div>
                            <div className={styles.filterItem}>
                                <AutocompleteInput
                                    label="Categoria"
                                    value={filters.categoria}
                                    onChange={(value) => setFilters({ ...filters, categoria: value })}
                                    getSuggestions={getCategoriaSuggestions}
                                    placeholder="Filtrar por categoria"
                                />
                            </div>
                            <div className={styles.filterItem}>
                                <AutocompleteInput
                                    label="Cor"
                                    value={filters.cor}
                                    onChange={(value) => setFilters({ ...filters, cor: value })}
                                    getSuggestions={getCorSuggestions}
                                    placeholder="Filtrar por cor"
                                />
                            </div>
                            <div className={styles.filterItem}>
                                <AutocompleteInput
                                    label="Ano"
                                    value={filters.ano}
                                    onChange={(value) => setFilters({ ...filters, ano: value })}
                                    getSuggestions={getAnoSuggestions}
                                    placeholder="Filtrar por ano"
                                />
                            </div>
                            <div className={styles.filterItem}>
                                <AutocompleteInput
                                    label="Status"
                                    value={filters.status}
                                    onChange={(value) => setFilters({ ...filters, status: value })}
                                    getSuggestions={getStatusSuggestions}
                                    placeholder="Filtrar por status"
                                />
                            </div>
                            <div className={styles.filterItem}>
                                <AutocompleteInput
                                    label="Combustível"
                                    value={filters.combustivel}
                                    onChange={(value) => setFilters({ ...filters, combustivel: value })}
                                    getSuggestions={getCombustivelSuggestions}
                                    placeholder="Filtrar por combustível"
                                />
                            </div>
                            <div className={styles.filterItem}>
                                <AutocompleteInput
                                    label="Transmissão"
                                    value={filters.transmissao}
                                    onChange={(value) => setFilters({ ...filters, transmissao: value })}
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
                </div>
            </div>

            <div className={styles.resultsSection}>
                <h3>Resultados ({filteredVehicles.length})</h3>

                {viewMode === 'table' ? (
                    <div className={styles.tableContainer}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th className={styles.tableHeader}>
                                        <input
                                            type="checkbox"
                                            onChange={handleSelectAll}
                                            checked={filteredVehicles.length > 0 && selectedIds.length === filteredVehicles.length}
                                        />
                                    </th>
                                    <th className={styles.tableHeader}>MARCA</th>
                                    <th className={styles.tableHeader}>MODELO</th>
                                    <th className={styles.tableHeader}>VERSÃO</th>
                                    <th className={styles.tableHeader}>OPCIONAIS</th>
                                    <th className={styles.tableHeader}>COR</th>
                                    <th className={styles.tableHeader}>CONCESSIONÁRIA</th>
                                    <th className={styles.tableHeader}>PREÇO (R$)</th>
                                    <th className={styles.tableHeader}>ANO</th>
                                    <th className={styles.tableHeader}>ANO MODELO</th>
                                    <th className={styles.tableHeader}>STATUS</th>
                                    <th className={styles.tableHeader}>CIDADE</th>
                                    <th className={styles.tableHeader}>ESTADO</th>
                                    <th className={styles.tableHeader}>CHASSI</th>
                                    <th className={styles.tableHeader}>MOTOR</th>
                                    <th className={styles.tableHeader}>COMBUSTÍVEL</th>
                                    <th className={styles.tableHeader}>TRANSMISSÃO</th>
                                    <th className={styles.tableHeader}>OBSERVAÇÕES</th>
                                    <th className={styles.tableHeader}>DATA ENTRADA</th>
                                    <th className={styles.tableHeader}>VENDEDOR</th>
                                    <th className={styles.tableHeader}>TELEFONE</th>
                                    <th className={styles.tableHeader}>AÇÕES</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredVehicles.map((vehicle) => (
                                    <tr key={vehicle.id} className={styles.tableRow}>
                                        <td className={styles.tableCell}>
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(vehicle.id || '')}
                                                onChange={() => handleSelectOne(vehicle.id || '')}
                                            />
                                        </td>
                                        <td className={styles.tableCell}>{vehicle.marca}</td>
                                        <td className={styles.tableCell}>{vehicle.modelo}</td>
                                        <td className={styles.tableCell}>{vehicle.versao}</td>
                                        <td className={styles.tableCell}>{vehicle.opcionais}</td>
                                        <td className={styles.tableCell}>{vehicle.cor}</td>
                                        <td className={styles.tableCell}>{vehicle.concessionaria}</td>
                                        <td className={styles.tableCell}>
                                            R$ {calculatePriceWithMargin(vehicle.preco || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className={styles.tableCell}>{vehicle.ano}</td>
                                        <td className={styles.tableCell}>{vehicle.anoModelo}</td>
                                        <td className={styles.tableCell}>
                                            <span className={`${styles.statusBadge} ${getStatusColor(vehicle.status)}`}>
                                                {vehicle.status}
                                            </span>
                                        </td>
                                        <td className={styles.tableCell}>{vehicle.cidade}</td>
                                        <td className={styles.tableCell}>{vehicle.estado}</td>
                                        <td className={styles.tableCell}>{vehicle.chassi}</td>
                                        <td className={styles.tableCell}>{vehicle.motor}</td>
                                        <td className={styles.tableCell}>{vehicle.combustivel}</td>
                                        <td className={styles.tableCell}>{vehicle.transmissao}</td>
                                        <td className={styles.tableCell}>{vehicle.observacoes}</td>
                                        <td className={styles.tableCell}>{vehicle.dataEntrada}</td>
                                        <td className={styles.tableCell}>{vehicle.vendedor}</td>
                                        <td className={styles.tableCell}>{vehicle.telefone}</td>
                                        <td className={styles.tableCell}>
                                            <div className={styles.actionButtons}>
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
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className={styles.gridContainer}>
                        {filteredVehicles.map((vehicle) => (
                            <VehicleCard
                                key={vehicle.id}
                                vehicle={vehicle}
                                margem={margem}
                                onEdit={handleEditVehicle}
                                onDelete={handleDeleteVehicle}
                            />
                        ))}
                    </div>
                )}
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
                                <h4>📋 Formato do arquivo CSV (20 colunas):</h4>
                                <ul>
                                    <li>Primeira linha deve conter os cabeçalhos: <strong>marca,modelo,versao,opcionais,cor,concessionaria,preco,ano,anoModelo,status,cidade,estado,chassi,motor,combustivel,transmissao,observacoes,dataEntrada,vendedor,telefone</strong></li>
                                    <li>As linhas seguintes devem conter os dados separados por vírgula</li>
                                    <li><strong>Campos obrigatórios:</strong> marca, modelo, concessionaria, cidade, estado, vendedor, telefone</li>
                                    <li><strong>Campos opcionais:</strong> versao, opcionais, cor, preco, ano, anoModelo, status, chassi, motor, combustivel, transmissao, observacoes, dataEntrada</li>
                                    <li><strong>Status válidos:</strong> Disponível, Vendido, Reservado, Manutenção</li>
                                    <li><strong>Combustível válido:</strong> Flex, Gasolina, Etanol, Diesel, Elétrico, Híbrido</li>
                                    <li><strong>Transmissão válida:</strong> Manual, Automática, CVT</li>
                                    <li><strong>Validação:</strong> Marca deve existir e Modelo deve estar cadastrado para a mesma Marca</li>
                                    <li>Exemplo (role horizontalmente):</li>
                                </ul>
                                <pre className={modalStyles.csvExample} style={{ overflowX: 'auto', whiteSpace: 'nowrap' }}>
                                    marca,modelo,versao,opcionais,cor,concessionaria,preco,ano,anoModelo,status,cidade,estado,chassi,motor,combustivel,transmissao,observacoes,dataEntrada,vendedor,telefone{"\n"}TOYOTA,COROLLA,XEI 2.0,Ar Cond + Dir Hidráulica,Prata,Concessionária Toyota SP,95000,2023,2024,Disponível,São Paulo,SP,9BR1234567890,2.0 16V,Flex,Automática,Veículo em ótimo estado,19/11/2025,João Silva,(11) 98765-4321
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
        case 'disponível':
            return styles.statusAvailable;
        case 'reservado':
            return styles.statusReserved;
        case 'vendido':
            return styles.statusSold;
        default:
            return styles.statusDefault;
    }
}

interface VehicleCardProps {
    vehicle: Vehicle;
    margem: number;
    onEdit: (vehicle: Vehicle) => void;
    onDelete: (vehicle: Vehicle) => void;
}

function VehicleCard({ vehicle, margem, onEdit, onDelete }: VehicleCardProps) {
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
                    <span className={styles.cardLabel}>Marca:</span>
                    <span className={styles.cardValue}>{vehicle.marca}</span>
                </div>
                <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Versão:</span>
                    <span className={styles.cardValue}>{vehicle.versao}</span>
                </div>
                <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Ano:</span>
                    <span className={styles.cardValue}>{vehicle.ano}</span>
                </div>
                <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Ano Modelo:</span>
                    <span className={styles.cardValue}>{vehicle.anoModelo}</span>
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
                    <span className={styles.cardLabel}>Motor:</span>
                    <span className={styles.cardValue}>{vehicle.motor}</span>
                </div>
                <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Vendedor:</span>
                    <span className={styles.cardValue}>{vehicle.vendedor}</span>
                </div>
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
                    <button className={styles.proposalButton} title="Criar Proposta">
                        📋
                    </button>
                    <button className={styles.whatsappButton} title="WhatsApp">
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
                </div>
            </div>
        </div>
    );
}