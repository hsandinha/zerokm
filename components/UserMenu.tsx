'use client';

import { useState, useRef, useEffect } from 'react';
import { signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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

    const handleSwitchProfile = async (newProfile: string) => {
        await update({ profile: newProfile });

        // Redirect based on new profile
        switch (newProfile) {
            case 'administrador':
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

    const allowedProfiles = (session?.user as any)?.allowedProfiles || [];
    const currentProfile = (session?.user as any)?.profile;

    const formatProfileName = (profile: string) => {
        switch (profile) {
            case 'administrador': return 'Administrador';
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

                    {allowedProfiles.length > 1 && (
                        <>
                            <div className={styles.divider} />
                            <div className={styles.menuLabel}>Trocar Perfil</div>
                            {allowedProfiles.map((profile: string) => (
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