'use client';

import { useState, useEffect } from 'react';
import { signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Badge } from '../../../components/Badge';
import { SummaryCard } from '../../../components/SummaryCard';
import { VehicleConsultation } from '../../../components/operator/VehicleConsultation';
import { MarcasTable } from '../../../components/operator/MarcasTable';
import { ModelosTable } from '../../../components/operator/ModelosTable';
import CoresTable from '../../../components/operator/CoresTable';
import { TransportadorasManagement } from '../../../components/operator/TransportadorasManagement';
import { ConfigContext, useConfig } from '../../../lib/contexts/ConfigContext';
import styles from './operator.module.css';

type TabType = 'visao-geral' | 'veiculos' | 'propostas' | 'clientes' | 'transportadoras' | 'tabelas' | 'configuracoes';

export default function OperatorDashboard() {
    const [activeTab, setActiveTab] = useState<TabType>('veiculos');
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
            const parsedMargem = parseFloat(savedMargem);
            setMargem(parsedMargem);
        }
    }, []);

    // Função para atualizar margem e sincronizar com localStorage
    const updateMargem = (newMargem: number) => {
        setMargem(newMargem);
        localStorage.setItem('vehicleMargem', newMargem.toString());
    };

    const tabs = [
        { id: 'veiculos', label: 'Veículos', icon: '🚗' },
        { id: 'visao-geral', label: 'Visão Geral & Relatórios', icon: '📊' },
        { id: 'propostas', label: 'Propostas', icon: '📋' },
        { id: 'clientes', label: 'Concessionárias', icon: '🏢' },
        { id: 'transportadoras', label: 'Transportadoras', icon: '🚚' },
        { id: 'tabelas', label: 'Tabelas', icon: '📋' },
        { id: 'configuracoes', label: 'Configurações', icon: '⚙️' }
    ];

    const renderTabContent = () => {
        switch (activeTab) {
            case 'visao-geral':
                return <VisaoGeralERelatoriosTab />;
            case 'veiculos':
                return <VehicleConsultation />;
            case 'propostas':
                return <PropostasTab />;
            case 'clientes':
                return <ClientesTab />;
            case 'transportadoras':
                return <TransportadorasManagement />;
            case 'tabelas':
                return <TabelasTab />;
            case 'configuracoes':
                return <ConfiguracoesTab />;
            default:
                return <VisaoGeralERelatoriosTab />;
        }
    };

    return (
        <ConfigContext.Provider value={{ margem, setMargem: updateMargem }}>
            <div className={styles.container}>
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <h1>Zero KM</h1>
                        <span className={styles.subtitle}>Operador</span>
                    </div>
                    <div className={styles.headerRight}>
                        <span className={styles.welcome}>Bem vindo, Operador</span>
                        <button
                            className={styles.exitButton}
                            onClick={handleLogout}
                            title="Fazer logout"
                        >
                            Sair
                        </button>
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
    const [subTab, setSubTab] = useState<'visao-geral' | 'relatorios'>('visao-geral');

    return (
        <div className={styles.combinedContainer}>
            <div className={styles.subTabBar}>
                <button
                    className={`${styles.subTab} ${subTab === 'visao-geral' ? styles.subTabActive : ''}`}
                    onClick={() => setSubTab('visao-geral')}
                >
                    📊 Visão Geral
                </button>
                <button
                    className={`${styles.subTab} ${subTab === 'relatorios' ? styles.subTabActive : ''}`}
                    onClick={() => setSubTab('relatorios')}
                >
                    📈 Relatórios
                </button>
            </div>

            {subTab === 'visao-geral' ? (
                <div className={styles.visaoGeralContainer}>
                    <div className={styles.statsGrid}>
                        <div className={styles.statCard}>
                            <div className={styles.statIcon}>📞</div>
                            <div className={styles.statContent}>
                                <h3>Atendimentos Hoje</h3>
                                <div className={styles.statNumber}>47</div>
                                <div className={styles.statChange}>+8%</div>
                            </div>
                        </div>
                        <div className={styles.statCard}>
                            <div className={styles.statIcon}>📋</div>
                            <div className={styles.statContent}>
                                <h3>Propostas Ativas</h3>
                                <div className={styles.statNumber}>23</div>
                                <div className={styles.statChange}>-5%</div>
                            </div>
                        </div>
                        <div className={styles.statCard}>
                            <div className={styles.statIcon}>✅</div>
                            <div className={styles.statContent}>
                                <h3>Vendas Concluídas</h3>
                                <div className={styles.statNumber}>12</div>
                                <div className={styles.statChange}>+20%</div>
                            </div>
                        </div>
                        <div className={styles.statCard}>
                            <div className={styles.statIcon}>🎯</div>
                            <div className={styles.statContent}>
                                <h3>Meta do Mês</h3>
                                <div className={styles.statNumber}>85%</div>
                                <div className={styles.statChange}>+3%</div>
                            </div>
                        </div>
                    </div>

                    <div className={styles.todaySection}>
                        <h2>Hoje</h2>
                        <div className={styles.todayDate}>18 de Novembro</div>

                        <div className={styles.scheduleList}>
                            <div className={styles.scheduleItem}>
                                <div className={styles.scheduleTime}>14:00</div>
                                <div className={styles.scheduleContent}>
                                    <div className={styles.scheduleTitle}>Atendimento Cliente</div>
                                    <div className={styles.scheduleSubtitle}>João Silva - Corolla 2024</div>
                                </div>
                            </div>
                            <div className={styles.scheduleItem}>
                                <div className={styles.scheduleTime}>14:30</div>
                                <div className={styles.scheduleContent}>
                                    <div className={styles.scheduleTitle}>Entrega Veículo</div>
                                    <div className={styles.scheduleSubtitle}>Maria Santos - Honda Civic</div>
                                </div>
                            </div>
                            <div className={styles.scheduleItem}>
                                <div className={styles.scheduleTime}>16:00</div>
                                <div className={styles.scheduleContent}>
                                    <div className={styles.scheduleTitle}>Reunião Equipe</div>
                                    <div className={styles.scheduleSubtitle}>Revisão metas mensais</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className={styles.tabContentContainer}>
                    <h2>Relatórios e Análises</h2>
                    <div className={styles.relatoriosGrid}>
                        <div className={styles.relatorioCard}>
                            <h3>Vendas por Período</h3>
                            <p>Análise detalhada das vendas mensais e trimestrais</p>
                            <div className={styles.comingSoon}>📊 Em desenvolvimento...</div>
                        </div>
                        <div className={styles.relatorioCard}>
                            <h3>Performance da Equipe</h3>
                            <p>Acompanhamento individual dos vendedores</p>
                            <div className={styles.comingSoon}>👥 Em desenvolvimento...</div>
                        </div>
                        <div className={styles.relatorioCard}>
                            <h3>Estoque de Veículos</h3>
                            <p>Controle e análise do inventário atual</p>
                            <div className={styles.comingSoon}>🚗 Em desenvolvimento...</div>
                        </div>
                        <div className={styles.relatorioCard}>
                            <h3>Satisfação do Cliente</h3>
                            <p>Métricas de qualidade e feedback dos clientes</p>
                            <div className={styles.comingSoon}>⭐ Em desenvolvimento...</div>
                        </div>
                    </div>
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
    id: number;
    nome: string;
    telefone: string;
    contato: string;
    endereco: string;
    cidade: string;
    cnpj: string;
    uf: string;
    cep: string;
    dataCadastro: string;
}

// Mock data para concessionárias
const mockClientes: ClienteData[] = [
    {
        id: 1,
        nome: "Concessionária Premium Motors",
        telefone: "(11) 3456-7890",
        contato: "João Silva",
        endereco: "Rua das Flores, 123",
        cidade: "São Paulo",
        cnpj: "12.345.678/0001-90",
        uf: "SP",
        cep: "01234-567",
        dataCadastro: "15/10/2024"
    },
    {
        id: 2,
        nome: "Auto Center Sul",
        telefone: "(21) 2345-6789",
        contato: "Maria Santos",
        endereco: "Av. Copacabana, 456",
        cidade: "Rio de Janeiro",
        cnpj: "23.456.789/0001-01",
        uf: "RJ",
        cep: "22070-012",
        dataCadastro: "02/11/2024"
    },
    {
        id: 3,
        nome: "Veículos Minas Gerais Ltda",
        telefone: "(31) 4567-8901",
        contato: "Pedro Costa",
        endereco: "Rua Bahia, 789",
        cidade: "Belo Horizonte",
        cnpj: "34.567.890/0001-12",
        uf: "MG",
        cep: "30112-000",
        dataCadastro: "18/11/2024"
    }
];

function ClientesTab() {
    const [searchTerm, setSearchTerm] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [clientes, setClientes] = useState<ClienteData[]>(mockClientes);
    const [editingCliente, setEditingCliente] = useState<ClienteData | null>(null);
    const [formData, setFormData] = useState({
        nome: '',
        telefone: '',
        contato: '',
        endereco: '',
        cidade: '',
        cnpj: '',
        uf: '',
        cep: ''
    });

    const [filteredClientes, setFilteredClientes] = useState<ClienteData[]>(mockClientes);

    useEffect(() => {
        const filtered = clientes.filter(cliente =>
            cliente.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
            cliente.contato.toLowerCase().includes(searchTerm.toLowerCase()) ||
            cliente.cnpj.includes(searchTerm) ||
            cliente.cidade.toLowerCase().includes(searchTerm.toLowerCase())
        );
        setFilteredClientes(filtered);
    }, [searchTerm, clientes]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (editingCliente) {
            // Editar cliente existente
            const updatedClientes = clientes.map(cliente =>
                cliente.id === editingCliente.id
                    ? { ...editingCliente, ...formData, id: editingCliente.id, dataCadastro: editingCliente.dataCadastro }
                    : cliente
            );
            setClientes(updatedClientes);
            setEditingCliente(null);
        } else {
            // Criar novo cliente
            const newCliente: ClienteData = {
                id: Math.max(...clientes.map(c => c.id)) + 1,
                ...formData,
                dataCadastro: new Date().toLocaleDateString('pt-BR')
            };
            setClientes([...clientes, newCliente]);
        }

        // Resetar formulário
        setFormData({
            nome: '',
            telefone: '',
            contato: '',
            endereco: '',
            cidade: '',
            cnpj: '',
            uf: '',
            cep: ''
        });
        setShowForm(false);
    };

    const handleEdit = (cliente: ClienteData) => {
        setFormData({
            nome: cliente.nome,
            telefone: cliente.telefone,
            contato: cliente.contato,
            endereco: cliente.endereco,
            cidade: cliente.cidade,
            cnpj: cliente.cnpj,
            uf: cliente.uf,
            cep: cliente.cep
        });
        setEditingCliente(cliente);
        setShowForm(true);
    };

    const handleDelete = (id: number) => {
        if (confirm('Tem certeza que deseja excluir esta concessionária?')) {
            setClientes(clientes.filter(cliente => cliente.id !== id));
        }
    };

    const cancelEdit = () => {
        setShowForm(false);
        setEditingCliente(null);
        setFormData({
            nome: '',
            telefone: '',
            contato: '',
            endereco: '',
            cidade: '',
            cnpj: '',
            uf: '',
            cep: ''
        });
    };

    return (
        <div className={styles.tabContentContainer}>
            <div className={styles.clienteHeader}>
                <h2>Gestão de Concessionárias</h2>
                <button
                    className={styles.newClienteBtn}
                    onClick={() => setShowForm(!showForm)}
                >
                    {showForm ? 'Cancelar' : '+ Nova Concessionária'}
                </button>
            </div>

            {showForm && (
                <div className={styles.clienteFormContainer}>
                    <h3>{editingCliente ? 'Editar Concessionária' : 'Cadastrar Nova Concessionária'}</h3>
                    <form onSubmit={handleSubmit} className={styles.clienteForm}>
                        <div className={styles.formRow}>
                            <div className={styles.formGroup}>
                                <label>Nome *</label>
                                <input
                                    type="text"
                                    value={formData.nome}
                                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                                    required
                                    className={styles.formInput}
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label>CNPJ *</label>
                                <input
                                    type="text"
                                    value={formData.cnpj}
                                    onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                                    required
                                    className={styles.formInput}
                                    placeholder="00.000.000/0000-00"
                                />
                            </div>
                        </div>

                        <div className={styles.formRow}>
                            <div className={styles.formGroup}>
                                <label>Telefone *</label>
                                <input
                                    type="text"
                                    value={formData.telefone}
                                    onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                                    required
                                    className={styles.formInput}
                                    placeholder="(00) 0000-0000"
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
                            <div className={styles.formGroup}>
                                <label>CEP *</label>
                                <input
                                    type="text"
                                    value={formData.cep}
                                    onChange={(e) => setFormData({ ...formData, cep: e.target.value })}
                                    required
                                    className={styles.formInput}
                                    placeholder="00000-000"
                                />
                            </div>
                        </div>

                        <div className={styles.formActions}>
                            <button type="button" onClick={cancelEdit} className={styles.cancelBtn}>
                                Cancelar
                            </button>
                            <button type="submit" className={styles.submitBtn}>
                                {editingCliente ? 'Atualizar' : 'Cadastrar'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className={styles.clienteListContainer}>
                <div className={styles.searchContainer}>
                    <input
                        type="text"
                        placeholder="Buscar concessionária por nome, contato, CNPJ ou cidade..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className={styles.searchInput}
                    />
                </div>

                <div className={styles.clienteTable}>
                    <div className={styles.tableHeader}>
                        <div className={styles.tableHeaderCell}>Nome</div>
                        <div className={styles.tableHeaderCell}>Contato</div>
                        <div className={styles.tableHeaderCell}>Telefone</div>
                        <div className={styles.tableHeaderCell}>CNPJ</div>
                        <div className={styles.tableHeaderCell}>Cidade/UF</div>
                        <div className={styles.tableHeaderCell}>Data Cadastro</div>
                        <div className={styles.tableHeaderCell}>Ações</div>
                    </div>

                    {filteredClientes.map((cliente) => (
                        <div key={cliente.id} className={styles.tableRow}>
                            <div className={styles.tableCell}>
                                <strong>{cliente.nome}</strong>
                            </div>
                            <div className={styles.tableCell}>{cliente.contato}</div>
                            <div className={styles.tableCell}>{cliente.telefone}</div>
                            <div className={styles.tableCell}>{cliente.cnpj}</div>
                            <div className={styles.tableCell}>{cliente.cidade}/{cliente.uf}</div>
                            <div className={styles.tableCell}>{cliente.dataCadastro}</div>
                            <div className={styles.tableCell}>
                                <div className={styles.actionButtons}>
                                    <button
                                        className={styles.editActionBtn}
                                        onClick={() => handleEdit(cliente)}
                                        title="Editar"
                                    >
                                        ✏️
                                    </button>
                                    <button
                                        className={styles.deleteActionBtn}
                                        onClick={() => handleDelete(cliente.id)}
                                        title="Excluir"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {filteredClientes.length === 0 && (
                    <div className={styles.noResults}>
                        {searchTerm ? 'Nenhuma concessionária encontrada.' : 'Nenhuma concessionária cadastrada.'}
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
} function ConfiguracoesTab() {
    const { margem, setMargem } = useConfig();
    const [inputMargem, setInputMargem] = useState<string>(margem.toString());

    // Sincronizar inputMargem quando margem mudar
    useEffect(() => {
        setInputMargem(margem.toString());
    }, [margem]);

    const handleSaveMargem = () => {
        const newMargem = parseFloat(inputMargem) || 0;
        setMargem(newMargem);
        localStorage.setItem('vehicleMargem', newMargem.toString());
        alert(`Margem de ${newMargem}% salva com sucesso!`);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        // Permite apenas números e ponto decimal
        if (/^\d*\.?\d*$/.test(value)) {
            setInputMargem(value);
        }
    };

    return (
        <div className={styles.tabContentContainer}>
            <div className={styles.configHeader}>
                <h2>Configurações do Sistema</h2>
                <p>Configure parâmetros e preferências do sistema.</p>
            </div>

            <div className={styles.configSection}>
                <div className={styles.configCard}>
                    <div className={styles.configCardHeader}>
                        <h3>Margem de Lucro dos Veículos</h3>
                        <p>Configure a margem percentual que será aplicada aos preços dos veículos no grid de consulta.</p>
                    </div>

                    <div className={styles.configCardBody}>
                        <div className={styles.margemInputGroup}>
                            <label htmlFor="margem">Margem (%):</label>
                            <div className={styles.inputWithButton}>
                                <input
                                    id="margem"
                                    type="text"
                                    value={inputMargem}
                                    onChange={handleInputChange}
                                    placeholder=""
                                    className={styles.margemInput}
                                />
                                <span className={styles.percentSymbol}></span>
                                <button
                                    onClick={handleSaveMargem}
                                    className={styles.saveButton}
                                >
                                    Salvar
                                </button>
                            </div>
                        </div>

                        <div className={styles.margemInfo}>
                            <div className={styles.infoRow}>
                                <span>Margem Atual:</span>
                                <strong>{margem}%</strong>
                            </div>
                            <div className={styles.infoRow}>
                                <span>Exemplo de Cálculo:</span>
                                <span>Preço R$ 100.000 + {margem}% = R$ {(100000 * (1 + margem / 100)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className={styles.configCard}>
                    <div className={styles.configCardHeader}>
                        <h3>Outras Configurações</h3>
                        <p>Configurações adicionais do sistema.</p>
                    </div>

                    <div className={styles.configCardBody}>
                        <div className={styles.comingSoon}>
                            🚧 Em desenvolvimento...
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}