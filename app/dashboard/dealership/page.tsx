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

type TabType = 'visao-geral' | 'veiculos' | 'perfil';

export default function DealershipDashboard() {
    const [activeTab, setActiveTab] = useState<TabType>('visao-geral');
    const [margem, setMargem] = useState<number>(0);
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

    const tabs = [
        { id: 'visao-geral', label: 'Visão Geral', icon: '📊' },
        { id: 'veiculos', label: 'Veículos', icon: '🚗' },
        { id: 'perfil', label: 'Meu Perfil', icon: '🏢' }
    ];

    const renderTabContent = () => {
        switch (activeTab) {
            case 'visao-geral':
                return <VisaoGeralTab />;
            case 'veiculos':
                return <VehicleConsultation />;
            case 'perfil':
                return <PerfilTab />;
            default:
                return <VisaoGeralTab />;
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

// Dados mock para estatísticas da concessionária
interface ConcessionariaStats {
    veiculosCadastrados: number;
    veiculosVendidos: number;
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

const mockStats: ConcessionariaStats = {
    veiculosCadastrados: 156,
    veiculosVendidos: 34,
    propostas: {
        total: 67,
        aprovadas: 28,
        pendentes: 23,
        rejeitadas: 16
    },
    faturamento: {
        mensal: 2850000.00,
        total: 15420000.00
    },
    clientes: {
        total: 342,
        novos: 18
    }
};

const vendasRecentes = [
    {
        id: 1,
        cliente: 'João Silva',
        veiculo: 'Toyota Corolla 2024',
        valor: 154920.00,
        data: '18/11/2024',
        vendedor: 'Carlos Santos'
    },
    {
        id: 2,
        cliente: 'Maria Costa',
        veiculo: 'Honda Civic 2024',
        valor: 142850.00,
        data: '17/11/2024',
        vendedor: 'Ana Paula'
    },
    {
        id: 3,
        cliente: 'Pedro Lima',
        veiculo: 'Honda CR-V 2024',
        valor: 178420.00,
        data: '16/11/2024',
        vendedor: 'Roberto Silva'
    }
];

function VisaoGeralTab() {
    return (
        <div className={styles.tabContentContainer}>
            <div className={styles.visaoGeralHeader}>
                <h2>Visão Geral da Concessionária</h2>
                <p>Acompanhe o desempenho e estatísticas da sua concessionária.</p>
            </div>

            <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>🚗</div>
                    <div className={styles.statContent}>
                        <h3>Veículos Cadastrados</h3>
                        <div className={styles.statNumber}>{mockStats.veiculosCadastrados}</div>
                        <div className={styles.statChange}>+12 este mês</div>
                    </div>
                </div>

                <div className={styles.statCard}>
                    <div className={styles.statIcon}>✅</div>
                    <div className={styles.statContent}>
                        <h3>Veículos Vendidos</h3>
                        <div className={styles.statNumber}>{mockStats.veiculosVendidos}</div>
                        <div className={styles.statChange}>+18% este mês</div>
                    </div>
                </div>

                <div className={styles.statCard}>
                    <div className={styles.statIcon}>📋</div>
                    <div className={styles.statContent}>
                        <h3>Propostas Recebidas</h3>
                        <div className={styles.statNumber}>{mockStats.propostas.total}</div>
                        <div className={styles.statChange}>+25% este mês</div>
                    </div>
                </div>

                <div className={styles.statCard}>
                    <div className={styles.statIcon}>💰</div>
                    <div className={styles.statContent}>
                        <h3>Faturamento Mensal</h3>
                        <div className={styles.statNumber}>R$ {(mockStats.faturamento.mensal / 1000000).toFixed(1)}M</div>
                        <div className={styles.statChange}>+15% este mês</div>
                    </div>
                </div>
            </div>

            <div className={styles.detailsSection}>
                <div className={styles.proposalsDetail}>
                    <h3>Detalhamento de Propostas</h3>
                    <div className={styles.proposalStats}>
                        <div className={styles.proposalStat}>
                            <span className={styles.proposalLabel}>Aprovadas:</span>
                            <span className={styles.proposalValue} style={{ color: '#16a34a' }}>{mockStats.propostas.aprovadas}</span>
                        </div>
                        <div className={styles.proposalStat}>
                            <span className={styles.proposalLabel}>Pendentes:</span>
                            <span className={styles.proposalValue} style={{ color: '#f59e0b' }}>{mockStats.propostas.pendentes}</span>
                        </div>
                        <div className={styles.proposalStat}>
                            <span className={styles.proposalLabel}>Rejeitadas:</span>
                            <span className={styles.proposalValue} style={{ color: '#dc2626' }}>{mockStats.propostas.rejeitadas}</span>
                        </div>
                    </div>
                </div>

                <div className={styles.salesDetail}>
                    <h3>Vendas Recentes</h3>
                    <div className={styles.salesList}>
                        {vendasRecentes.map((venda) => (
                            <div key={venda.id} className={styles.saleItem}>
                                <div className={styles.saleInfo}>
                                    <div className={styles.saleClient}>{venda.cliente}</div>
                                    <div className={styles.saleVehicle}>{venda.veiculo}</div>
                                </div>
                                <div className={styles.saleDetails}>
                                    <div className={styles.saleValue}>R$ {venda.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                                    <div className={styles.saleDate}>{venda.data}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className={styles.summarySection}>
                <div className={styles.summaryCard}>
                    <h3>Resumo Geral</h3>
                    <div className={styles.summaryGrid}>
                        <div className={styles.summaryItem}>
                            <span>Total de Clientes:</span>
                            <strong>{mockStats.clientes.total}</strong>
                        </div>
                        <div className={styles.summaryItem}>
                            <span>Novos Clientes:</span>
                            <strong>{mockStats.clientes.novos}</strong>
                        </div>
                        <div className={styles.summaryItem}>
                            <span>Faturamento Total:</span>
                            <strong>R$ {(mockStats.faturamento.total / 1000000).toFixed(1)}M</strong>
                        </div>
                        <div className={styles.summaryItem}>
                            <span>Taxa de Conversão:</span>
                            <strong>{Math.round((mockStats.propostas.aprovadas / mockStats.propostas.total) * 100)}%</strong>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function PerfilTab() {
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
                            <h3>Concessionária Premium Motors</h3>
                            <p>Desde 2015 • São Paulo, SP</p>
                        </div>
                    </div>

                    <div className={styles.perfilDetails}>
                        <div className={styles.perfilRow}>
                            <span>CNPJ:</span>
                            <span>12.345.678/0001-90</span>
                        </div>
                        <div className={styles.perfilRow}>
                            <span>Telefone:</span>
                            <span>(11) 3456-7890</span>
                        </div>
                        <div className={styles.perfilRow}>
                            <span>Email:</span>
                            <span>contato@premiummotors.com.br</span>
                        </div>
                        <div className={styles.perfilRow}>
                            <span>Endereço:</span>
                            <span>Rua das Flores, 123 - São Paulo, SP</span>
                        </div>
                        <div className={styles.perfilRow}>
                            <span>Responsável:</span>
                            <span>João Silva Santos</span>
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