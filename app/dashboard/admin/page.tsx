'use client';

import { useState, useEffect } from 'react';
import { signOut, getSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { UsersTable } from './users/UsersTable';
import { VehicleConsultation } from '../../../components/operator/VehicleConsultation';
import UserMenu from '../../../components/UserMenu';
import styles from './admin.module.css';

type TabType = 'visao-geral' | 'usuarios' | 'veiculos' | 'configuracoes';

export default function AdminDashboard() {
    const [activeTab, setActiveTab] = useState<TabType>('usuarios');
    const [userInfo, setUserInfo] = useState<{ name?: string | null; email?: string | null }>({});
    const router = useRouter();

    useEffect(() => {
        getSession()
            .then((session) => {
                if (session?.user) {
                    setUserInfo({
                        name: session.user.name ?? 'Administrador',
                        email: session.user.email ?? null,
                    });
                }
            })
            .catch((error) => {
                console.error('Erro ao carregar sessão do usuário:', error);
            });
    }, []);

    const handleLogout = async () => {
        await signOut({ callbackUrl: '/' });
    };

    const tabs = [
        { id: 'visao-geral', label: 'Visão Geral', icon: '📊' },
        { id: 'usuarios', label: 'Usuários', icon: '👥' },
        { id: 'veiculos', label: 'Veículos', icon: '🚗' },
        { id: 'configuracoes', label: 'Configurações', icon: '⚙️' }
    ];

    const renderTabContent = () => {
        switch (activeTab) {
            case 'visao-geral':
                return (
                    <div className={styles.contentArea}>
                        <h2 className={styles.title}>Visão Geral</h2>
                        <p className={styles.subtitle}>Bem-vindo ao painel administrativo.</p>
                        {/* TODO: Add charts and stats */}
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
                        role="Administrador"
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
    );
}
