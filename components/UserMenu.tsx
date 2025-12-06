'use client';

import { useState, useRef, useEffect } from 'react';
import { signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/lib/contexts/ThemeContext';
import styles from './UserMenu.module.css';

interface UserMenuProps {
    name: string;
    email?: string | null;
    role: string;
}

export default function UserMenu({ name, email, role }: UserMenuProps) {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const { data: session, update } = useSession();
    const router = useRouter();
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

        // If user selects 'administrador' but is a 'gerente', force 'gerente' profile
        if (newProfile === 'administrador' && allowedProfiles.includes('gerente')) {
            targetProfile = 'gerente';
        }

        await update({ profile: targetProfile });

        // Redirect based on new profile
        switch (targetProfile) {
            case 'administrador':
            case 'gerente':
                router.push('/dashboard/admin');
                break;
            case 'concessionaria':
                router.push('/dashboard/dealership');
                break;
            case 'operador':
                router.push('/dashboard/operator');
                break;
            case 'cliente':
                router.push('/dashboard/cliente');
                break;
        }
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
            case 'concessionaria': return 'Concessionária';
            case 'operador': return 'Operador';
            case 'cliente': return 'Cliente';
            default: return profile;
        }
    };

    return (
        <div className={styles.container} ref={menuRef}>
            <button
                className={styles.trigger}
                onClick={() => setIsOpen(!isOpen)}
                aria-expanded={isOpen}
                aria-haspopup="true"
            >
                <div className={styles.userInfo}>
                    <span className={styles.userName}>{name}</span>
                    <span className={styles.userRole}>{role}</span>
                </div>
                <div className={styles.avatar}>
                    {getInitials(name)}
                </div>
            </button>

            {isOpen && (
                <div className={styles.dropdown}>
                    <Link
                        href="/dashboard/profile"
                        className={styles.menuItem}
                        onClick={() => setIsOpen(false)}
                    >
                        <span className={styles.menuItemIcon}>👤</span>
                        Meu Perfil
                    </Link>

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
                                        <span className={styles.menuItemIcon}>🔄</span>
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
                        <span className={styles.menuItemIcon}>{theme === 'dark' ? '☀️' : '🌙'}</span>
                        {theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
                    </button>

                    <div className={styles.divider} />

                    <button
                        onClick={handleLogout}
                        className={`${styles.menuItem} ${styles.logoutButton}`}
                    >
                        <span className={styles.menuItemIcon}>🚪</span>
                        Sair
                    </button>
                </div>
            )}
        </div>
    );
}