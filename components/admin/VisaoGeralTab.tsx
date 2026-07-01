"use client";

import { useState, useEffect } from 'react';
import styles from '../../app/dashboard/admin/admin.module.css';
import { ChurnDashboard } from './ChurnDashboard';
import { MdFilterAlt } from 'react-icons/md';

type MetricItem = {
    nome: string;
    total?: number;
    dias?: number;
    lastUpdated?: string | null;
};

type DealershipDetail = {
    concessionaria: string;
    responsavel: string;
    operador?: string;
    total: number;
    dias: number;
    lastUpdated: string | null;
};

interface AdminMetricsResponse {
    byOperator: MetricItem[];
    byConcessionaria: MetricItem[];
    concessionariaStaleness: MetricItem[];
    dealershipDetails: DealershipDetail[];
}

type FiltersState = {
    operador: string;
    concessionaria: string;
    responsavel: string;
    diasDesde: string;
};

const INITIAL_FILTERS: FiltersState = {
    operador: '',
    concessionaria: '',
    responsavel: '',
    diasDesde: ''
};

interface VisaoGeralTabProps {
    userInfo: { name?: string | null; email?: string | null; profile?: string };
}

export function VisaoGeralTab({ userInfo }: VisaoGeralTabProps) {
    const [metrics, setMetrics] = useState<AdminMetricsResponse>({ byOperator: [], byConcessionaria: [], concessionariaStaleness: [], dealershipDetails: [] });
    const [loadingMetrics, setLoadingMetrics] = useState<boolean>(false);
    const [metricsError, setMetricsError] = useState<string | null>(null);
    const [filters, setFilters] = useState<FiltersState>({ ...INITIAL_FILTERS });
    const [showFilters, setShowFilters] = useState<boolean>(false);
    const [viewMode, setViewMode] = useState<'summary' | 'detailed'>('summary');
    const [operadoresList, setOperadoresList] = useState<string[]>([]);
    const [concessionariasList, setConcessionariasList] = useState<string[]>([]);
    const [responsaveisList, setResponsaveisList] = useState<string[]>([]);
    const [allDealershipDetails, setAllDealershipDetails] = useState<DealershipDetail[]>([]);

    useEffect(() => {
        const fetchAllData = async () => {
            try {
                const res = await fetch('/api/admin/metrics');
                if (res.ok) {
                    const data: AdminMetricsResponse = await res.json();
                    if (data.dealershipDetails) {
                        setAllDealershipDetails(data.dealershipDetails);
                    }
                }
            } catch (error) {
                console.error('Erro ao carregar dados completos:', error);
            }
        };
        fetchAllData();
    }, []);

    useEffect(() => {
        if (allDealershipDetails.length === 0) return;

        const operadoresFiltered = allDealershipDetails.filter(item => {
            if (filters.concessionaria && item.concessionaria !== filters.concessionaria) return false;
            if (filters.responsavel && item.responsavel !== filters.responsavel) return false;
            return true;
        });

        const concessionariasFiltered = allDealershipDetails.filter(item => {
            if (filters.operador && item.operador !== filters.operador) return false;
            if (filters.responsavel && item.responsavel !== filters.responsavel) return false;
            return true;
        });

        const responsaveisFiltered = allDealershipDetails.filter(item => {
            if (filters.operador && item.operador !== filters.operador) return false;
            if (filters.concessionaria && item.concessionaria !== filters.concessionaria) return false;
            return true;
        });

        const uniqueOperadores = [...new Set(operadoresFiltered.map(item => item.operador).filter((v): v is string => Boolean(v)))].sort();
        const uniqueConcessionarias = [...new Set(concessionariasFiltered.map(item => item.concessionaria).filter((v): v is string => Boolean(v)))].sort();
        const uniqueResponsaveis = [...new Set(responsaveisFiltered.map(item => item.responsavel).filter((v): v is string => Boolean(v)))].sort();

        setOperadoresList(uniqueOperadores);
        setConcessionariasList(uniqueConcessionarias);
        setResponsaveisList(uniqueResponsaveis);
    }, [filters.operador, filters.concessionaria, filters.responsavel, allDealershipDetails]);

    useEffect(() => {
        const fetchMetrics = async () => {
            setLoadingMetrics(true);
            setMetricsError(null);
            try {
                const params = new URLSearchParams();
                Object.entries(filters).forEach(([key, value]) => {
                    if (value) params.append(key, value);
                });

                const url = `/api/admin/metrics${params.toString() ? '?' + params.toString() : ''}`;
                const res = await fetch(url);
                if (!res.ok) {
                    throw new Error('Não foi possível carregar os dados de visão geral');
                }
                const data: AdminMetricsResponse = await res.json();
                setMetrics(data);
            } catch (error: any) {
                console.error('Erro ao buscar métricas:', error);
                setMetricsError(error?.message || 'Erro ao buscar métricas');
            } finally {
                setLoadingMetrics(false);
            }
        };

        fetchMetrics();
    }, [filters]);

    const handleFilterChange = (key: keyof FiltersState, value: string) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const handleClearFilters = () => {
        setFilters({ ...INITIAL_FILTERS });
    };

    const handlePrint = () => {
        window.print();
    };

    const activeFiltersCount = Object.values(filters).filter(value => value !== '').length;

    return (
        <div className={styles.contentArea}>
            <div className={styles.topBarActions}>
                <h2 className={styles.dashboardTitle}>Visão Geral</h2>
                <div className={styles.topBarButtons}>
                    <button 
                        className={`${styles.filterToggleButton} ${activeFiltersCount > 0 ? styles.active : ''}`}
                        onClick={() => setShowFilters(!showFilters)}
                    >
                        <MdFilterAlt size={18} />
                        Filtros {activeFiltersCount > 0 && `(${activeFiltersCount})`}
                    </button>
                    <button className={styles.viewButton} onClick={() => setViewMode(viewMode === 'summary' ? 'detailed' : 'summary')}>
                        {viewMode === 'summary' ? '📋 Detalhado' : '📊 Resumo'}
                    </button>
                    <button className={styles.printButton} onClick={handlePrint}>
                        🖨️ Imprimir
                    </button>
                </div>
            </div>

            {!showFilters && activeFiltersCount > 0 && (() => {
                const activeFilters = Object.entries(filters).filter(([_, value]) => value !== '');
                return (
                    <div className={styles.activeFiltersBar}>
                        <span className={styles.activeFiltersLabel}>Filtros ativos:</span>
                        {activeFilters.map(([key, value]) => {
                            const filterLabels: Record<string, string> = {
                                operador: 'Operador',
                                concessionaria: 'Concessionária',
                                responsavel: 'Responsável',
                                diasDesde: 'Dias sem Atualização'
                            };

                            const label = filterLabels[key] || key;
                            let displayValue = value;

                            if (key === 'diasDesde') {
                                const diasLabels: Record<string, string> = {
                                    '0-1': '0-1 (Verde)',
                                    '2-3': '2-3 (Amarelo)',
                                    '4+': '4+ (Vermelho)',
                                    '7+': '7+ (Crítico)',
                                    '15+': '15+ (Urgente)'
                                };
                                displayValue = diasLabels[value] || value;
                            }

                            return (
                                <span key={key} className={styles.activeFilterTag}>
                                    {label}: {displayValue}
                                    <button
                                        onClick={() => handleFilterChange(key as keyof FiltersState, '')}
                                        className={styles.removeFilterButton}
                                    >
                                        ×
                                    </button>
                                </span>
                            );
                        })}
                    </div>
                );
            })()}

            {showFilters && (
                <div className={styles.filtersPanel}>
                    <div className={styles.filtersGrid}>
                        <div>
                            <input
                                type="text"
                                placeholder="Operador"
                                value={filters.operador}
                                onChange={(e) => handleFilterChange('operador', e.target.value)}
                                className={styles.filterInput}
                                list="operadores-list"
                            />
                            <datalist id="operadores-list">
                                {operadoresList.map((op, idx) => (
                                    <option key={idx} value={op} />
                                ))}
                            </datalist>
                        </div>
                        <div>
                            <input
                                type="text"
                                placeholder="Concessionária"
                                value={filters.concessionaria}
                                onChange={(e) => handleFilterChange('concessionaria', e.target.value)}
                                className={styles.filterInput}
                                list="concessionarias-list"
                            />
                            <datalist id="concessionarias-list">
                                {concessionariasList.map((conc, idx) => (
                                    <option key={idx} value={conc} />
                                ))}
                            </datalist>
                        </div>
                        <div>
                            <input
                                type="text"
                                placeholder="Responsável"
                                value={filters.responsavel}
                                onChange={(e) => handleFilterChange('responsavel', e.target.value)}
                                className={styles.filterInput}
                                list="responsaveis-list"
                            />
                            <datalist id="responsaveis-list">
                                {responsaveisList.map((resp, idx) => (
                                    <option key={idx} value={resp} />
                                ))}
                            </datalist>
                        </div>
                        <select
                            value={filters.diasDesde}
                            onChange={(e) => handleFilterChange('diasDesde', e.target.value)}
                            className={styles.filterInput}
                        >
                            <option value="">Dias sem Atualização</option>
                            <option value="0-1">🟢 0-1 dia (Verde)</option>
                            <option value="2-3">🟡 2-3 dias (Amarelo)</option>
                            <option value="4+">🔴 4+ dias (Vermelho)</option>
                            <option value="7+">⚠️ 7+ dias (Crítico)</option>
                            <option value="15+">🚨 15+ dias (Urgente)</option>
                        </select>
                        <button onClick={handleClearFilters} className={styles.clearFiltersButton}>
                            Limpar Filtros
                        </button>
                    </div>
                </div>
            )}

            {metricsError && <div className={styles.errorBox}>{metricsError}</div>}

            {loadingMetrics ? (
                <p className={styles.subtitle}>Carregando métricas...</p>
            ) : viewMode === 'summary' ? (
                <>
                    {['administrador', 'admin'].includes(userInfo.profile || '') && <ChurnDashboard />}
                    <div className={styles.dashboardGrid}>
                        <div className={styles.dashboardCard}>
                        <div className={styles.cardHeader}>
                            <div className={styles.cardTitle}>Veículos por Operador</div>
                            <span className={styles.cardBadge}>Cadastro</span>
                        </div>
                        <ul className={styles.cardList}>
                            {metrics.byOperator.length === 0 && <li className={styles.cardListItem}>Sem dados</li>}
                            {metrics.byOperator.map((item) => (
                                <li key={item.nome} className={styles.cardListItem}>
                                    <span>{item.nome}</span>
                                    <strong>{item.total}</strong>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className={styles.dashboardCard}>
                        <div className={styles.cardHeader}>
                            <div className={styles.cardTitle}>
                                Veículos por Concessionária
                                <span className={styles.cardSubtitle} style={{ fontSize: '0.75rem', display: 'block', marginTop: '2px', color: 'var(--color-text-muted)' }}>
                                    (Top 20)
                                </span>
                            </div>
                            <span className={styles.cardBadge}>Estoque</span>
                        </div>
                        <ul className={styles.cardList}>
                            {metrics.byConcessionaria.length === 0 && <li className={styles.cardListItem}>Sem dados</li>}
                            {metrics.byConcessionaria.map((item) => (
                                <li key={item.nome} className={styles.cardListItem}>
                                    <span>{item.nome}</span>
                                    <strong>{item.total}</strong>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className={styles.dashboardCard}>
                        <div className={styles.cardHeader}>
                            <div className={styles.cardTitle}>Staleness (Média)</div>
                            <span className={styles.cardBadge}>Dias sem atualizar</span>
                        </div>
                        <ul className={styles.cardList}>
                            {metrics.concessionariaStaleness.length === 0 && <li className={styles.cardListItem}>Sem dados</li>}
                            {metrics.concessionariaStaleness.map((item) => (
                                <li key={item.nome} className={styles.cardListItem}>
                                    <span>{item.nome}</span>
                                    <strong>{item.dias} dias</strong>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
                </>
            ) : (
                <div className={styles.dashboardCard} style={{ gridColumn: '1 / -1', marginTop: '20px' }}>
                    <div className={styles.cardHeader}>
                        <div className={styles.cardTitle}>Visão Detalhada por Concessionária</div>
                        <span className={styles.cardBadge}>{metrics.dealershipDetails?.length || 0} Registros</span>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th className={styles.tableHeader}>Concessionária</th>
                                    <th className={styles.tableHeader}>Responsável</th>
                                    <th className={styles.tableHeader}>Operador</th>
                                    <th className={styles.tableHeader} style={{ textAlign: 'center' }}>Total Veículos</th>
                                    <th className={styles.tableHeader} style={{ textAlign: 'center' }}>Dias s/ Atualização</th>
                                    <th className={styles.tableHeader}>Última Atualização</th>
                                </tr>
                            </thead>
                            <tbody>
                                {!metrics.dealershipDetails || metrics.dealershipDetails.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className={styles.tableCell} style={{ textAlign: 'center' }}>
                                            Nenhum dado encontrado para os filtros selecionados.
                                        </td>
                                    </tr>
                                ) : (
                                    metrics.dealershipDetails.map((detail, idx) => (
                                        <tr key={idx} className={styles.tableRow}>
                                            <td className={styles.tableCell} style={{ fontWeight: 500 }}>{detail.concessionaria}</td>
                                            <td className={styles.tableCell}>{detail.responsavel || '-'}</td>
                                            <td className={styles.tableCell}>{detail.operador || '-'}</td>
                                            <td className={styles.tableCell} style={{ textAlign: 'center' }}>{detail.total}</td>
                                            <td className={styles.tableCell} style={{ textAlign: 'center' }}>
                                                <span style={{ 
                                                    display: 'inline-block', 
                                                    padding: '2px 8px', 
                                                    borderRadius: '12px',
                                                    fontSize: '0.85rem',
                                                    fontWeight: 600,
                                                    backgroundColor: detail.dias <= 1 ? '#e6f4ea' : detail.dias <= 3 ? '#fef7e0' : detail.dias <= 6 ? '#fce8e6' : '#fad2cf',
                                                    color: detail.dias <= 1 ? '#137333' : detail.dias <= 3 ? '#b06000' : detail.dias <= 6 ? '#c5221f' : '#a50e0e'
                                                }}>
                                                    {detail.dias} {detail.dias === 1 ? 'dia' : 'dias'}
                                                </span>
                                            </td>
                                            <td className={styles.tableCell} style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                                                {detail.lastUpdated ? new Date(detail.lastUpdated).toLocaleDateString('pt-BR') : '-'}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
