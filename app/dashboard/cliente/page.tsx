'use client';

import { useState, useEffect } from 'react';
import { signOut, getSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { VehicleConsultation } from '../../../components/operator/VehicleConsultation';
import { ConfigContext } from '../../../lib/contexts/ConfigContext';
import UserMenu from '../../../components/UserMenu';
import styles from './cliente.module.css';

export default function ClientDashboard() {
    const [userInfo, setUserInfo] = useState<{ name?: string | null; email?: string | null }>({});
    const [margem, setMargem] = useState<number>(0);
    const router = useRouter();

    useEffect(() => {
        getSession()
            .then((session) => {
                if (session?.user) {
                    setUserInfo({
                        name: session.user.name ?? 'Cliente',
                        email: session.user.email ?? null,
                    });
                }
            })
            .catch((error) => {
                console.error('Erro ao carregar sessão do usuário:', error);
            });

        // Carregar margem do localStorage (se aplicável para cliente, ou usar padrão)
        const savedMargem = localStorage.getItem('vehicleMargem');
        if (savedMargem) {
            setMargem(parseFloat(savedMargem));
        }
    }, []);

    return (
        <ConfigContext.Provider value={{ margem, setMargem }}>
            <div className={styles.container}>
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <h1>Zero KM</h1>
                        <span className={styles.subtitle}>Cliente</span>
                    </div>
                    <div className={styles.headerRight}>
                        <UserMenu
                            name={userInfo.name || 'Cliente'}
                            email={userInfo.email}
                            role="Cliente"
                        />
                    </div>
                </div>

                <div className={styles.content}>
                    <VehicleConsultation role="client" />
                </div>
            </div>
        </ConfigContext.Provider>
    );
}