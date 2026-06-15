'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { signOut, getSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Badge } from '../../../components/Badge';
import { SummaryCard } from '../../../components/SummaryCard';
import { VehicleConsultation } from '../../../components/operator/VehicleConsultation';
import { MarcasTable } from '../../../components/operator/MarcasTable';
import { ModelosTable } from '../../../components/operator/ModelosTable';
import CoresTable from '../../../components/operator/CoresTable';
import { TransportadorasManagement } from '../../../components/operator/TransportadorasManagement';
import { MaskedInput } from '../../../components/operator/MaskedInput';
import { ConfigContext, useConfig } from '../../../lib/contexts/ConfigContext';
import { ConcessionariaService } from '../../../lib/services/concessionariaService';
import UserMenu from '../../../components/UserMenu';
import { FarolVencimentos } from './FarolVencimentos';
import styles from './operator.module.css';
import transportStyles from '../../../components/operator/VehicleConsultation.module.css';

type TabType = 'veiculos' | 'clientes' | 'prospects' | 'transportadoras' | 'tabelas' | 'configuracoes';

export default function VendedorDashboard() {
    const [activeTab, setActiveTab] = useState<TabType | 'visao-geral'>('visao-geral');
    const [margem, setMargem] = useState<number>(0);
    const [fixedMargin, setFixedMargin] = useState<number>(0);
    const [marginMode, setMarginMode] = useState<'percent' | 'fixed'>('percent');
    const [userInfo, setUserInfo] = useState<{ name?: string | null; email?: string | null; canViewLocation?: boolean; profile?: string }>({});
    const router = useRouter();
    const userName = userInfo.name ?? 'Vendedor';
    const userEmail = userInfo.email ?? null;

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

    useEffect(() => {
        getSession()
            .then((session) => {
                if (session?.user) {
                    setUserInfo({
                        name: session.user.name ?? 'Vendedor',
                        email: session.user.email ?? null,
                        canViewLocation: session.user.canViewLocation,
                        profile: session.user.profile
                    });
                }
            })
            .catch((error) => {
                console.error('Erro ao carregar sessão do usuário:', error);
            });
    }, []);

    // Função para atualizar margem e sincronizar com API
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

    const userProfile = (userInfo.profile as string) || 'vendedor';
    const effectiveRole: 'admin' | 'administrador' | 'operator' | 'operador' | 'client' | 'vendedor' | 'dealership' | 'gerente' =
        userProfile as any;

    const tabs = [
        { id: 'visao-geral', label: 'Visão Geral', icon: '📊' },
        { id: 'veiculos', label: 'Veículos', icon: '🚗' },
        { id: 'clientes', label: 'Concessionárias', icon: '🏢' },
        { id: 'prospects', label: 'Prospects / Leads', icon: '🎯' },
    ];

    const renderTabContent = () => {
        switch (activeTab) {
            case 'visao-geral':
                return <VisaoGeralERelatoriosTab />;
            case 'veiculos':
                return <VehicleConsultation role={effectiveRole} />;
            case 'clientes':
                return <ClientesTab />;
            case 'prospects':
                return <ProspectsTab />;
            default:
                return <VehicleConsultation role={effectiveRole} />;
        }
    };

    return (
        <ConfigContext.Provider value={{
            margem,
            fixedMargin,
            marginMode,
            setMargem: (v: number) => updateMargem(v, marginMode, fixedMargin),
            setMarginConfig: ({ margem: v, marginMode: m, fixedMargin: f }) => updateMargem(v, m, f)
        }}>
            <div className={styles.container}>
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <Image
                            src="/images/logo.png"
                            alt="Logo"
                            width={240}
                            height={80}
                            className={styles.logo}
                            priority
                        />
                    </div>
                    <div className={styles.headerRight}>
                        <UserMenu
                            name={userName}
                            email={userEmail}
                            role="Vendedor Corporativo"
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


function VisaoGeralERelatoriosTab() {
    const [metrics, setMetrics] = useState({
        prospectsAtivos: 0,
        prospectsVencendo: 0,
        prospectosPerdidos: 0,
    });
    const [totalVeiculos, setTotalVeiculos] = useState<number | null>(null);

    useEffect(() => {
        fetch('/api/vehicles?page=1&limit=1&accessProfile=vendedor')
            .then(res => res.json())
            .then((result: any) => {
                if (result && typeof result.total === 'number') {
                    setTotalVeiculos(result.total);
                }
            })
            .catch(console.error);

        fetch('/api/vendedor/clientes')
            .then(res => res.json())
            .then((clientes: any[]) => {
                if (!Array.isArray(clientes)) return;
                const agora = new Date();
                const emBreve = new Date(agora);
                emBreve.setDate(emBreve.getDate() + 5);

                const ativos = clientes.filter(c =>
                    c.statusPlano === 'active' ||
                    (c.vencimento && new Date(c.vencimento) >= agora)
                ).length;

                const vencendo = clientes.filter(c => {
                    if (!c.vencimento) return false;
                    const venc = new Date(c.vencimento);
                    return venc >= agora && venc <= emBreve;
                }).length;

                const perdidos = clientes.filter(c =>
                    c.statusPlano === 'inactive' || c.statusPlano === 'cancelled' ||
                    (!c.statusPlano && !c.plano)
                ).length;

                setMetrics({
                    prospectsAtivos: clientes.length,
                    prospectsVencendo: vencendo,
                    prospectosPerdidos: perdidos,
                });
            })
            .catch(console.error);
    }, []);

    return (
        <div className={styles.visaoGeralContainer} style={{ gridTemplateColumns: '1fr', maxWidth: '100%', padding: '2rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <div className={styles.statsGrid}>
                    <div className={styles.statCard}>
                        <div className={styles.statIcon}>🏢</div>
                        <div className={styles.statContent}>
                            <h3>Total de Prospects/Lojas</h3>
                            <div className={styles.statNumber}>{metrics.prospectsAtivos}</div>
                            <div className={styles.statChange}>Em sua carteira</div>
                        </div>
                    </div>
                    <div className={styles.statCard}>
                        <div className={styles.statIcon} style={{ color: '#f59e0b' }}>⚠️</div>
                        <div className={styles.statContent}>
                            <h3>Prospects Vencendo</h3>
                            <div className={styles.statNumber} style={{ color: '#f59e0b' }}>{metrics.prospectsVencendo}</div>
                            <div className={styles.statChange}>Cobrar nos Próximos 5 dias</div>
                        </div>
                    </div>
                    <div className={styles.statCard}>
                        <div className={styles.statIcon} style={{ color: '#ef4444' }}>🚨</div>
                        <div className={styles.statContent}>
                            <h3>Perdidos / Bloqueados</h3>
                            <div className={styles.statNumber} style={{ color: '#ef4444' }}>{metrics.prospectosPerdidos}</div>
                            <div className={styles.statChange}>Sem Assinatura Ativa</div>
                        </div>
                    </div>
                    <div className={styles.statCard}>
                        <div className={styles.statIcon}>🚗</div>
                        <div className={styles.statContent}>
                            <h3>Total de Veículos</h3>
                            <div className={styles.statNumber}>{totalVeiculos !== null ? totalVeiculos.toLocaleString('pt-BR') : '...'}</div>
                            <div className={styles.statChange}>No banco de dados</div>
                        </div>
                    </div>
                </div>

                <div className={styles.todaySection}>
                    <FarolVencimentos />
                </div>
            </div>
        </div>
    );
}

function ProspectsTab() {
    const [clientes, setClientes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'todos' | 'oportunidades'>('oportunidades');

    const fetchClientes = () => {
        setLoading(true);
        const url = filter === 'oportunidades' ? '/api/vendedor/clientes?tipo=oportunidades' : '/api/vendedor/clientes';
        fetch(url)
            .then(res => res.json())
            .then((data: any[]) => {
                if (Array.isArray(data)) setClientes(data);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    };

    useEffect(() => {
        fetchClientes();
    }, [filter]);

    const handlePuxarLead = async (clienteId: string) => {
        if (!confirm('Tem certeza que deseja puxar este lead para sua carteira?')) return;
        
        try {
            const res = await fetch('/api/vendedor/clientes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clienteId })
            });
            if (res.ok) {
                // Ao invés de remover, atualizamos o vendedorId para que ele apareça como "Meu" e não mais como "Livre"
                setClientes(prev => prev.map(c => c.id === clienteId ? { ...c, vendedorId: 'meu' } : c));
                alert('Lead adicionado à sua carteira com sucesso!');
            } else {
                const err = await res.json();
                alert(err.error || 'Erro ao puxar lead');
            }
        } catch (error) {
            console.error('Erro ao puxar lead', error);
            alert('Erro ao puxar lead');
        }
    };

    const agora = new Date();
    const filteredClientes = clientes.filter(c => {
        if (filter === 'todos') return true;
        
        // Oportunidades: Sem plano, plano inativo/expirado/past_due, OU sem vendedor associado
        const isNotActive = c.statusPlano !== 'active';
        const isExpired = c.vencimento && new Date(c.vencimento) < agora;
        const isLivre = !c.vendedorId;
        
        return isNotActive || isExpired || isLivre;
    });

    const openWhatsApp = (phone: string, nome: string) => {
        const numbers = phone?.replace(/\D/g, '') || '';
        if (!numbers) return;
        const msg = encodeURIComponent(`Olá ${nome}, tudo bem? Sou da equipe CNV...`);
        window.open(`https://wa.me/55${numbers}?text=${msg}`, '_blank');
    };

    return (
        <div className={styles.visaoGeralContainer} style={{ gridTemplateColumns: '1fr', maxWidth: '100%', padding: '2rem' }}>
            <div className={transportStyles.header} style={{ marginBottom: '2rem' }}>
                <h2>Prospects / Leads</h2>
                <div className={transportStyles.headerActions}>
                    <select
                        className={styles.planSelect}
                        value={filter}
                        onChange={(e) => setFilter(e.target.value as any)}
                        style={{ padding: '0.5rem', borderRadius: '8px' }}
                    >
                        <option value="oportunidades">Mostrar Oportunidades (Sem plano / Expirados)</option>
                        <option value="todos">Mostrar Toda minha carteira</option>
                    </select>
                </div>
            </div>

            {loading ? (
                <div>Carregando...</div>
            ) : (
                <div className={transportStyles.tableContainer}>
                    <table className={transportStyles.table}>
                        <thead>
                            <tr>
                                <th className={transportStyles.tableHeader}>NOME / EMAIL</th>
                                <th className={transportStyles.tableHeader}>TELEFONE</th>
                                <th className={transportStyles.tableHeader}>DATA CADASTRO</th>
                                <th className={transportStyles.tableHeader}>STATUS PLANO</th>
                                <th className={transportStyles.tableHeader}>VENCIMENTO</th>
                                <th className={transportStyles.tableHeader}>AÇÕES</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredClientes.length === 0 ? (
                                <tr className={transportStyles.tableRow}>
                                    <td className={styles.emptyStateCell} colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>Nenhum lead encontrado.</td>
                                </tr>
                            ) : (
                                filteredClientes.map(c => {
                                    const isInactive = c.statusPlano === 'inactive' || c.statusPlano === 'cancelled' || !c.plano;
                                    const isExpired = c.vencimento && new Date(c.vencimento) < agora;
                                    const badgeColor = (isInactive || isExpired) ? '#ef4444' : '#10b981';
                                    const badgeText = !c.plano ? 'Sem Plano' : (isExpired ? 'Expirado' : (c.statusPlano === 'active' ? 'Ativo' : 'Inativo'));

                                    return (
                                        <tr key={c.id} className={transportStyles.tableRow}>
                                            <td className={`${transportStyles.tableCell} ${styles.tableCellMulti}`}>
                                                <strong>{c.nome}</strong>
                                                <div className={styles.tableSubtext}>{c.email}</div>
                                            </td>
                                            <td className={transportStyles.tableCell}>{c.telefone || '-'}</td>
                                            <td className={transportStyles.tableCell}>
                                                {c.dataCadastro ? new Date(c.dataCadastro).toLocaleDateString('pt-BR') : '-'}
                                            </td>
                                            <td className={transportStyles.tableCell}>
                                                <span className={transportStyles.statusBadge} style={{ backgroundColor: badgeColor + '20', color: badgeColor }}>
                                                    {badgeText}
                                                </span>
                                            </td>
                                            <td className={transportStyles.tableCell}>
                                                {c.vencimento ? new Date(c.vencimento).toLocaleDateString('pt-BR') : '-'}
                                            </td>
                                            <td className={transportStyles.tableCell}>
                                                <div className={transportStyles.actionButtons}>
                                                    {!c.vendedorId ? (
                                                        <button
                                                            className={styles.puxarLeadBtn}
                                                            onClick={() => handlePuxarLead(c.id)}
                                                            title="Atender Lead"
                                                        >
                                                            Atender Lead
                                                        </button>
                                                    ) : (
                                                        <button
                                                            className={transportStyles.editButton}
                                                            onClick={() => openWhatsApp(c.telefone, c.nome)}
                                                            title="Chamar no WhatsApp"
                                                            style={{ backgroundColor: '#25D366', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                                        >
                                                            💬 WhatsApp
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}


interface PropostaData {
    id: string;
    clienteNome: string;
    clienteEmail: string;
    clienteTelefone: string;
    veiculo: {
        marca: string;
        modelo: string;
        versao: string;
        cor: string;
        anoModelo: string;
        preco: number;
    };
    valorProposta: number;
    formaPagamento: string;
    statusProposta: 'PENDENTE' | 'APROVADA' | 'REJEITADA' | 'EM_ANALISE' | 'NEGOCIACAO';
    dataPropostas: string;
    vendedor: string;
    observacoes: string;
    desconto: number;
    entrada: number;
    financiamento: {
        valor: number;
        parcelas: number;
        valorParcela: number;
    };
}

const mockPropostas: PropostaData[] = [
    {
        id: "P001",
        clienteNome: "João Silva Santos",
        clienteEmail: "joao.silva@email.com",
        clienteTelefone: "(11) 99999-1234",
        veiculo: {
            marca: "TOYOTA",
            modelo: "COROLLA ALTIS 2.0 16V FLEX AUT.",
            versao: "PREMIUM",
            cor: "BRANCO POLAR",
            anoModelo: "24/24",
            preco: 154920.00
        },
        valorProposta: 148000.00,
        formaPagamento: "FINANCIAMENTO",
        statusProposta: "EM_ANALISE",
        dataPropostas: "15/11/2024",
        vendedor: "Carlos Roberto",
        observacoes: "Cliente interessado, aguardando aprovação do financiamento",
        desconto: 6920.00,
        entrada: 30000.00,
        financiamento: {
            valor: 118000.00,
            parcelas: 60,
            valorParcela: 2450.00
        }
    },
    {
        id: "P002",
        clienteNome: "Maria Oliveira Costa",
        clienteEmail: "maria.oliveira@email.com",
        clienteTelefone: "(11) 98888-5678",
        veiculo: {
            marca: "HONDA",
            modelo: "CIVIC EXL 2.0 16V FLEX AUT.",
            versao: "EXL",
            cor: "PRATA LUNAR",
            anoModelo: "24/24",
            preco: 142850.00
        },
        valorProposta: 142850.00,
        formaPagamento: "À VISTA",
        statusProposta: "APROVADA",
        dataPropostas: "14/11/2024",
        vendedor: "Ana Paula",
        observacoes: "Pagamento à vista confirmado, aguardando documentação",
        desconto: 0,
        entrada: 142850.00,
        financiamento: {
            valor: 0,
            parcelas: 0,
            valorParcela: 0
        }
    },
    {
        id: "P003",
        clienteNome: "Pedro Henrique Lima",
        clienteEmail: "pedro.lima@email.com",
        clienteTelefone: "(21) 97777-9012",
        veiculo: {
            marca: "HONDA",
            modelo: "CIVIC TYPE R 2.0 TURBO",
            versao: "SPORT",
            cor: "BRANCO POLAR",
            anoModelo: "24/24",
            preco: 320150.00
        },
        valorProposta: 300000.00,
        formaPagamento: "FINANCIAMENTO",
        statusProposta: "NEGOCIACAO",
        dataPropostas: "13/11/2024",
        vendedor: "Roberto Silva",
        observacoes: "Cliente solicitou desconto adicional, em negociação",
        desconto: 20150.00,
        entrada: 80000.00,
        financiamento: {
            valor: 220000.00,
            parcelas: 48,
            valorParcela: 5200.00
        }
    },
    {
        id: "P004",
        clienteNome: "Ana Carolina Ferreira",
        clienteEmail: "ana.ferreira@email.com",
        clienteTelefone: "(61) 96666-3456",
        veiculo: {
            marca: "TOYOTA",
            modelo: "COROLLA CROSS 1.8 FLEX AUT.",
            versao: "XRE",
            cor: "VERMELHO CEREJA",
            anoModelo: "24/24",
            preco: 165890.00
        },
        valorProposta: 160000.00,
        formaPagamento: "FINANCIAMENTO",
        statusProposta: "PENDENTE",
        dataPropostas: "12/11/2024",
        vendedor: "Lúcia Santos",
        observacoes: "Aguardando documentação do cliente para análise",
        desconto: 5890.00,
        entrada: 40000.00,
        financiamento: {
            valor: 120000.00,
            parcelas: 60,
            valorParcela: 2380.00
        }
    },
    {
        id: "P005",
        clienteNome: "Rafael Mendoza",
        clienteEmail: "rafael.mendoza@email.com",
        clienteTelefone: "(31) 95555-7890",
        veiculo: {
            marca: "HONDA",
            modelo: "ACCORD HYBRID 2.0",
            versao: "TOURING",
            cor: "PRETO CRISTAL",
            anoModelo: "24/24",
            preco: 285450.00
        },
        valorProposta: 270000.00,
        formaPagamento: "FINANCIAMENTO",
        statusProposta: "REJEITADA",
        dataPropostas: "10/11/2024",
        vendedor: "Marcos Pereira",
        observacoes: "Proposta rejeitada pela financeira - renda insuficiente",
        desconto: 15450.00,
        entrada: 50000.00,
        financiamento: {
            valor: 220000.00,
            parcelas: 72,
            valorParcela: 4100.00
        }
    }
];

function PropostasTab() {
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('TODAS');
    const [propostas, setPropostas] = useState<PropostaData[]>(mockPropostas);
    const [filteredPropostas, setFilteredPropostas] = useState<PropostaData[]>(mockPropostas);

    // Filtrar propostas
    useEffect(() => {
        let filtered = propostas;

        if (statusFilter !== 'TODAS') {
            filtered = filtered.filter(p => p.statusProposta === statusFilter);
        }

        if (searchTerm.length >= 2) {
            filtered = filtered.filter(proposta =>
                proposta.clienteNome.toLowerCase().includes(searchTerm.toLowerCase()) ||
                proposta.veiculo.modelo.toLowerCase().includes(searchTerm.toLowerCase()) ||
                proposta.vendedor.toLowerCase().includes(searchTerm.toLowerCase())
            );
        } else if (searchTerm.length === 0) {
            // Mostra todos quando não há busca
        } else {
            // Menos de 2 caracteres, mantém filtro de status apenas
        }

        setFilteredPropostas(filtered);
    }, [searchTerm, statusFilter, propostas]); const getStatusColor = (status: string) => {
        switch (status) {
            case 'APROVADA': return { bg: '#dcfce7', color: '#166534' };
            case 'REJEITADA': return { bg: '#fee2e2', color: '#dc2626' };
            case 'EM_ANALISE': return { bg: '#fef3c7', color: '#92400e' };
            case 'NEGOCIACAO': return { bg: '#dbeafe', color: '#2563eb' };
            case 'PENDENTE': return { bg: '#f3f4f6', color: '#4b5563' };
            default: return { bg: '#f3f4f6', color: '#4b5563' };
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'APROVADA': return 'Aprovada';
            case 'REJEITADA': return 'Rejeitada';
            case 'EM_ANALISE': return 'Em Análise';
            case 'NEGOCIACAO': return 'Negociação';
            case 'PENDENTE': return 'Pendente';
            default: return status;
        }
    };

    return (
        <div className={styles.tabContentContainer}>
            <div className={styles.proposalHeader}>
                <h2>Gestão de Propostas</h2>
                <button className={styles.newProposalBtn}>+ Nova Proposta</button>
            </div>

            <div className={styles.filtersSection}>
                <div className={styles.searchContainer}>
                    <input
                        type="text"
                        placeholder="Buscar por cliente, veículo ou vendedor..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className={styles.searchInput}
                    />
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className={styles.statusFilter}
                    >
                        <option value="TODAS">Todos os Status</option>
                        <option value="PENDENTE">Pendente</option>
                        <option value="EM_ANALISE">Em Análise</option>
                        <option value="NEGOCIACAO">Negociação</option>
                        <option value="APROVADA">Aprovada</option>
                        <option value="REJEITADA">Rejeitada</option>
                    </select>
                </div>

                <div className={styles.proposalStats}>
                    <div className={styles.statBadge}>
                        Total: {filteredPropostas.length}
                    </div>
                    <div className={styles.statBadge}>
                        Aprovadas: {filteredPropostas.filter(p => p.statusProposta === 'APROVADA').length}
                    </div>
                    <div className={styles.statBadge}>
                        Pendentes: {filteredPropostas.filter(p => p.statusProposta === 'PENDENTE').length}
                    </div>
                </div>
            </div>

            <div className={styles.proposalsGrid}>
                {filteredPropostas.map((proposta) => {
                    const statusStyle = getStatusColor(proposta.statusProposta);
                    return (
                        <div key={proposta.id} className={styles.proposalCard}>
                            <div className={styles.proposalCardHeader}>
                                <div className={styles.proposalId}>#{proposta.id}</div>
                                <div
                                    className={styles.statusBadge}
                                    style={{ backgroundColor: statusStyle.bg, color: statusStyle.color }}
                                >
                                    {getStatusLabel(proposta.statusProposta)}
                                </div>
                            </div>

                            <div className={styles.proposalCardBody}>
                                <div className={styles.clientInfo}>
                                    <h4>{proposta.clienteNome}</h4>
                                    <p>{proposta.clienteTelefone}</p>
                                    <p>{proposta.clienteEmail}</p>
                                </div>

                                <div className={styles.vehicleInfo}>
                                    <h5>{proposta.veiculo.marca} {proposta.veiculo.modelo}</h5>
                                    <p>{proposta.veiculo.versao} - {proposta.veiculo.cor}</p>
                                    <p>Ano: {proposta.veiculo.anoModelo}</p>
                                </div>

                                <div className={styles.priceInfo}>
                                    <div className={styles.priceRow}>
                                        <span>Preço Tabela:</span>
                                        <span>R$ {proposta.veiculo.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className={styles.priceRow}>
                                        <span>Valor Proposta:</span>
                                        <strong>R$ {proposta.valorProposta.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                                    </div>
                                    {proposta.desconto > 0 && (
                                        <div className={styles.priceRow}>
                                            <span>Desconto:</span>
                                            <span style={{ color: '#dc2626' }}>- R$ {proposta.desconto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                        </div>
                                    )}
                                </div>

                                <div className={styles.proposalDetails}>
                                    <p><strong>Pagamento:</strong> {proposta.formaPagamento}</p>
                                    <p><strong>Vendedor:</strong> {proposta.vendedor}</p>
                                    <p><strong>Data:</strong> {proposta.dataPropostas}</p>
                                    {proposta.observacoes && (
                                        <p><strong>Observações:</strong> {proposta.observacoes}</p>
                                    )}
                                </div>
                            </div>

                            <div className={styles.proposalCardFooter}>
                                <button className={styles.viewBtn}>Ver Detalhes</button>
                                <button className={styles.editBtn}>Editar</button>
                                {proposta.statusProposta === 'PENDENTE' && (
                                    <button className={styles.approveBtn}>Aprovar</button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// Interfaces para Concessionária
interface ClienteData {
    id: string;
    nome: string;
    email: string;
    telefone: string;
    cpf?: string;
    perfis?: string[];
    plano?: string | null;
    statusPlano?: string;
    vencimento?: string | null;
    dataCadastro?: string | null;
    // campos legados de formulário (para compatibilidade com views existentes)
    razaoSocial?: string;
    contato?: string;
    celular?: string;
    endereco?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    cidade?: string;
    cnpj?: string;
    uf?: string;
    cep?: string;
    inscricaoEstadual?: string;
    nomeResponsavel?: string;
    telefoneResponsavel?: string;
    emailResponsavel?: string;
    observacoes?: string;
    ativo?: boolean;
    criadoEm?: string | null;
    atualizadoEm?: string | null;
}

type ClienteFormData = {
    nome: string;
    email: string;
    telefone: string;
    cpf: string;
    observacoes: string;
    // mantidos para não quebrar o formulário existente
    razaoSocial: string;
    inscricaoEstadual: string;
    celular: string;
    contato: string;
    endereco: string;
    numero: string;
    complemento: string;
    bairro: string;
    cidade: string;
    cnpj: string;
    uf: string;
    cep: string;
    nomeResponsavel: string;
    telefoneResponsavel: string;
    emailResponsavel: string;
    ativo: boolean;
};


const createEmptyClienteForm = (): ClienteFormData => ({
    nome: '',
    email: '',
    telefone: '',
    cpf: '',
    observacoes: '',
    razaoSocial: '',
    inscricaoEstadual: '',
    celular: '',
    contato: '',
    endereco: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    cnpj: '',
    uf: '',
    cep: '',
    nomeResponsavel: '',
    telefoneResponsavel: '',
    emailResponsavel: '',
    ativo: true
});

function ClientesTab() {
    const [searchTerm, setSearchTerm] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [clientes, setClientes] = useState<ClienteData[]>([]);
    const [filteredClientes, setFilteredClientes] = useState<ClienteData[]>([]);
    const [editingCliente, setEditingCliente] = useState<ClienteData | null>(null);
    const [formData, setFormData] = useState<ClienteFormData>(createEmptyClienteForm());
    const [loadingClientes, setLoadingClientes] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isFetchingCep, setIsFetchingCep] = useState(false);
    const [cepError, setCepError] = useState<string | null>(null);
    const lastCepRef = useRef<string>('');

    const resetForm = () => {
        setFormData(createEmptyClienteForm());
        setCepError(null);
        setIsFetchingCep(false);
        lastCepRef.current = '';
    };

    const parseErrorMessage = useCallback(async (response: Response) => {
        try {
            const data = await response.json();
            return data?.error || response.statusText;
        } catch {
            return response.statusText;
        }
    }, []);

    const fetchClientes = useCallback(async () => {
        setLoadingClientes(true);
        setErrorMessage(null);
        try {
            const data = await ConcessionariaService.getAllConcessionarias();
            setClientes(data as ClienteData[]);
        } catch (error) {
            console.error('Erro ao carregar concessionárias:', error);
            setErrorMessage('Não foi possível carregar as concessionárias.');
        } finally {
            setLoadingClientes(false);
        }
    }, []);

    useEffect(() => {
        fetchClientes();
    }, [fetchClientes]);

    useEffect(() => {
        const normalized = searchTerm.toLowerCase();
        const searchDigits = searchTerm.replace(/\D/g, '');

        const filtered = clientes.filter((cliente) => {
            const nome = cliente.nome?.toLowerCase() ?? '';
            const razaoSocial = cliente.razaoSocial?.toLowerCase() ?? '';
            const contato = cliente.contato?.toLowerCase() ?? '';
            const cidade = cliente.cidade?.toLowerCase() ?? '';
            const bairro = cliente.bairro?.toLowerCase() ?? '';
            const responsavel = cliente.nomeResponsavel?.toLowerCase() ?? '';
            const email = cliente.email?.toLowerCase() ?? '';
            const cnpjDigits = cliente.cnpj?.replace(/\D/g, '') ?? '';
            const cepDigits = cliente.cep?.replace(/\D/g, '') ?? '';
            const telefoneResponsavel = cliente.telefoneResponsavel?.replace(/\D/g, '') ?? '';

            return (
                nome.includes(normalized) ||
                razaoSocial.includes(normalized) ||
                contato.includes(normalized) ||
                cidade.includes(normalized) ||
                bairro.includes(normalized) ||
                responsavel.includes(normalized) ||
                email.includes(normalized) ||
                (searchDigits ?
                    cnpjDigits.includes(searchDigits) ||
                    cepDigits.includes(searchDigits) ||
                    telefoneResponsavel.includes(searchDigits)
                    :
                    false)
            );
        });
        setFilteredClientes(filtered);
    }, [searchTerm, clientes]);

    const handleClearSearch = () => setSearchTerm('');

    const digitsOnly = (value?: string) => (value ?? '').replace(/\D/g, '');

    const formatDate = (value?: string | null) => {
        if (!value) return '-';
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('pt-BR');
    };

    const formatCnpjDisplay = (value?: string) => {
        const digits = digitsOnly(value);
        if (digits.length !== 14) return value || '-';
        return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
    };

    const formatCepDisplay = (value?: string) => {
        const digits = digitsOnly(value);
        if (digits.length !== 8) return value || '-';
        return `${digits.slice(0, 5)}-${digits.slice(5)}`;
    };

    const formatPhoneDisplay = (value?: string) => {
        const digits = digitsOnly(value);
        if (!digits) return '-';
        if (digits.length <= 10) {
            return `(${digits.slice(0, 2)})${digits.slice(2, 6)}-${digits.slice(6)}`;
        }
        return `(${digits.slice(0, 2)})${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
    };

    const composeEnderecoDisplay = (cliente: ClienteData) => {
        const partes: string[] = [];
        if (cliente.endereco) {
            let linha = cliente.endereco;
            if (cliente.numero) linha += `, ${cliente.numero}`;
            if (cliente.complemento) linha += ` (${cliente.complemento})`;
            partes.push(linha.trim());
        }
        if (cliente.bairro) {
            partes.push(cliente.bairro);
        }
        const cidadeUf = [cliente.cidade, cliente.uf].filter(Boolean).join('/');
        if (cidadeUf) {
            partes.push(cidadeUf);
        }
        return partes.join(' • ') || '-';
    };

    const fetchCepData = useCallback(async (cep: string) => {
        if (cep.length !== 8 || lastCepRef.current === cep) {
            return;
        }

        lastCepRef.current = cep;
        setIsFetchingCep(true);
        setCepError(null);

        try {
            const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
            if (!response.ok) {
                throw new Error('Erro ao buscar CEP');
            }
            const data = await response.json();

            if (data.erro) {
                setCepError('CEP não encontrado.');
                return;
            }

            setFormData((prev) => ({
                ...prev,
                endereco: data.logradouro || prev.endereco,
                bairro: data.bairro || prev.bairro,
                cidade: data.localidade || prev.cidade,
                uf: data.uf || prev.uf,
                complemento: data.complemento || prev.complemento
            }));
        } catch (error) {
            console.error('Erro ao buscar CEP:', error);
            setCepError('Erro ao buscar CEP.');
        } finally {
            setIsFetchingCep(false);
        }
    }, [setFormData]);

    const handleCepChange = (value: string) => {
        setFormData((prev) => ({ ...prev, cep: value }));
        if (value.length === 8) {
            fetchCepData(value);
        } else {
            setCepError(null);
            lastCepRef.current = '';
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setErrorMessage(null);

        const payload: ClienteFormData & { dataCadastro?: string } = {
            ...formData,
            uf: formData.uf.toUpperCase()
        };

        if (!editingCliente) {
            payload.dataCadastro = new Date().toISOString();
        } else if (editingCliente.dataCadastro) {
            payload.dataCadastro = editingCliente.dataCadastro;
        }

        try {
            if (editingCliente && editingCliente.id) {
                await ConcessionariaService.updateConcessionaria(editingCliente.id, payload);
            } else {
                await ConcessionariaService.addConcessionaria(payload);
            }

            await fetchClientes();
            setShowForm(false);
            setEditingCliente(null);
            resetForm();
        } catch (error) {
            console.error('Erro ao salvar concessionária:', error);
            alert('Erro ao salvar concessionária. Tente novamente.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleEdit = (cliente: ClienteData) => {
        setFormData({
            nome: cliente.nome,
            email: cliente.email,
            telefone: digitsOnly(cliente.telefone),
            cpf: cliente.cpf ?? '',
            observacoes: cliente.observacoes ?? '',
            razaoSocial: cliente.razaoSocial ?? '',
            inscricaoEstadual: cliente.inscricaoEstadual ?? '',
            celular: digitsOnly(cliente.celular),
            contato: cliente.contato ?? '',
            endereco: cliente.endereco ?? '',
            numero: cliente.numero ?? '',
            complemento: cliente.complemento ?? '',
            bairro: cliente.bairro ?? '',
            cidade: cliente.cidade ?? '',
            cnpj: digitsOnly(cliente.cnpj),
            uf: cliente.uf ?? '',
            cep: digitsOnly(cliente.cep),
            nomeResponsavel: cliente.nomeResponsavel ?? '',
            telefoneResponsavel: digitsOnly(cliente.telefoneResponsavel),
            emailResponsavel: cliente.emailResponsavel ?? '',
            ativo: cliente.ativo ?? true
        });
        setCepError(null);
        setIsFetchingCep(false);
        lastCepRef.current = '';
        setEditingCliente(cliente);
        setShowForm(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Tem certeza que deseja excluir esta concessionária?')) {
            return;
        }

        try {
            await ConcessionariaService.deleteConcessionaria(id);
            await fetchClientes();
        } catch (error) {
            console.error('Erro ao excluir concessionária:', error);
            alert('Erro ao excluir concessionária. Tente novamente.');
        }
    };

    const cancelEdit = () => {
        setShowForm(false);
        setEditingCliente(null);
        resetForm();
    };

    return (
        <div className={transportStyles.container}>
            <div className={transportStyles.header}>
                <h2>Gestão de Concessionárias</h2>
                <div className={transportStyles.headerActions}>
                    <button
                        className={transportStyles.addButton}
                        onClick={() => {
                            if (showForm) {
                                cancelEdit();
                            } else {
                                resetForm();
                                setEditingCliente(null);
                                setShowForm(true);
                            }
                        }}
                    >
                        {showForm ? 'Cancelar' : '+ Nova Concessionária'}
                    </button>
                </div>
            </div>

            {showForm && (
                <div className={`${transportStyles.inlineFormWrapper ?? ''} ${styles.clienteFormWrapper}`}>
                    <div className={styles.clienteFormContainer}>
                        <h3>{editingCliente ? 'Editar Concessionária' : 'Cadastrar Nova Concessionária'}</h3>
                        <form onSubmit={handleSubmit} className={styles.clienteForm}>
                            <div className={styles.formRow}>
                                <div className={styles.formGroup}>
                                    <label>Nome Fantasia *</label>
                                    <input
                                        type="text"
                                        value={formData.nome}
                                        onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                                        required
                                        className={styles.formInput}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Razão Social *</label>
                                    <input
                                        type="text"
                                        value={formData.razaoSocial}
                                        onChange={(e) => setFormData({ ...formData, razaoSocial: e.target.value })}
                                        required
                                        className={styles.formInput}
                                    />
                                </div>
                            </div>

                            <div className={styles.formRow}>
                                <div className={styles.formGroup}>
                                    <MaskedInput
                                        name="cnpj"
                                        label="CNPJ *"
                                        value={formData.cnpj}
                                        onChange={(value) => setFormData((prev) => ({ ...prev, cnpj: value }))}
                                        mask="cnpj"
                                        required
                                        placeholder="00.000.000/0000-00"
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Inscrição Estadual</label>
                                    <input
                                        type="text"
                                        value={formData.inscricaoEstadual}
                                        onChange={(e) => setFormData({ ...formData, inscricaoEstadual: e.target.value })}
                                        className={styles.formInput}
                                        placeholder="000.000.000.000"
                                    />
                                </div>
                            </div>

                            <div className={styles.formRow}>
                                <div className={styles.formGroup}>
                                    <MaskedInput
                                        name="telefone"
                                        label="Telefone *"
                                        value={formData.telefone}
                                        onChange={(value) => setFormData((prev) => ({ ...prev, telefone: value }))}
                                        mask="phone"
                                        required
                                        placeholder="(11)99999-9999"
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <MaskedInput
                                        name="celular"
                                        label="Celular"
                                        value={formData.celular}
                                        onChange={(value) => setFormData((prev) => ({ ...prev, celular: value }))}
                                        mask="phone"
                                        placeholder="(11)99999-9999"
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Contato *</label>
                                    <input
                                        type="text"
                                        value={formData.contato}
                                        onChange={(e) => setFormData({ ...formData, contato: e.target.value })}
                                        required
                                        className={styles.formInput}
                                    />
                                </div>
                            </div>

                            <div className={styles.formRow}>
                                <div className={styles.formGroup}>
                                    <label>E-mail *</label>
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        required
                                        className={styles.formInput}
                                        placeholder="contato@empresa.com.br"
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Nome do Responsável *</label>
                                    <input
                                        type="text"
                                        value={formData.nomeResponsavel}
                                        onChange={(e) => setFormData({ ...formData, nomeResponsavel: e.target.value })}
                                        required
                                        className={styles.formInput}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <MaskedInput
                                        name="telefoneResponsavel"
                                        label="Telefone do Responsável *"
                                        value={formData.telefoneResponsavel}
                                        onChange={(value) => setFormData((prev) => ({ ...prev, telefoneResponsavel: value }))}
                                        mask="phone"
                                        required
                                        placeholder="(11)99999-9999"
                                    />
                                </div>
                            </div>

                            <div className={styles.formRow}>
                                <div className={styles.formGroup}>
                                    <label>E-mail do Responsável</label>
                                    <input
                                        type="email"
                                        value={formData.emailResponsavel}
                                        onChange={(e) => setFormData({ ...formData, emailResponsavel: e.target.value })}
                                        className={styles.formInput}
                                        placeholder="responsavel@empresa.com.br"
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Status *</label>
                                    <select
                                        value={formData.ativo ? 'true' : 'false'}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, ativo: e.target.value === 'true' }))}
                                        required
                                        className={styles.formInput}
                                    >
                                        <option value="true">Ativa</option>
                                        <option value="false">Inativa</option>
                                    </select>
                                </div>
                            </div>

                            <div className={styles.formRow}>
                                <div className={styles.formGroup}>
                                    <MaskedInput
                                        name="cep"
                                        label="CEP *"
                                        value={formData.cep}
                                        onChange={handleCepChange}
                                        mask="cep"
                                        required
                                        placeholder="00000-000"
                                    />
                                    {isFetchingCep && (
                                        <small className={styles.formHelper}>Buscando CEP...</small>
                                    )}
                                    {cepError && (
                                        <small className={styles.errorText}>{cepError}</small>
                                    )}
                                    {!isFetchingCep && !cepError && formData.cep.length === 8 && (
                                        <small className={styles.formHelper}>Endereço preenchido automaticamente. Confirme os dados.</small>
                                    )}
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Número *</label>
                                    <input
                                        type="text"
                                        value={formData.numero}
                                        onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
                                        required
                                        className={styles.formInput}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Complemento</label>
                                    <input
                                        type="text"
                                        value={formData.complemento}
                                        onChange={(e) => setFormData({ ...formData, complemento: e.target.value })}
                                        className={styles.formInput}
                                        placeholder="Opcional"
                                    />
                                </div>
                            </div>

                            <div className={styles.formRow}>
                                <div className={styles.formGroup}>
                                    <label>Endereço *</label>
                                    <input
                                        type="text"
                                        value={formData.endereco}
                                        onChange={(e) => setFormData({ ...formData, endereco: e.target.value })}
                                        required
                                        className={styles.formInput}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Bairro *</label>
                                    <input
                                        type="text"
                                        value={formData.bairro}
                                        onChange={(e) => setFormData({ ...formData, bairro: e.target.value })}
                                        required
                                        className={styles.formInput}
                                    />
                                </div>
                            </div>

                            <div className={styles.formRow}>
                                <div className={styles.formGroup}>
                                    <label>Cidade *</label>
                                    <input
                                        type="text"
                                        value={formData.cidade}
                                        onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                                        required
                                        className={styles.formInput}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>UF *</label>
                                    <select
                                        value={formData.uf}
                                        onChange={(e) => setFormData({ ...formData, uf: e.target.value })}
                                        required
                                        className={styles.formInput}
                                    >
                                        <option value="">Selecione</option>
                                        <option value="SP">SP</option>
                                        <option value="RJ">RJ</option>
                                        <option value="MG">MG</option>
                                        <option value="PR">PR</option>
                                        <option value="SC">SC</option>
                                        <option value="RS">RS</option>
                                        <option value="BA">BA</option>
                                        <option value="GO">GO</option>
                                        <option value="PE">PE</option>
                                        <option value="CE">CE</option>
                                    </select>
                                </div>
                            </div>

                            <div className={styles.formRow}>
                                <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
                                    <label>Observações</label>
                                    <textarea
                                        value={formData.observacoes}
                                        onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                                        className={styles.textArea}
                                        rows={3}
                                        placeholder="Informações adicionais, acordos comerciais ou notas internas"
                                    />
                                </div>
                            </div>

                            <div className={styles.formActions}>
                                <button type="button" onClick={cancelEdit} className={styles.cancelBtn}>
                                    Cancelar
                                </button>
                                <button type="submit" className={styles.submitBtn} disabled={submitting}>
                                    {submitting ? 'Salvando...' : editingCliente ? 'Atualizar' : 'Cadastrar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div className={transportStyles.searchSection}>
                <div className={transportStyles.searchContainer}>
                    <input
                        type="text"
                        placeholder="Buscar por nome, razão social, responsável, CNPJ ou cidade..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className={transportStyles.searchInput}
                    />
                    {searchTerm && (
                        <button className={transportStyles.clearButton} onClick={handleClearSearch}>
                            ✕
                        </button>
                    )}
                </div>
            </div>

            <div className={transportStyles.resultsSection}>
                <div className={transportStyles.resultsHeader}>
                    <h3>Resultados ({filteredClientes.length})</h3>
                    <span className={styles.resultsMeta}>
                        {clientes.length > 0
                            ? `Exibindo ${filteredClientes.length} de ${clientes.length} registros`
                            : 'Nenhuma concessionária cadastrada'}
                    </span>
                </div>

                {errorMessage ? (
                    <div className={styles.noResultsMessage}>{errorMessage}</div>
                ) : loadingClientes ? (
                    <div className={styles.noResultsMessage}>Carregando concessionárias...</div>
                ) : (
                    <div className={transportStyles.tableContainer}>
                        <table className={transportStyles.table}>
                            <thead>
                                <tr>
                                    <th className={transportStyles.tableHeader}>NOME / RAZÃO SOCIAL</th>
                                    <th className={transportStyles.tableHeader}>CONTATO PRINCIPAL</th>
                                    <th className={transportStyles.tableHeader}>RESPONSÁVEL</th>
                                    <th className={transportStyles.tableHeader}>CNPJ</th>
                                    <th className={transportStyles.tableHeader}>CEP</th>
                                    <th className={transportStyles.tableHeader}>ENDEREÇO</th>
                                    <th className={transportStyles.tableHeader}>STATUS</th>
                                    <th className={transportStyles.tableHeader}>AÇÕES</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredClientes.length === 0 ? (
                                    <tr className={transportStyles.tableRow}>
                                        <td className={styles.emptyStateCell} colSpan={8}>
                                            {searchTerm ? 'Nenhuma concessionária encontrada.' : 'Nenhuma concessionária cadastrada.'}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredClientes.map((cliente) => (
                                        <tr key={cliente.id} className={transportStyles.tableRow}>
                                            <td className={`${transportStyles.tableCell} ${styles.tableCellMulti}`}>
                                                <strong>{cliente.nome}</strong>
                                                <div className={styles.tableSubtext}>{cliente.razaoSocial}</div>
                                            </td>
                                            <td className={`${transportStyles.tableCell} ${styles.tableCellMulti}`}>
                                                <div className={styles.tableSubtextStrong}>{cliente.contato}</div>
                                                <div className={styles.tableSubtext}>{formatPhoneDisplay(cliente.telefone)}</div>
                                                {cliente.celular && (
                                                    <div className={styles.tableSubtext}>{formatPhoneDisplay(cliente.celular)}</div>
                                                )}
                                                <div className={styles.tableSubtext}>{cliente.email}</div>
                                            </td>
                                            <td className={`${transportStyles.tableCell} ${styles.tableCellMulti}`}>
                                                <div className={styles.tableSubtextStrong}>{cliente.nomeResponsavel}</div>
                                                <div className={styles.tableSubtext}>{formatPhoneDisplay(cliente.telefoneResponsavel)}</div>
                                                {cliente.emailResponsavel && (
                                                    <div className={styles.tableSubtext}>{cliente.emailResponsavel}</div>
                                                )}
                                            </td>
                                            <td className={transportStyles.tableCell}>{formatCnpjDisplay(cliente.cnpj)}</td>
                                            <td className={transportStyles.tableCell}>{formatCepDisplay(cliente.cep)}</td>
                                            <td className={`${transportStyles.tableCell} ${styles.tableCellMulti}`}>{composeEnderecoDisplay(cliente)}</td>
                                            <td className={transportStyles.tableCell}>
                                                <span className={`${transportStyles.statusBadge} ${cliente.ativo === false ? transportStyles.statusInactive : transportStyles.statusActive}`}>
                                                    {cliente.ativo === false ? 'Inativa' : 'Ativa'}
                                                </span>
                                                <div className={styles.tableSubtext}>{formatDate(cliente.dataCadastro ?? cliente.criadoEm)}</div>
                                            </td>
                                            <td className={transportStyles.tableCell}>
                                                <div className={transportStyles.actionButtons}>
                                                    <button
                                                        className={transportStyles.editButton}
                                                        onClick={() => handleEdit(cliente)}
                                                        title="Editar"
                                                    >
                                                        ✏️
                                                    </button>
                                                    <button
                                                        className={transportStyles.deleteButton}
                                                        onClick={() => handleDelete(cliente.id)}
                                                        title="Excluir"
                                                    >
                                                        🗑️
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

function TabelasTab() {
    const [activeTable, setActiveTable] = useState<'marcas' | 'modelos' | 'cores'>('marcas');

    return (
        <div className={styles.combinedContainer}>
            <div className={styles.subTabBar}>
                <button
                    className={`${styles.subTab} ${activeTable === 'marcas' ? styles.subTabActive : ''}`}
                    onClick={() => setActiveTable('marcas')}
                >
                    🏷️ Marcas
                </button>
                <button
                    className={`${styles.subTab} ${activeTable === 'modelos' ? styles.subTabActive : ''}`}
                    onClick={() => setActiveTable('modelos')}
                >
                    🚗 Modelos
                </button>
                <button
                    className={`${styles.subTab} ${activeTable === 'cores' ? styles.subTabActive : ''}`}
                    onClick={() => setActiveTable('cores')}
                >
                    🎨 Cores
                </button>
            </div>

            <div className={styles.tabContent}>
                {activeTable === 'marcas' && <MarcasTable />}
                {activeTable === 'modelos' && <ModelosTable />}
                {activeTable === 'cores' && <CoresTable />}
            </div>
        </div>
    );
}
