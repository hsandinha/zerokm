'use client';

import { useState, useEffect } from 'react';
import { signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Badge } from '../../../components/Badge';
import { SummaryCard } from '../../../components/SummaryCard';
import { VehicleConsultation } from '../../../components/operator/VehicleConsultation';
import { ConfigContext, useConfig } from '../../../lib/contexts/ConfigContext';
import UserMenu from '../../../components/UserMenu';
import styles from './dealership.module.css';

import { Concessionaria } from '../../../lib/services/concessionariaService';

type TabType = 'visao-geral' | 'veiculos' | 'perfil';

interface ChartItem {
    label: string;
    value: number;
}

interface DealershipMetrics {
    veiculosCadastrados: number;
    veiculosVendidos: number;
    daysSinceUpdate: number;
    chartData: ChartItem[];
    propostas: {
        total: number;
        aprovadas: number;
        pendentes: number;
        rejeitadas: number;
    };
    faturamento: {
        mensal: number;
        total: number;
    };
    clientes: {
        total: number;
        novos: number;
    };
}

export default function DealershipDashboard() {
    const [activeTab, setActiveTab] = useState<TabType>('visao-geral');
    const [margem, setMargem] = useState<number>(0);
    const [metrics, setMetrics] = useState<DealershipMetrics | null>(null);
    const [loadingMetrics, setLoadingMetrics] = useState(false);
    const [profile, setProfile] = useState<Concessionaria | null>(null);
    const [loadingProfile, setLoadingProfile] = useState(false);
    const router = useRouter();

    const handleLogout = async () => {
        try {
            await signOut({
                callbackUrl: '/',
                redirect: false
            });
            router.push('/');
        } catch (error) {
            console.error('Erro ao fazer logout:', error);
            // Fallback: redirecionar diretamente
            router.push('/');
        }
    };

    // Carregar margem do localStorage
    useEffect(() => {
        const savedMargem = localStorage.getItem('vehicleMargem');
        if (savedMargem) {
            setMargem(parseFloat(savedMargem));
        }
    }, []);

    // Fetch metrics
    useEffect(() => {
        const fetchMetrics = async () => {
            setLoadingMetrics(true);
            try {
                const res = await fetch('/api/dealership/metrics');
                if (res.ok) {
                    const data = await res.json();
                    setMetrics(data);
                }
            } catch (error) {
                console.error('Erro ao buscar métricas:', error);
            } finally {
                setLoadingMetrics(false);
            }
        };

        if (activeTab === 'visao-geral') {
            fetchMetrics();
        }
    }, [activeTab]);

    // Fetch profile
    useEffect(() => {
        const fetchProfile = async () => {
            setLoadingProfile(true);
            try {
                const res = await fetch('/api/dealership/profile');
                if (res.ok) {
                    const data = await res.json();
                    setProfile(data);
                }
            } catch (error) {
                console.error('Erro ao buscar perfil:', error);
            } finally {
                setLoadingProfile(false);
            }
        };

        if (activeTab === 'perfil' && !profile) {
            fetchProfile();
        }
    }, [activeTab, profile]);

    const tabs = [
        { id: 'visao-geral', label: 'Visão Geral', icon: '📊' },
        { id: 'veiculos', label: 'Veículos', icon: '🚗' },
        { id: 'perfil', label: 'Meu Perfil', icon: '🏢' }
    ];

    const renderTabContent = () => {
        switch (activeTab) {
            case 'visao-geral':
                return <VisaoGeralTab metrics={metrics} loading={loadingMetrics} />;
            case 'veiculos':
                return <VehicleConsultation role="dealership" />;
            case 'perfil':
                return <PerfilTab profile={profile} loading={loadingProfile} />;
            default:
                return <VisaoGeralTab metrics={metrics} loading={loadingMetrics} />;
        }
    };

    return (
        <ConfigContext.Provider value={{ margem, setMargem }}>
            <div className={styles.container}>
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <h1>Zero KM</h1>
                        <span className={styles.subtitle}>Concessionária</span>
                    </div>
                    <div className={styles.headerRight}>
                        <UserMenu
                            name="Concessionária"
                            role="Concessionária"
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

                <div className={styles.tabContent}>
                    {renderTabContent()}
                </div>
            </div>
        </ConfigContext.Provider>
    );
}

// Dados mock removidos


function StockOverview({ metrics }: { metrics: DealershipMetrics }) {
    const chartData = metrics.chartData || [];
    const maxValue = Math.max(...chartData.map(d => d.value), 10) * 1.2;
    const daysSinceUpdate = metrics.daysSinceUpdate;

    let statusColor = 'green';
    let statusMessage = 'Estoque atualizado';
    let statusClass = styles.msgGreen;

    if (daysSinceUpdate > 1) {
        statusColor = 'yellow';
        statusMessage = 'Atenção: Atualize seu estoque';
        statusClass = styles.msgYellow;
    }
    if (daysSinceUpdate > 3) {
        statusColor = 'red';
        statusMessage = 'Crítico: Estoque desatualizado';
        statusClass = styles.msgRed;
    }

    return (
        <div className={styles.chartContainer}>
            <div className={styles.chartSection}>
                <div className={styles.chartHeader}>
                    <div className={styles.chartTitle}>Evolução do Estoque</div>
                </div>
                <div className={styles.barChart}>
                    {chartData.length === 0 ? (
                        <div style={{ width: '100%', textAlign: 'center', color: '#666' }}>Sem dados de histórico</div>
                    ) : (
                        chartData.map((item, index) => (
                            <div key={index} className={styles.barColumn}>
                                <div className={styles.barValue}>{item.value}</div>
                                <div
                                    className={styles.bar}
                                    style={{ height: `${(item.value / maxValue) * 100}%` }}
                                ></div>
                                <div className={styles.barLabel}>{item.label}</div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div className={styles.statusSection}>
                <div className={styles.chartTitle} style={{ marginBottom: '1.5rem' }}>Status de Atualização</div>
                <div className={styles.trafficLightContainer}>
                    <div className={`${styles.trafficLight} ${styles[statusColor]}`}></div>
                    <div className={styles.updateInfo}>
                        <span className={styles.updateLabel}>Última atualização</span>
                        <span className={styles.updateValue}>{daysSinceUpdate === 0 ? 'Hoje' : `${daysSinceUpdate} dia(s) atrás`}</span>
                        <span className={`${styles.updateMessage} ${statusClass}`}>{statusMessage}</span>
                    </div>

                </div>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>🚗</div>
                    <div className={styles.statContent}>
                        <h3>Veículos Cadastrados</h3>
                        <div className={styles.statNumber}>{metrics.veiculosCadastrados}</div>
                        <div className={styles.statChange}>Total em estoque</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function VisaoGeralTab({ metrics, loading }: { metrics: DealershipMetrics | null, loading: boolean }) {
    if (loading) {
        return (
            <div className={styles.tabContentContainer}>
                <div className={styles.visaoGeralHeader}>
                    <h2>Visão Geral da Concessionária</h2>
                    <p>Carregando dados...</p>
                </div>
            </div>
        );
    }

    if (!metrics) {
        return (
            <div className={styles.tabContentContainer}>
                <div className={styles.visaoGeralHeader}>
                    <h2>Visão Geral da Concessionária</h2>
                    <p>Não foi possível carregar os dados.</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.tabContentContainer}>
            <div className={styles.visaoGeralHeader}>
                <h2>Visão Geral da Concessionária</h2>
                <p>Acompanhe o desempenho e estatísticas da sua concessionária.</p>
            </div>

            <StockOverview metrics={metrics} />
        </div>
    );
}

function PerfilTab({ profile, loading }: { profile: Concessionaria | null, loading: boolean }) {
    if (loading) {
        return (
            <div className={styles.tabContentContainer}>
                <div className={styles.perfilHeader}>
                    <h2>Meu Perfil</h2>
                    <p>Carregando informações...</p>
                </div>
            </div>
        );
    }

    if (!profile) {
        return (
            <div className={styles.tabContentContainer}>
                <div className={styles.perfilHeader}>
                    <h2>Meu Perfil</h2>
                    <p>Não foi possível carregar as informações do perfil.</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.tabContentContainer}>
            <div className={styles.perfilHeader}>
                <h2>Meu Perfil</h2>
                <p>Informações e configurações da sua concessionária.</p>
            </div>

            <div className={styles.perfilContent}>
                <div className={styles.perfilCard}>
                    <div className={styles.perfilCardHeader}>
                        <div className={styles.perfilAvatar}>🏭</div>
                        <div className={styles.perfilInfo}>
                            <h3>{profile.nome}</h3>
                            <p>{profile.cidade}, {profile.uf}</p>
                        </div>
                    </div>

                    <div className={styles.perfilDetails}>
                        <div className={styles.perfilRow}>
                            <span>Razão Social:</span>
                            <span>{profile.razaoSocial}</span>
                        </div>
                        <div className={styles.perfilRow}>
                            <span>CNPJ:</span>
                            <span>{profile.cnpj}</span>
                        </div>
                        <div className={styles.perfilRow}>
                            <span>Telefone:</span>
                            <span>{profile.telefone}</span>
                        </div>
                        <div className={styles.perfilRow}>
                            <span>Email:</span>
                            <span>{profile.email}</span>
                        </div>
                        <div className={styles.perfilRow}>
                            <span>Endereço:</span>
                            <span>{profile.endereco}, {profile.numero} {profile.complemento ? `- ${profile.complemento}` : ''} - {profile.bairro}</span>
                        </div>
                        <div className={styles.perfilRow}>
                            <span>Responsável:</span>
                            <span>{profile.nomeResponsavel}</span>
                        </div>
                    </div>
                </div>

                <div className={styles.perfilActions}>
                    <button className={styles.editButton}>Editar Perfil</button>
                    <button className={styles.configButton}>Configurações</button>
                </div>
            </div>
        </div>
    );
}