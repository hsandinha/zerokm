'use client';
import { useState, type ReactNode } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import UserMenu from '@/components/UserMenu';
import { MobileTabBar } from '@/components/mobile/MobileTabBar';
import styles from './DashboardShell.module.css';

export { styles as shellStyles };

export interface ShellTab {
    id: string;
    label: string;
    icon: ReactNode;
    /** Contador sobre o ícone (ex.: ofertas novas em Favoritos). 0 ou ausente = sem bolinha. */
    badge?: number;
}

export interface DashboardShellProps {
    /** Rótulo pequeno acima do menu (ex.: ADMINISTRAÇÃO, OPERAÇÃO, CONCESSIONÁRIA). */
    sectionLabel: string;
    tabs: ShellTab[];
    activeId: string;
    onSelect: (id: string) => void;
    user: { name: string; email?: string | null; role: string; credits?: number; onUpgradeClick?: () => void };
    /** Itens fixos da barra inferior no celular; os demais vão para "Mais". */
    primaryIds?: string[];
    children: ReactNode;
}

/**
 * Estrutura padrão de todos os painéis da equipe (admin, gerente, marketing, operador,
 * vendedor, administrativo e concessionária): menu lateral azul-marinho que expande ao
 * passar o mouse, usuário no rodapé do menu e barra de abas inferior no celular.
 * O tema (claro/escuro) e os tokens vêm do layout de cada rota (AdminDesignLayout).
 */
export function DashboardShell({ sectionLabel, tabs, activeId, onSelect, user, primaryIds, children }: DashboardShellProps) {
    const [collapsed, setCollapsed] = useState(true);
    const iconComBolinha = (tab: ShellTab) => (
        <span className={styles.iconWrap}>
            {tab.icon}
            {!!tab.badge && tab.badge > 0 && (
                <span className={styles.badge} aria-label={`${tab.badge} ${tab.badge === 1 ? 'novidade' : 'novidades'}`}>{tab.badge > 99 ? '99+' : tab.badge}</span>
            )}
        </span>
    );

    return (
        <div className={styles.layoutWrapper}>
            <aside
                className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ''}`}
                onMouseEnter={() => setCollapsed(false)}
                onMouseLeave={() => setCollapsed(true)}
                onFocusCapture={event => { if (event.target.matches(':focus-visible')) setCollapsed(false); }}
                onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setCollapsed(true); }}
            >
                <div className={styles.sidebarHeader}>
                    {collapsed
                        ? <div className={styles.collapsedLogo}><strong>CNV</strong></div>
                        : <Image src="/images/logo.png" alt="CNV" width={160} height={54} className={styles.sidebarLogo} priority />}
                    <button
                        type="button"
                        className={styles.sidebarToggle}
                        onClick={() => setCollapsed(!collapsed)}
                        title={collapsed ? 'Expandir menu' : 'Minimizar menu'}
                        aria-label={collapsed ? 'Expandir menu' : 'Minimizar menu'}
                        aria-expanded={!collapsed}
                    >
                        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                    </button>
                </div>

                <div className={styles.sidebarMenuSection}>
                    {!collapsed && <p className={styles.sidebarMenuLabel}>{sectionLabel}</p>}
                    <nav className={styles.sidebarNav} aria-label={sectionLabel}>
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                type="button"
                                className={`${styles.sidebarItem} ${activeId === tab.id ? styles.sidebarItemActive : ''}`}
                                onClick={() => onSelect(tab.id)}
                                title={tab.badge ? `${tab.label} (${tab.badge} ${tab.badge === 1 ? 'novidade' : 'novidades'})` : tab.label}
                                aria-label={tab.badge ? `${tab.label}, ${tab.badge} ${tab.badge === 1 ? 'novidade' : 'novidades'}` : tab.label}
                                aria-current={activeId === tab.id ? 'page' : undefined}
                            >
                                <span className={styles.sidebarItemIcon}>{iconComBolinha(tab)}</span>
                                <span className={styles.sidebarItemLabel}>{tab.label}</span>
                            </button>
                        ))}
                    </nav>
                </div>

                <div className={styles.sidebarFooter}>
                    <UserMenu name={user.name} email={user.email} role={user.role} credits={user.credits} onUpgradeClick={user.onUpgradeClick} isDropup alignLeft compact={collapsed} />
                </div>
            </aside>

            <main className={styles.mainContent}>
                <header className={styles.mobileHeader}>
                    <Image src="/images/logo.png" alt="CNV" width={110} height={37} className={styles.mobileHeaderLogo} priority />
                </header>
                {children}
            </main>

            <MobileTabBar
                items={tabs.map(tab => ({ id: tab.id, label: tab.label, icon: iconComBolinha(tab) }))}
                primaryIds={primaryIds}
                activeId={activeId}
                onSelect={onSelect}
                user={{ name: user.name, email: user.email, role: user.role }}
            />
        </div>
    );
}
