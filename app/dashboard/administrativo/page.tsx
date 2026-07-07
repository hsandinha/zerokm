'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { getSession } from 'next-auth/react';
import { VehicleConsultation } from '../../../components/operator/VehicleConsultation';
import { ConfigContext } from '../../../lib/contexts/ConfigContext';
import UserMenu from '../../../components/UserMenu';
import { UsersTable } from '../admin/users/UsersTable';
import { ConcessionariasManagement } from '../../../components/admin/ConcessionariasManagement';
import { TransportadorasManagement } from '../../../components/admin/TransportadorasManagement';
import { TabelasManagement } from '../../../components/admin/TabelasManagement';
import { CatalogVariationsManagement } from '../../../components/admin/CatalogVariationsManagement';
import { AdminDealershipVehicles } from '../../../components/admin/AdminDealershipVehicles';
import { MobileTabBar } from '../../../components/mobile/MobileTabBar';
import styles from '../operator/operator.module.css';

type TabType = 'veiculos' | 'estoque-concessionarias' | 'catalogo' | 'concessionarias' | 'transportadoras' | 'tabelas' | 'usuarios';

// ----------------------------------------------------------------
// Dashboard principal do Administrativo
// ----------------------------------------------------------------
export default function AdministrativoDashboard() {
    const [activeTab, setActiveTab] = useState<TabType>('veiculos');
    const [margem, setMargem] = useState(0);
    const [fixedMargin, setFixedMargin] = useState(0);
    const [marginMode, setMarginMode] = useState<'percent' | 'fixed'>('percent');
    const [userInfo, setUserInfo] = useState<{ name?: string | null; email?: string | null; profile?: string }>({});

    // Carregar margem
    useEffect(() => {
        fetch('/api/config/margem')
            .then(r => r.json())
            .then(data => {
                setMargem(data.margem || 0);
                setFixedMargin(data.fixedMargin || 0);
                setMarginMode(data.marginMode === 'fixed' ? 'fixed' : 'percent');
            })
            .catch(() => { });
    }, []);

    // Verificar sessão
    useEffect(() => {
        getSession().then(session => {
            if (!session?.user) { window.location.replace('/login'); return; }
            const profile = session.user.profile as string;
            if (profile !== 'administrativo' && profile !== 'administrador' && profile !== 'admin') {
                window.location.replace('/dashboard/operator');
                return;
            }
            setUserInfo({ name: session.user.name, email: session.user.email, profile });
        });
    }, []);

    const updateMargem = async (v: number, mode = marginMode, fm = fixedMargin) => {
        await fetch('/api/config/margem', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ margem: v, marginMode: mode, fixedMargin: fm }),
        });
        setMargem(v); setFixedMargin(fm); setMarginMode(mode);
    };

    const effectiveRole = (userInfo.profile as any) || 'administrativo';

    const tabs = [
        { id: 'veiculos', label: 'Veículos', icon: '🚗' },
        { id: 'estoque-concessionarias', label: 'Estoque Cons.', icon: '🏢' },
        { id: 'catalogo', label: 'Catálogo', icon: '📚' },
        { id: 'concessionarias', label: 'Concessionárias', icon: '🏢' },
        { id: 'transportadoras', label: 'Frete', icon: '🚚' },
        { id: 'tabelas', label: 'Tabelas', icon: '📋' },
        { id: 'usuarios', label: 'Usuários', icon: '👥' },
    ];

    const renderContent = () => {
        switch (activeTab) {
            case 'veiculos': return <VehicleConsultation role={effectiveRole} />;
            case 'estoque-concessionarias': return <AdminDealershipVehicles />;
            case 'catalogo': return <CatalogVariationsManagement />;
            case 'concessionarias': return <ConcessionariasManagement />;
            case 'transportadoras': return <TransportadorasManagement />;
            case 'tabelas': return <TabelasManagement />;
            case 'usuarios': return <UsersTable />;
        }
    };

    return (
        <ConfigContext.Provider value={{
            margem,
            fixedMargin,
            marginMode,
            setMargem: (v) => updateMargem(v, marginMode, fixedMargin),
            setMarginConfig: ({ margem: v, marginMode: m, fixedMargin: f }) => updateMargem(v, m, f),
        }}>
            <div className={styles.container}>

                {/* Header */}
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <Image src="/images/logo.png" alt="Logo" width={240} height={80} className={styles.logo} priority />
                    </div>
                    <div className={styles.headerRight}>
                        <UserMenu
                            name={userInfo.name ?? 'Administrativo'}
                            email={userInfo.email ?? null}
                            role="Administrativo"
                        />
                    </div>
                </div>

                {/* Tabs */}
                <div className={styles.tabsContainer}>
                    <div className={styles.tabsList}>
                        {tabs.map(tab => (
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

                {/* Content */}
                <div className={styles.contentArea}>
                    <div className={styles.tabContent}>
                        {renderContent()}
                    </div>
                </div>

                <MobileTabBar
                    items={tabs.map((tab) => ({ id: tab.id, label: tab.label, icon: tab.icon }))}
                    primaryIds={['veiculos', 'estoque-concessionarias', 'concessionarias', 'usuarios']}
                    activeId={activeTab}
                    onSelect={(id) => setActiveTab(id as TabType)}
                    user={{ name: userInfo.name ?? 'Administrativo', email: userInfo.email, role: 'Administrativo' }}
                />
            </div>
        </ConfigContext.Provider>
    );
}
