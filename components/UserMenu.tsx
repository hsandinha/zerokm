'use client';

import { useState, useRef, useEffect } from 'react';
import { signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import { UserRound, Repeat2, Sun, Moon, LogOut } from 'lucide-react';
import { useTheme } from '@/lib/contexts/ThemeContext';
import styles from './UserMenu.module.css';

interface UserMenuProps {
    compact?: boolean;
    name: string;
    email?: string | null;
    role: string;
    credits?: number;
    isDropup?: boolean;
    alignLeft?: boolean;
    onUpgradeClick?: () => void;
    /** Abre o perfil dentro do painel (sem sair da tela). Sem isso, vai para /dashboard/profile. */
    onProfileClick?: () => void;
    /** Itens extras do menu, logo abaixo de Meu Perfil (ex.: Financeiro do cliente). */
    extraItems?: UserMenuItem[];
}

export interface UserMenuItem {
    id: string;
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
}

function ProfileRing({ pct }: { pct: number }) {
    const size = 38;
    const r = 13;
    const circ = 2 * Math.PI * r;
    const offset = circ * (1 - pct / 100);
    const color =
        pct < 40 ? 'var(--color-negative)' : pct < 100 ? 'var(--color-warning)' : 'var(--color-positive)';
    const cx = size / 2;
    const cy = size / 2;
    return (
        <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className={styles.completionRing}
            aria-label={`Perfil ${pct}% completo`}
        >
            {/* track */}
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-highlight)" strokeWidth="3.5" />
            {/* progress */}
            <circle
                cx={cx} cy={cy} r={r}
                fill="none"
                stroke={color}
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeDasharray={circ}
                strokeDashoffset={offset}
                transform={`rotate(-90 ${cx} ${cy})`}
                style={{ transition: 'stroke-dashoffset 0.4s ease' }}
            />
            {/* label */}
            <text
                x={cx} y={cy + 3.5}
                textAnchor="middle"
                fontSize="9"
                fontWeight="700"
                fill={color}
                style={{ fontFamily: 'var(--font-sans)' }}
            >
                {pct}%
            </text>
        </svg>
    );
}

export default function UserMenu({ name, email, role, credits, isDropup, alignLeft, onUpgradeClick, onProfileClick, extraItems = [], compact = false }: UserMenuProps) {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const { data: session, update } = useSession();
    const { theme, toggleTheme } = useTheme();

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleLogout = async () => {
        await signOut({ callbackUrl: '/' });
    };

    const allowedProfiles = (session?.user as any)?.allowedProfiles || [];
    const currentProfile = (session?.user as any)?.profile;

    // Filter profiles to hide 'gerente' from the list (we use 'administrador' as the visible option)
    const visibleProfiles = allowedProfiles.filter((p: string) => {
        if (p === 'gerente') return false;
        return true;
    });

    const handleSwitchProfile = async (newProfile: string) => {
        let targetProfile = newProfile;

        // Se o usuário selecionou 'administrador' mas ele possui APENAS 'gerente' e não 'administrador', forçamos para 'gerente'
        if (newProfile === 'administrador' && allowedProfiles.includes('gerente') && !allowedProfiles.includes('administrador')) {
            targetProfile = 'gerente';
        }

        await update({ profile: targetProfile });

        // Usar window.location para evitar erro de RSC fetch
        const routes: Record<string, string> = {
            administrador: '/dashboard/admin',
            gerente: '/dashboard/admin',
            marketing: '/dashboard/admin',
            concessionaria: '/dashboard/dealership',
            operador: '/dashboard/operator',
            operator: '/dashboard/operator',
            administrativo: '/dashboard/administrativo',
            vendedor: '/dashboard/vendedor',
            cliente: '/dashboard/cliente',
            gratis: '/dashboard/cliente',
        };
        window.location.href = routes[targetProfile] ?? '/dashboard/operator';
        setIsOpen(false);
    };

    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map(n => n[0])
            .slice(0, 2)
            .join('')
            .toUpperCase();
    };

    const formatProfileName = (profile: string) => {
        switch (profile) {
            case 'administrador': return 'Administrador';
            case 'gerente': return 'Administrador';
            case 'marketing': return 'Marketing';
            case 'concessionaria': return 'Concessionária';
            case 'operador': return 'Operador';
            case 'administrativo': return 'Administrativo';
            case 'vendedor': return 'Vendedor';
            case 'cliente': return 'Cliente';
            case 'gratis': return 'Grátis';
            default: return profile;
        }
    };

    const profileCompletion: number = (session?.user as any)?.profileCompletion ?? 100;

    return (
        <div className={styles.container} ref={menuRef}>
            <div
                role="button"
                tabIndex={0}
                className={styles.trigger}
                onClick={() => setIsOpen(!isOpen)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsOpen(!isOpen); }
                }}
                aria-expanded={isOpen}
                aria-haspopup="true"
                aria-label={`Menu de ${name}`}
            >
                <div className={styles.userInfo} hidden={compact} style={compact ? { display: 'none' } : undefined}>
                    <span className={styles.userName}>{name}</span>
                    <span className={styles.userRole}>
                        {role}
                        {typeof credits === 'number' && credits > 0 && (
                            <span style={{
                                marginLeft: '6px',
                                background: '#1d4ed8',
                                color: '#fff',
                                borderRadius: '10px',
                                padding: '0 7px',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                verticalAlign: 'middle',
                            }}>
                                {credits} crédito{credits !== 1 ? 's' : ''}
                            </span>
                        )}
                    </span>
                    {onUpgradeClick && (
                        <div style={{ marginTop: '4px' }}>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onUpgradeClick();
                                }}
                                style={{
                                    background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '5px',
                                    padding: '4px 10px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700,
                                }}
                            >
                                Assinar Plano
                            </button>
                        </div>
                    )}
                </div>
                <div className={styles.avatar}>
                    {getInitials(name)}
                </div>
            </div>

            {isOpen && (
                <div className={`${styles.dropdown} ${isDropup ? styles.dropdownUp : ''} ${alignLeft ? styles.dropdownLeft : ''}`}>
                    {onProfileClick ? (
                        <button
                            type="button"
                            className={styles.menuItem}
                            onClick={() => { setIsOpen(false); onProfileClick(); }}
                        >
                            <span className={styles.menuItemIcon}><UserRound size={17} aria-hidden="true" /></span>
                            Meu Perfil
                            <ProfileRing pct={profileCompletion} />
                        </button>
                    ) : (
                        <Link
                            href="/dashboard/profile"
                            className={styles.menuItem}
                            onClick={() => setIsOpen(false)}
                        >
                            <span className={styles.menuItemIcon}><UserRound size={17} aria-hidden="true" /></span>
                            Meu Perfil
                            <ProfileRing pct={profileCompletion} />
                        </Link>
                    )}

                    {extraItems.map(item => (
                        <button
                            key={item.id}
                            type="button"
                            className={styles.menuItem}
                            onClick={() => { setIsOpen(false); item.onClick(); }}
                        >
                            <span className={styles.menuItemIcon}>{item.icon}</span>
                            {item.label}
                        </button>
                    ))}

                    {visibleProfiles.length > 1 && (
                        <>
                            <div className={styles.divider} />
                            <div className={styles.menuLabel}>Trocar Perfil</div>
                            {visibleProfiles.map((profile: string) => (
                                profile !== currentProfile && (
                                    <button
                                        key={profile}
                                        onClick={() => handleSwitchProfile(profile)}
                                        className={styles.menuItem}
                                    >
                                        <span className={styles.menuItemIcon}><Repeat2 size={17} aria-hidden="true" /></span>
                                        {formatProfileName(profile)}
                                    </button>
                                )
                            ))}
                        </>
                    )}

                    <div className={styles.divider} />

                    <button
                        onClick={toggleTheme}
                        className={styles.menuItem}
                    >
                        <span className={styles.menuItemIcon}>{theme === 'dark' ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}</span>
                        {theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
                    </button>

                    <div className={styles.divider} />

                    <button
                        onClick={handleLogout}
                        className={`${styles.menuItem} ${styles.logoutButton}`}
                    >
                        <span className={styles.menuItemIcon}><LogOut size={17} aria-hidden="true" /></span>
                        Sair
                    </button>
                </div>
            )}
        </div>
    );
}