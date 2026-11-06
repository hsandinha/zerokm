'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, ExternalLink, LogOut } from 'lucide-react';
import { signOut } from 'next-auth/react';
import { desligarAvisosDoAparelho } from '@wa/lib/push-aparelho';
import UserMenu, { type UserMenuItem } from '@/components/UserMenu';
import { MeuPerfil } from '@/components/profile/MeuPerfil';
import { MobileTabBar } from '@/components/mobile/MobileTabBar';
import { Page, PageHeader, PageTopbar, pageStyles } from '@/components/ui/Page';
import styles from './DashboardShell.module.css';

export { styles as shellStyles };

export interface ShellTab {
    id: string;
    label: string;
    icon: ReactNode;
    /** Contador sobre o ícone (ex.: ofertas novas em Favoritos). 0 ou ausente = sem bolinha. */
    badge?: number;
    /**
     * Itens da área que esta aba abre (ex.: Atendimento › Central, Funil...).
     * Aparecem logo abaixo dela, no mesmo menu lateral, quando ela ou um deles
     * está ativo: o menu nunca some ao entrar numa área com várias telas.
     */
    children?: ShellTab[];
}

export interface DashboardShellProps {
    /** Rótulo pequeno acima do menu (ex.: ADMINISTRAÇÃO, OPERAÇÃO, CONCESSIONÁRIA). */
    sectionLabel: string;
    tabs: ShellTab[];
    activeId: string;
    onSelect: (id: string) => void;
    user: {
        name: string;
        email?: string | null;
        role: string;
        credits?: number;
        onUpgradeClick?: () => void;
        /** Quem já tem uma aba "Meu perfil" (cliente) abre a própria; sem isso o shell abre o perfil no lugar do conteúdo. */
        onProfileClick?: () => void;
        /** Itens extras do menu do usuário (ex.: Financeiro). */
        menuItems?: UserMenuItem[];
    };
    /** Itens fixos da barra inferior no celular; os demais vão para "Mais". */
    primaryIds?: string[];
    /**
     * Trilha do topo além de "Seção › Aba" (ex.: ['Configurações', 'Frete']).
     * Sem isso a trilha é o rótulo da seção seguido do nome da aba ativa.
     */
    trail?: string[];
    /** Controles extras no topo, antes de "Ver site" (ex.: status do atendente, avisos). */
    topbarAside?: ReactNode;
    children: ReactNode;
}

/**
 * Estrutura padrão de todos os painéis da equipe (admin, gerente, marketing, operador,
 * vendedor, administrativo e concessionária): menu lateral azul-marinho que expande ao
 * passar o mouse, usuário no rodapé do menu e barra de abas inferior no celular.
 * O tema (claro/escuro) e os tokens vêm do layout de cada rota (AdminDesignLayout).
 */
export function DashboardShell({ sectionLabel, tabs, activeId, onSelect, user, primaryIds, trail, topbarAside, children }: DashboardShellProps) {
    const [collapsed, setCollapsed] = useState(true);
    // Perfil aberto dentro do painel: o menu lateral continua e o conteúdo da aba fica montado (só oculto).
    const [perfilAberto, setPerfilAberto] = useState(false);
    const abrirPerfil = user.onProfileClick ?? (() => setPerfilAberto(true));
    const selecionar = (id: string) => { setPerfilAberto(false); onSelect(id); };

    // /dashboard/profile redireciona para o painel com ?view=perfil.
    useEffect(() => {
        if (user.onProfileClick) return;
        const params = new URLSearchParams(window.location.search);
        if (params.get('view') !== 'perfil') return;
        setPerfilAberto(true);
        params.delete('view');
        const query = params.toString();
        window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
    }, [user.onProfileClick]);
    // Aba com subitens fica aberta quando ela ou um deles está ativo.
    const aberta = (tab: ShellTab) =>
        Boolean(tab.children?.length) && (tab.id === activeId || Boolean(tab.children?.some(c => c.id === activeId)));
    const paiAtivo = tabs.find(tab => tab.children?.some(c => c.id === activeId));
    // Caminho da tela no topo, igual à intranet Ângulo: Administração › Planos
    // (e Concessionária › Atendimento › Central numa área com subitens).
    const abaAtiva = tabs.find(tab => tab.id === activeId)?.label;
    const subAtiva = paiAtivo?.children?.find(c => c.id === activeId)?.label;
    const caminho = perfilAberto
        ? [sectionLabel, 'Meu perfil']
        : trail ?? [sectionLabel, ...(paiAtivo && subAtiva ? [paiAtivo.label, subAtiva] : abaAtiva ? [abaAtiva] : [])];
    // No celular a barra de baixo mostra os subitens da área aberta no lugar da aba-mãe.
    const itensDoCelular = tabs.flatMap(tab => (aberta(tab) ? tab.children ?? [] : [tab]));

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
                        {tabs.map(tab => {
                            const ativa = !perfilAberto && (activeId === tab.id || paiAtivo?.id === tab.id);
                            return (
                                <div key={tab.id} className={styles.sidebarGroup}>
                                    <button
                                        type="button"
                                        className={`${styles.sidebarItem} ${ativa ? styles.sidebarItemActive : ''}`}
                                        onClick={() => selecionar(tab.id)}
                                        title={tab.badge ? `${tab.label} (${tab.badge} ${tab.badge === 1 ? 'novidade' : 'novidades'})` : tab.label}
                                        aria-label={tab.badge ? `${tab.label}, ${tab.badge} ${tab.badge === 1 ? 'novidade' : 'novidades'}` : tab.label}
                                        aria-current={!perfilAberto && activeId === tab.id ? 'page' : undefined}
                                        aria-expanded={tab.children?.length ? aberta(tab) : undefined}
                                    >
                                        <span className={styles.sidebarItemIcon}>{iconComBolinha(tab)}</span>
                                        <span className={styles.sidebarItemLabel}>{tab.label}</span>
                                    </button>
                                    {aberta(tab) && (
                                        <div className={styles.sidebarSubNav} role="group" aria-label={tab.label}>
                                            {tab.children!.map(sub => {
                                                const subAtivo = !perfilAberto && activeId === sub.id;
                                                return (
                                                    <button
                                                        key={sub.id}
                                                        type="button"
                                                        className={`${styles.sidebarSubItem} ${subAtivo ? styles.sidebarSubItemActive : ''}`}
                                                        onClick={() => selecionar(sub.id)}
                                                        title={sub.badge ? `${sub.label} (${sub.badge})` : sub.label}
                                                        aria-label={sub.badge ? `${sub.label}, ${sub.badge}` : sub.label}
                                                        aria-current={subAtivo ? 'page' : undefined}
                                                    >
                                                        <span className={styles.sidebarItemIcon}>{iconComBolinha(sub)}</span>
                                                        <span className={styles.sidebarItemLabel}>{sub.label}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </nav>
                </div>

                <div className={styles.sidebarFooter}>
                    <UserMenu name={user.name} email={user.email} role={user.role} credits={user.credits} onUpgradeClick={user.onUpgradeClick} onProfileClick={abrirPerfil} extraItems={user.menuItems} isDropup alignLeft compact={collapsed} />
                    {/* Sair sempre à vista, sem depender do menu do usuário. */}
                    <button
                        type="button"
                        className={styles.sidebarLogout}
                        onClick={async () => {
                            // O aparelho para de receber os avisos do atendimento de quem saiu.
                            await desligarAvisosDoAparelho();
                            await signOut({ callbackUrl: '/' });
                        }}
                        title="Sair"
                        aria-label="Sair"
                    >
                        <LogOut size={18} aria-hidden="true" />
                        <span className={styles.sidebarItemLabel}>Sair</span>
                    </button>
                </div>
            </aside>

            <main className={styles.mainContent}>
                <header className={styles.mobileHeader}>
                    <Image src="/images/logo.png" alt="CNV" width={110} height={37} className={styles.mobileHeaderLogo} priority />
                </header>
                <PageTopbar
                    trail={caminho}
                    aside={(
                        <>
                            {topbarAside}
                            <a href="/" target="_blank" rel="noopener noreferrer" className={pageStyles.topbarLink}>
                                Ver site
                                <ExternalLink size={14} aria-hidden="true" />
                            </a>
                        </>
                    )}
                />
                {perfilAberto && (
                    <Page>
                        <PageHeader title="Meu perfil" description="Seus dados pessoais e endereço." />
                        <MeuPerfil />
                    </Page>
                )}
                <div hidden={perfilAberto} className={styles.shellContent}>{children}</div>
            </main>

            <MobileTabBar
                items={itensDoCelular.map(tab => ({ id: tab.id, label: tab.label, icon: iconComBolinha(tab) }))}
                primaryIds={primaryIds}
                activeId={perfilAberto ? '' : activeId}
                onSelect={selecionar}
                user={{ name: user.name, email: user.email, role: user.role }}
            />
        </div>
    );
}
