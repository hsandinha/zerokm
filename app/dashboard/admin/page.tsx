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
import { VisaoGeralTab } from '../../../components/admin/VisaoGeralTab';
import { CatalogVariationsManagement } from '../../../components/admin/CatalogVariationsManagement';
import { AdminDealershipVehicles } from '../../../components/admin/AdminDealershipVehicles';
import KanbanBoard from '../../../components/crm/KanbanBoard';
import { MobileTabBar } from '../../../components/mobile/MobileTabBar';
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

type TabType = 'visao-geral' | 'usuarios' | 'veiculos' | 'estoque-concessionarias' | 'catalogo' | 'concessionarias' | 'transportadoras' | 'tabelas' | 'margem' | 'configuracoes' | 'planos' | 'crm' | 'funil' | 'integracoes' | 'banners';

export default function AdminDashboard() {
    const [activeTab, setActiveTab] = useState<TabType>('visao-geral');
    const [crmHighlightEmail, setCrmHighlightEmail] = useState<string | null>(null);
    const [margem, setMargem] = useState<number>(0);
    const [fixedMargin, setFixedMargin] = useState<number>(0);
    const [marginMode, setMarginMode] = useState<'percent' | 'fixed'>('percent');
    const [userInfo, setUserInfo] = useState<{ name?: string | null; email?: string | null; profile?: string }>({});
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
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
                    const profile = session.user.profile;
                    setUserInfo({
                        name: session.user.name ?? 'Administrador',
                        email: session.user.email ?? null,
                        profile,
                    });
                    if (profile === 'marketing') {
                        setActiveTab('funil');
                    }
                }
            })
            .catch((error) => {
                console.error('Erro ao carregar sessão do usuário:', error);
            });
    }, []);

    const allTabs = [
        { id: 'visao-geral', label: 'Visão Geral', icon: '📊' },
        { id: 'usuarios', label: 'Equipe', icon: '👥' },
        { id: 'veiculos', label: 'Veículos', icon: '🚗' },
        { id: 'estoque-concessionarias', label: 'Estoque Cons.', icon: '🏢' },
        { id: 'catalogo', label: 'Catálogo', icon: '📚' },
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
                return <VisaoGeralTab userInfo={userInfo} />;
            case 'usuarios':
                return (
                    <div className={styles.contentArea}>
                        <h2 className={styles.title}>Equipe</h2>
                        <p className={styles.subtitle} style={{ marginBottom: '1.5rem' }}>
                            Acessos e permissões da equipe interna. Clientes são geridos no CRM.
                        </p>
                        <UsersTable onViewInCRM={(email) => { setActiveTab('crm'); setCrmHighlightEmail(email); }} />
                    </div>
                );
            case 'veiculos':
                return <VehicleConsultation role={userInfo.profile as any || 'admin'} />;
            case 'estoque-concessionarias':
                return (
                    <div className={styles.contentArea}>
                        <AdminDealershipVehicles />
                    </div>
                );
            case 'catalogo':
                return (
                    <div className={styles.contentArea}>
                        <CatalogVariationsManagement />
                    </div>
                );
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
                    <header className={styles.mobileHeader}>
                        <Image
                            src="/images/logo.png"
                            alt="Logo"
                            width={110}
                            height={37}
                            className={styles.mobileHeaderLogo}
                            priority
                        />
                    </header>
                    {renderTabContent()}
                </main>

                <MobileTabBar
                    items={tabs.map((tab) => ({ id: tab.id, label: tab.label, icon: tab.icon }))}
                    primaryIds={['visao-geral', 'veiculos', 'crm', 'usuarios']}
                    activeId={activeTab}
                    onSelect={(id) => setActiveTab(id as TabType)}
                    user={{
                        name: userInfo.name || 'Administrador',
                        email: userInfo.email,
                        role: userInfo.profile === 'gerente' ? 'Gerente' : userInfo.profile === 'marketing' ? 'Marketing' : 'Administrador',
                    }}
                />
            </div>
        </ConfigContext.Provider>
    );
}
