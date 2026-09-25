'use client';

import { useState, useEffect } from 'react';
import { getSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Badge } from '../../../components/Badge';
import { SummaryCard } from '../../../components/SummaryCard';
import { VehicleConsultation } from '../../../components/operator/VehicleConsultation';
import { ConfigContext, useConfig } from '../../../lib/contexts/ConfigContext';
import KanbanBoard from '../../../components/crm/KanbanBoard';
import { DashboardShell, shellStyles } from '../../../components/dashboard/DashboardShell';
import { Building2, CarFront, ContactRound, Images, LayoutDashboard, Tag } from 'lucide-react';
import styles from './dealership.module.css';
import { MeusAnuncios } from '../../../components/dealership/MeusAnuncios';
import { DealerInventory } from '../../../components/dealership/DealerInventory';
import { StockReminderModal } from '../../../components/dealership/StockReminderModal';

import { Concessionaria } from '../../../lib/services/concessionariaService';

type TabType = 'visao-geral' | 'veiculos' | 'precos' | 'perfil' | 'crm' | 'anuncios';

interface ChartItem {
    label: string;
    value: number;
}

interface DealershipMetrics {
    veiculosCadastrados: number;
    veiculosVendidos: number;
    daysSinceUpdate: number;
    statusBreakdown?: {
        verde: number;
        amarelo: number;
        vermelho: number;
    };
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
    // Concessionária não tem acesso à funcionalidade de margem
    const [metrics, setMetrics] = useState<DealershipMetrics | null>(null);
    const [loadingMetrics, setLoadingMetrics] = useState(false);
    const [profile, setProfile] = useState<Concessionaria | null>(null);
    const [loadingProfile, setLoadingProfile] = useState(false);
    const [userInfo, setUserInfo] = useState<{ name?: string | null; email?: string | null }>({});
    const router = useRouter();

    // Nome e e-mail do usuário logado para o menu lateral
    useEffect(() => {
        getSession()
            .then(session => {
                if (session?.user) setUserInfo({ name: session.user.name, email: session.user.email });
            })
            .catch(() => { });
    }, []);

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
        { id: 'visao-geral', label: 'Visão geral', icon: <LayoutDashboard size={20} aria-hidden="true" /> },
        { id: 'veiculos', label: 'Meus veículos', icon: <CarFront size={20} aria-hidden="true" /> },
        { id: 'precos', label: 'Estoque e preços', icon: <Tag size={20} aria-hidden="true" /> },
        { id: 'perfil', label: 'Meu perfil', icon: <Building2 size={20} aria-hidden="true" /> },
        { id: 'crm', label: 'CRM', icon: <ContactRound size={20} aria-hidden="true" /> },
        { id: 'anuncios', label: 'Meus anúncios', icon: <Images size={20} aria-hidden="true" /> }
    ];

    const renderTabContent = () => {
        switch (activeTab) {
            case 'visao-geral':
                return <VisaoGeralTab metrics={metrics} loading={loadingMetrics} />;
            case 'veiculos':
                return <VehicleConsultation role="dealership" />;
            case 'precos':
                return <DealerInventory />;
            case 'crm':
                return <KanbanBoard />;
            case 'perfil':
                return <PerfilTab profile={profile} loading={loadingProfile} onCadastrarVeiculo={() => setActiveTab('veiculos')} />;
            case 'anuncios':
                return <MeusAnuncios />;
            default:
                return <VisaoGeralTab metrics={metrics} loading={loadingMetrics} />;
        }
    };

    return (
        <ConfigContext.Provider value={{ margem: 0, fixedMargin: 0, marginMode: 'percent', setMargem: () => { }, setMarginConfig: () => { } }}>
            <DashboardShell
                sectionLabel="Concessionária"
                tabs={tabs}
                activeId={activeTab}
                onSelect={id => setActiveTab(id as TabType)}
                primaryIds={['visao-geral', 'veiculos', 'precos', 'crm']}
                user={{ name: userInfo.name || 'Concessionária', email: userInfo.email, role: 'Concessionária' }}
            >
                <StockReminderModal onUpdateStock={() => setActiveTab('precos')} />
                {/* A consulta de veículos ocupa a tela toda, como no admin. */}
                {activeTab === 'veiculos' || activeTab === 'crm' ? renderTabContent() : <div className={shellStyles.contentArea}>{renderTabContent()}</div>}
            </DashboardShell>
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
        statusMessage = 'Atenção: atualize seu estoque';
        statusClass = styles.msgYellow;
    }
    if (daysSinceUpdate > 3) {
        statusColor = 'red';
        statusMessage = 'Crítico: estoque desatualizado';
        statusClass = styles.msgRed;
    }

    return (
        <div className={styles.chartContainer}>
            <div className={styles.chartSection}>
                <div className={styles.chartHeader}>
                    <div className={styles.chartTitle}>Evolução do estoque</div>
                </div>
                <div className={styles.barChart}>
                    {chartData.length === 0 ? (
                        <div style={{ width: '100%', textAlign: 'center', color: 'var(--color-text-muted)' }}>Sem dados de histórico</div>
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
                <div className={styles.chartTitle} style={{ marginBottom: '1.5rem' }}>Status de atualização</div>
                <div className={styles.trafficLightContainer}>
                    <div className={`${styles.trafficLight} ${styles[statusColor]}`}></div>
                    <div className={styles.updateInfo}>
                        <span className={styles.updateLabel}>Última atualização</span>
                        <span className={styles.updateValue}>{daysSinceUpdate === 0 ? 'Hoje' : `${daysSinceUpdate} dia(s) atrás`}</span>
                        <span className={`${styles.updateMessage} ${statusClass}`}>{statusMessage}</span>
                    </div>

                </div>
                {metrics.statusBreakdown && (
                    <div className={styles.statusBreakdown}>
                        <div className={`${styles.statusBreakdownItem} ${styles.breakdownGreen}`}>
                            <span className={styles.statusBreakdownCount}>{metrics.statusBreakdown.verde}</span>
                            <span className={styles.statusBreakdownLabel}>Em dia</span>
                        </div>
                        <div className={`${styles.statusBreakdownItem} ${styles.breakdownYellow}`}>
                            <span className={styles.statusBreakdownCount}>{metrics.statusBreakdown.amarelo}</span>
                            <span className={styles.statusBreakdownLabel}>Atenção</span>
                        </div>
                        <div className={`${styles.statusBreakdownItem} ${styles.breakdownRed}`}>
                            <span className={styles.statusBreakdownCount}>{metrics.statusBreakdown.vermelho}</span>
                            <span className={styles.statusBreakdownLabel}>Desatualizados</span>
                        </div>
                    </div>
                )}
                <div className={styles.statCard}>
                    <div className={styles.statIcon}><CarFront size={22} aria-hidden="true" /></div>
                    <div className={styles.statContent}>
                        <h3>Veículos cadastrados</h3>
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
                    <h2 className={shellStyles.pageTitle}>Visão geral da concessionária</h2>
                    <p className={shellStyles.pageSubtitle}>Carregando dados...</p>
                </div>
            </div>
        );
    }

    if (!metrics) {
        return (
            <div className={styles.tabContentContainer}>
                <div className={styles.visaoGeralHeader}>
                    <h2 className={shellStyles.pageTitle}>Visão geral da concessionária</h2>
                    <p className={shellStyles.pageSubtitle}>Não foi possível carregar os dados.</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.tabContentContainer}>
            <div className={styles.visaoGeralHeader}>
                <h2 className={shellStyles.pageTitle}>Visão geral da concessionária</h2>
                <p className={shellStyles.pageSubtitle}>Acompanhe o desempenho e estatísticas da sua concessionária.</p>
            </div>

            <StockOverview metrics={metrics} />
        </div>
    );
}

function PerfilTab({ profile, loading, onCadastrarVeiculo }: { profile: Concessionaria | null, loading: boolean, onCadastrarVeiculo?: () => void }) {
    if (loading) {
        return (
            <div className={styles.tabContentContainer}>
                <div className={styles.perfilHeader}>
                    <h2 className={shellStyles.pageTitle}>Meu perfil</h2>
                    <p className={shellStyles.pageSubtitle}>Carregando informações...</p>
                </div>
            </div>
        );
    }

    if (!profile) {
        return (
            <div className={styles.tabContentContainer}>
                <div className={styles.perfilHeader}>
                    <h2 className={shellStyles.pageTitle}>Meu perfil</h2>
                    <p className={shellStyles.pageSubtitle}>Não foi possível carregar as informações do perfil.</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.tabContentContainer}>
            <div className={styles.perfilHeader}>
                <h2 className={shellStyles.pageTitle}>Meu perfil</h2>
                <p className={shellStyles.pageSubtitle}>Informações e configurações da sua concessionária.</p>
            </div>

            <div className={styles.perfilContent}>
                <div className={styles.perfilCard}>
                    <div className={styles.perfilCardHeader}>
                        <div className={styles.perfilAvatar}><Building2 size={28} aria-hidden="true" /></div>
                        <div className={styles.perfilInfo}>
                            <h3>{profile.nome}</h3>
                            <p>{profile.cidade}, {profile.uf}</p>
                        </div>
                    </div>

                    <div className={styles.perfilDetails}>
                        <div className={styles.perfilRow}>
                            <span>Razão social:</span>
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
                            <span>E-mail:</span>
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
                    <button className={styles.primaryButton} onClick={onCadastrarVeiculo}>Cadastrar novo veículo</button>
                    <button className={styles.editButton}>Editar perfil</button>
                    <button className={styles.configButton}>Configurações</button>
                </div>
            </div>
        </div>
    );
}
