"use client";

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { getSession } from 'next-auth/react';
import { UsersTable } from './users/UsersTable';
import { ConcessionariasManagement } from '../../../components/admin/ConcessionariasManagement';
import { TransportadorasManagement } from '../../../components/admin/TransportadorasManagement';
import { TabelasManagement } from '../../../components/admin/TabelasManagement';
import { MargemManagement } from '../../../components/admin/MargemManagement';
import UserMenu from '../../../components/UserMenu';
import styles from './admin.module.css';

const VehicleConsultation = dynamic(
    () =>
        // @ts-expect-error Next.js handles extensionless dynamic import under NodeNext
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

type TabType = 'visao-geral' | 'usuarios' | 'veiculos' | 'concessionarias' | 'transportadoras' | 'tabelas' | 'margem' | 'configuracoes';

type MetricItem = {
    nome: string;
    total?: number;
    dias?: number;
    lastUpdated?: string | null;
};

interface AdminMetricsResponse {
    byOperator: MetricItem[];
    byConcessionaria: MetricItem[];
    concessionariaStaleness: MetricItem[];
}

export default function AdminDashboard() {
    const [activeTab, setActiveTab] = useState<TabType>('visao-geral');
    const [userInfo, setUserInfo] = useState<{ name?: string | null; email?: string | null; profile?: string }>({});
    const [metrics, setMetrics] = useState<AdminMetricsResponse>({ byOperator: [], byConcessionaria: [], concessionariaStaleness: [] });
    const [loadingMetrics, setLoadingMetrics] = useState<boolean>(false);
    const [metricsError, setMetricsError] = useState<string | null>(null);

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

    useEffect(() => {
        const fetchMetrics = async () => {
            setLoadingMetrics(true);
            setMetricsError(null);
            try {
                const res = await fetch('/api/admin/metrics');
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
    }, []);

    const allTabs = [
        { id: 'visao-geral', label: 'Visão Geral', icon: '📊' },
        { id: 'usuarios', label: 'Usuários', icon: '👥' },
        { id: 'veiculos', label: 'Veículos', icon: '🚗' },
        { id: 'concessionarias', label: 'Concessionárias', icon: '🏢' },
        { id: 'transportadoras', label: 'Frete', icon: '🚚' },
        { id: 'tabelas', label: 'Tabelas', icon: '📋' },
        { id: 'margem', label: 'Margem', icon: '💹' },
        { id: 'configuracoes', label: 'Configurações', icon: '⚙️' }
    ];

    const tabs = allTabs.filter(tab => {
        if (userInfo.profile === 'gerente' && tab.id === 'usuarios') return false;
        return true;
    });

    const renderTabContent = () => {
        switch (activeTab) {
            case 'visao-geral':
                return (
                    <div className={styles.contentArea}>
                        <h2 className={styles.title}>Visão Geral</h2>
                        <p className={styles.subtitle}>Acompanhe rapidamente os principais indicadores de cadastro e atualização.</p>

                        {metricsError && <div className={styles.errorBox}>{metricsError}</div>}

                        {loadingMetrics ? (
                            <p className={styles.subtitle}>Carregando métricas...</p>
                        ) : (
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
                                        <div className={styles.cardTitle}>Veículos por Concessionária</div>
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
                        <UsersTable />
                    </div>
                );
            case 'veiculos':
                return <VehicleConsultation />;
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
            case 'margem':
                return (
                    <div className={styles.contentArea}>
                        <MargemManagement />
                    </div>
                );
            case 'configuracoes':
                return (
                    <div className={styles.contentArea}>
                        <h2 className={styles.title}>Configurações do Sistema</h2>
                        <p className={styles.subtitle}>Ajustes globais da plataforma.</p>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <h1>Zero KM</h1>
                    <span className={styles.subtitle}>Painel Administrativo</span>
                </div>
                <div className={styles.headerRight}>
                    <UserMenu
                        name={userInfo.name || 'Administrador'}
                        email={userInfo.email}
                        role={userInfo.profile === 'gerente' ? 'Gerente' : 'Administrador'}
                    />
                </div>
            </div>

            <div className={styles.tabsContainer}>
                <div className={styles.tabsList}>
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
                            onClick={() => setActiveTab(tab.id as TabType)}
                        >
                            <span className={styles.tabIcon}>{tab.icon}</span>
                            <span className={styles.tabLabel}>{tab.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className={styles.tabContent}>{renderTabContent()}</div>
        </div>
    );
}
