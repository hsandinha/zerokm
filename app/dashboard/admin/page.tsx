"use client";

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { getSession } from 'next-auth/react';
import { UsersTable } from './users/UsersTable';
import { ConcessionariasManagement } from '../../../components/admin/ConcessionariasManagement';
import { TransportadorasManagement } from '../../../components/admin/TransportadorasManagement';
import { TabelasManagement } from '../../../components/admin/TabelasManagement';
import { ConfigContext } from '../../../lib/contexts/ConfigContext';
import UserMenu from '../../../components/UserMenu';
import { PlansManagement } from '../../../components/settings/PlansManagement';
import { CRMManagement } from '../../../components/admin/CRMManagement';
import { ConfiguracoesManagement } from '../../../components/admin/ConfiguracoesManagement';
import { BannersManagement } from '@/components/admin/BannersManagement';
import IntegrationsPanel from '@/components/admin/IntegrationsPanel';
import { ChurnDashboard } from '../../../components/admin/ChurnDashboard';
import KanbanBoard from '../../../components/crm/KanbanBoard';
import styles from './admin.module.css';
import { MdFilterAlt } from 'react-icons/md';

const VehicleConsultation = dynamic<any>(
    () =>
        import('../../../components/operator/VehicleConsultation').then((mod) => ({ default: mod.VehicleConsultation })),
    {
        loading: () => (
            <div className={styles.contentArea}>
                <p className={styles.subtitle}>Carregando consulta de veículos...</p>
            </div>
        ),
        ssr: false
    }
);

type TabType = 'visao-geral' | 'usuarios' | 'veiculos' | 'concessionarias' | 'transportadoras' | 'tabelas' | 'margem' | 'configuracoes' | 'planos' | 'crm' | 'funil' | 'integracoes' | 'banners';

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

export default function AdminDashboard() {
    const [activeTab, setActiveTab] = useState<TabType>('visao-geral');
    const [crmHighlightEmail, setCrmHighlightEmail] = useState<string | null>(null);
    const [margem, setMargem] = useState<number>(0);
    const [fixedMargin, setFixedMargin] = useState<number>(0);
    const [marginMode, setMarginMode] = useState<'percent' | 'fixed'>('percent');
    const [userInfo, setUserInfo] = useState<{ name?: string | null; email?: string | null; profile?: string }>({});
    const [metrics, setMetrics] = useState<AdminMetricsResponse>({ byOperator: [], byConcessionaria: [], concessionariaStaleness: [], dealershipDetails: [] });
    const [loadingMetrics, setLoadingMetrics] = useState<boolean>(false);
    const [metricsError, setMetricsError] = useState<string | null>(null);
    const [filters, setFilters] = useState<FiltersState>({ ...INITIAL_FILTERS });
    const [showFilters, setShowFilters] = useState<boolean>(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
    const [viewMode, setViewMode] = useState<'summary' | 'detailed'>('summary');
    const [operadoresList, setOperadoresList] = useState<string[]>([]);
    const [concessionariasList, setConcessionariasList] = useState<string[]>([]);
    const [responsaveisList, setResponsaveisList] = useState<string[]>([]);
    const [allDealershipDetails, setAllDealershipDetails] = useState<DealershipDetail[]>([]);

    // Carregar margem da API
    useEffect(() => {
        const fetchMargem = async () => {
            try {
                const response = await fetch('/api/config/margem');
                if (response.ok) {
                    const data = await response.json();
                    setMargem(data.margem || 0);
                    setFixedMargin(data.fixedMargin || 0);
                    setMarginMode(data.marginMode === 'fixed' ? 'fixed' : 'percent');
                }
            } catch (error) {
                console.error('Erro ao carregar margem:', error);
                // Fallback para localStorage se API falhar
                const savedMargem = localStorage.getItem('vehicleMargem');
                if (savedMargem) {
                    setMargem(parseFloat(savedMargem));
                }
            }
        };
        fetchMargem();
    }, []);

    const updateMargem = async (newMargem: number, mode: 'percent' | 'fixed' = marginMode, newFixedMargin: number = fixedMargin) => {
        try {
            const response = await fetch('/api/config/margem', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ margem: newMargem, marginMode: mode, fixedMargin: newFixedMargin })
            });

            if (response.ok) {
                setMargem(newMargem);
                setFixedMargin(newFixedMargin);
                setMarginMode(mode);
                // Manter localStorage como backup
                localStorage.setItem('vehicleMargem', newMargem.toString());
            } else {
                console.error('Erro ao salvar margem na API');
                alert('Erro ao salvar margem. Tente novamente.');
            }
        } catch (error) {
            console.error('Erro ao atualizar margem:', error);
            alert('Erro ao salvar margem. Tente novamente.');
        }
    };

    useEffect(() => {
        getSession()
            .then((session) => {
                if (session?.user) {
                    setUserInfo({
                        name: session.user.name ?? 'Administrador',
                        email: session.user.email ?? null,
                        profile: session.user.profile,
                    });
                }
            })
            .catch((error) => {
                console.error('Erro ao carregar sessão do usuário:', error);
            });
    }, []);

    // Carregar dados completos para autocomplete (sem filtros)
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

    // Atualizar listas de autocomplete baseado nos filtros ativos (filtros encadeados)
    useEffect(() => {
        if (allDealershipDetails.length === 0) return;

        // Filtro para Operadores: considera apenas concessionaria e responsavel
        const operadoresFiltered = allDealershipDetails.filter(item => {
            if (filters.concessionaria && item.concessionaria !== filters.concessionaria) return false;
            if (filters.responsavel && item.responsavel !== filters.responsavel) return false;
            return true;
        });

        // Filtro para Concessionárias: considera apenas operador e responsavel
        const concessionariasFiltered = allDealershipDetails.filter(item => {
            if (filters.operador && item.operador !== filters.operador) return false;
            if (filters.responsavel && item.responsavel !== filters.responsavel) return false;
            return true;
        });

        // Filtro para Responsáveis: considera apenas operador e concessionaria
        const responsaveisFiltered = allDealershipDetails.filter(item => {
            if (filters.operador && item.operador !== filters.operador) return false;
            if (filters.concessionaria && item.concessionaria !== filters.concessionaria) return false;
            return true;
        });

        // Extrair listas únicas
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
                // Build query params from filters
                const params = new URLSearchParams();
                Object.entries(filters).forEach(([key, value]) => {
                    if (value) params.append(key, value);
                });

                const url = `/api/admin/metrics${params.toString() ? `?${params.toString()}` : ''}`;
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
    }, [filters]); const handleFilterChange = (key: keyof FiltersState, value: string) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const handleClearFilters = () => {
        setFilters({ ...INITIAL_FILTERS });
    };

    const handlePrint = () => {
        window.print();
    };

    const activeFiltersCount = Object.values(filters).filter(value => value !== '').length;

    const allTabs = [
        { id: 'visao-geral', label: 'Visão Geral', icon: '📊' },
        { id: 'usuarios', label: 'Usuários', icon: '👥' },
        { id: 'veiculos', label: 'Veículos', icon: '🚗' },
        { id: 'concessionarias', label: 'Concessionárias', icon: '🏢' },
        { id: 'transportadoras', label: 'Frete', icon: '🚚' },
        { id: 'tabelas', label: 'Tabelas', icon: '📋' },
        { id: 'configuracoes', label: 'Configurações', icon: '⚙️' },
        { id: 'planos', label: 'Planos', icon: '💳' },
        { id: 'crm', label: 'CRM', icon: '🎯' },
        { id: 'funil', label: 'Leads', icon: <MdFilterAlt size={18} /> },
        { id: 'integracoes', label: 'Integrações', icon: '🔌' },
        { id: 'banners', label: 'Banners', icon: '🖼️' }
    ];

    const tabs = allTabs.filter(tab => {
        if (userInfo.profile === 'marketing') {
            return tab.id === 'funil' || tab.id === 'integracoes';
        }
        if (userInfo.profile === 'gerente' && tab.id === 'usuarios') return false;
        if (userInfo.profile === 'gerente' && tab.id === 'planos') return false;
        if (userInfo.profile === 'gerente' && tab.id === 'crm') return false;
        if (userInfo.profile === 'gerente' && tab.id === 'funil') return false;
        return true;
    });

    const renderTabContent = () => {
        switch (activeTab) {
            case 'visao-geral':
                return (
                    <div className={styles.contentArea}>
                        <div className={styles.overviewHeader}>
                            <div>
                                <h2 className={styles.title}>Visão Geral</h2>
                                <p className={styles.subtitle}>Acompanhe rapidamente os principais indicadores de cadastro e atualização.</p>
                            </div>
                            <div className={styles.overviewActions}>
                                <button className={styles.toggleButton} onClick={() => setShowFilters(!showFilters)}>
                                    🔍 {showFilters ? 'Ocultar Filtros' : 'Filtros'}
                                    {activeFiltersCount > 0 && (
                                        <span className={styles.filterBadge}>{activeFiltersCount}</span>
                                    )}
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
                            console.log('Active Filters:', activeFilters);

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

                                        console.log(`Rendering filter: ${key} = ${value}`);

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
                                <ChurnDashboard />
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
                                            <span className={styles.countBadge}>{metrics.byConcessionaria.length}</span>
                                        </div>
                                        <span className={styles.cardBadge}>Inventário</span>
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
                                        <div className={styles.cardTitle}>Dias sem Atualização</div>
                                        <span className={styles.cardBadge}>Alertas</span>
                                    </div>
                                    <ul className={styles.cardList}>
                                        {metrics.concessionariaStaleness.length === 0 && <li className={styles.cardListItem}>Sem dados</li>}
                                        {metrics.concessionariaStaleness.map((item) => (
                                            <li key={item.nome} className={styles.cardListItem}>
                                                <span>{item.nome}</span>
                                                <strong>{item.dias != null ? `${item.dias} dias` : '-'}</strong>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                            </>
                        ) : (
                            <div className={styles.detailedView}>
                                <h3 className={styles.detailedTitle}>Relatório Detalhado por Concessionária</h3>
                                <p className={styles.detailedSubtitle}>Concessionária → Responsável → Quantidade de Veículos → Dias sem Atualizar</p>

                                <div className={styles.detailedTable}>
                                    <table className={styles.table}>
                                        <thead>
                                            <tr>
                                                <th>Concessionária</th>
                                                <th>Responsável</th>
                                                <th>Quantidade</th>
                                                <th>Dias sem Atualizar</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {metrics.dealershipDetails.length === 0 ? (
                                                <tr>
                                                    <td colSpan={4} style={{ textAlign: 'center' }}>Sem dados</td>
                                                </tr>
                                            ) : (
                                                metrics.dealershipDetails.map((detail, index) => {
                                                    const getColor = (days: number) => {
                                                        if (days <= 1) return '#10b981';
                                                        if (days <= 3) return '#f59e0b';
                                                        return '#ef4444';
                                                    };
                                                    return (
                                                        <tr key={index}>
                                                            <td>{detail.concessionaria}</td>
                                                            <td>{detail.responsavel}</td>
                                                            <td>{detail.total}</td>
                                                            <td>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    <span
                                                                        style={{
                                                                            display: 'inline-block',
                                                                            width: '10px',
                                                                            height: '10px',
                                                                            borderRadius: '50%',
                                                                            backgroundColor: getColor(detail.dias)
                                                                        }}
                                                                    />
                                                                    <span className={detail.dias > 3 ? styles.alertHigh : detail.dias > 1 ? styles.alertMedium : styles.alertLow}>
                                                                        {detail.dias} {detail.dias === 1 ? 'dia' : 'dias'}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                );
            case 'usuarios':
                return (
                    <div className={styles.contentArea}>
                        <h2 className={styles.title}>Gerenciamento de Usuários</h2>
                        <p className={styles.subtitle} style={{ marginBottom: '1.5rem' }}>
                            Controle quem tem acesso ao sistema e seus níveis de permissão.
                        </p>
                        <UsersTable onViewInCRM={(email) => { setActiveTab('crm'); setCrmHighlightEmail(email); }} />
                    </div>
                );
            case 'veiculos':
                return <VehicleConsultation role={userInfo.profile as any || 'admin'} />;
            case 'concessionarias':
                return (
                    <div className={styles.contentArea}>
                        <ConcessionariasManagement />
                    </div>
                );
            case 'transportadoras':
                return (
                    <div className={styles.contentArea}>
                        <TransportadorasManagement />
                    </div>
                );
            case 'tabelas':
                return (
                    <div className={styles.contentArea}>
                        <TabelasManagement />
                    </div>
                );
            case 'configuracoes':
                return (
                    <div className={styles.contentArea}>
                        <ConfiguracoesManagement />
                    </div>
                );
            case 'planos':
                return (
                    <div className={styles.contentArea}>
                        <PlansManagement />
                    </div>
                );
            case 'crm':
                return (
                    <div className={styles.contentArea}>
                        <CRMManagement highlightEmail={crmHighlightEmail} />
                    </div>
                );
            case 'funil':
                return (
                    <div className={styles.contentArea} style={{ padding: '0', background: 'transparent' }}>
                        <KanbanBoard />
                    </div>
                );
            case 'integracoes':
                return (
                    <div className={styles.contentArea}>
                        <IntegrationsPanel />
                    </div>
                );
            case 'banners':
                return (
                    <div className={styles.contentArea}>
                        <BannersManagement />
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <ConfigContext.Provider value={{ margem, fixedMargin, marginMode, setMargem: (v: number) => updateMargem(v, marginMode, fixedMargin), setMarginConfig: ({ margem: v, marginMode: m, fixedMargin: f }) => updateMargem(v, m, f) }}>
            <div className={styles.layoutWrapper}>
                <aside className={`${styles.sidebar} ${isSidebarCollapsed ? styles.sidebarCollapsed : ''}`}>
                    <div className={styles.sidebarHeader}>
                        {!isSidebarCollapsed && (
                            <Image
                                src="/images/logo.png"
                                alt="Logo"
                                width={160}
                                height={54}
                                className={styles.sidebarLogo}
                                priority
                            />
                        )}
                        {isSidebarCollapsed && (
                            <div className={styles.collapsedLogoPlaceholder}>
                                <strong>CNV</strong>
                            </div>
                        )}
                        <button 
                            className={styles.sidebarToggle}
                            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                            title={isSidebarCollapsed ? "Expandir menu" : "Minimizar menu"}
                        >
                            {isSidebarCollapsed ? '»' : '«'}
                        </button>
                    </div>

                    <div className={styles.sidebarMenuSection}>
                        {!isSidebarCollapsed && <p className={styles.sidebarMenuLabel}>MENU</p>}
                        <nav className={styles.sidebarNav}>
                            {tabs.map((tab) => (
                                <button
                                    key={tab.id}
                                    className={`${styles.sidebarItem} ${activeTab === tab.id ? styles.sidebarItemActive : ''}`}
                                    onClick={() => setActiveTab(tab.id as TabType)}
                                >
                                    <span className={styles.sidebarItemIcon}>{tab.icon}</span>
                                    <span className={styles.sidebarItemLabel}>{tab.label}</span>
                                </button>
                            ))}
                        </nav>
                    </div>

                    <div className={styles.sidebarFooter}>
                        {!isSidebarCollapsed ? (
                            <UserMenu
                                name={userInfo.name || 'Administrador'}
                                email={userInfo.email}
                                role={userInfo.profile === 'gerente' ? 'Gerente' : 'Administrador'}
                                isDropup={true}
                                alignLeft={true}
                            />
                        ) : (
                            <div className={styles.collapsedUserAvatar} title={userInfo.name || 'Admin'}>
                                {userInfo.name ? userInfo.name.charAt(0).toUpperCase() : 'A'}
                            </div>
                        )}
                    </div>
                </aside>

                <main className={styles.mainContent}>
                    {renderTabContent()}
                </main>
            </div>
        </ConfigContext.Provider>
    );
}
