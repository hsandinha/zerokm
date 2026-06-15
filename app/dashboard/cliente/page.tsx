'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSession, getSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { VehicleConsultation } from '../../../components/operator/VehicleConsultation';
import { ConfigContext } from '../../../lib/contexts/ConfigContext';
import UserMenu from '../../../components/UserMenu';
import { ExpirationAlerts } from './ExpirationAlerts';
import { AutoUpgradeFromQuery } from './AutoUpgradeFromQuery';
import { FreeTrialGate } from './FreeTrialGate';
import { SubscriptionControls } from './SubscriptionControls';
import { BannerCarouselHorizontal } from '../../../components/cliente/BannerCarouselHorizontal';
import styles from './cliente.module.css';

function PaymentBanner() {
    const searchParams = useSearchParams();
    const paymentStatus = searchParams?.get('payment') ?? null;
    const paymentId = searchParams?.get('payment_id') ?? null;
    const [visible, setVisible] = useState(!!paymentStatus);
    const [currentStatus, setCurrentStatus] = useState(paymentStatus);
    const router = useRouter();
    const { update: updateSession } = useSession();

    useEffect(() => {
        if (currentStatus === 'success') {
            // Update session profile and reload page
            const timer = setTimeout(async () => {
                await updateSession({ profile: 'cliente', allowedProfiles: ['cliente'] });
                window.location.href = '/dashboard/cliente';
            }, 3000);
            return () => clearTimeout(timer);
        }
        if (currentStatus === 'failure') {
            const timer = setTimeout(() => setVisible(false), 5000);
            return () => clearTimeout(timer);
        }
    }, [currentStatus, router]);

    // Polling: when pending + we have a paymentId, check for approval every 5s
    useEffect(() => {
        if (currentStatus !== 'pending' || !paymentId) return;

        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/checkout/status/${paymentId}`);
                const data = await res.json();
                if (data.status === 'approved') {
                    setCurrentStatus('success');
                    clearInterval(interval);
                }
            } catch { }
        }, 5000);

        // Stop polling after 30 min
        const timeout = setTimeout(() => {
            clearInterval(interval);
        }, 30 * 60 * 1000);

        return () => {
            clearInterval(interval);
            clearTimeout(timeout);
        };
    }, [currentStatus, paymentId]);

    if (!visible || !currentStatus) return null;

    const bannerConfig = {
        success: {
            bg: '#10b981',
            text: '✅ Pagamento aprovado! Atualizando seu acesso...',
        },
        failure: {
            bg: '#ef4444',
            text: '❌ Pagamento não aprovado. Tente novamente.',
        },
        pending: {
            bg: '#f59e0b',
            text: '⏳ Pagamento em análise. Verificando automaticamente...',
        },
    } as const;

    const config = bannerConfig[currentStatus as keyof typeof bannerConfig];
    if (!config) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            background: config.bg,
            color: '#fff',
            padding: '14px 24px',
            textAlign: 'center',
            fontWeight: 600,
            fontSize: '0.95rem',
            zIndex: 9999,
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}>
            {config.text}
        </div>
    );
}

export default function ClientDashboard() {
    const [userInfo, setUserInfo] = useState<{ name?: string | null; email?: string | null; profile?: string | null; credits?: number; daysUntilExpiry?: number | null; subscriptionPlanId?: string | null; subscriptionExpiresAt?: string | null; subscriptionBillingType?: 'monthly' | 'annual' | null; freeTrialExpiresAt?: string | null; freeTrialExpired?: boolean }>({});
    const [margem, setMargem] = useState<number>(0);
    const [fixedMargin, setFixedMargin] = useState<number>(0);
    const [marginMode, setMarginMode] = useState<'percent' | 'fixed'>('percent');
    const [isInvitee, setIsInvitee] = useState<boolean>(false);
    const router = useRouter();

    useEffect(() => {
        getSession()
            .then((session) => {
                if (session?.user) {
                    setUserInfo({
                        name: session.user.name ?? 'Cliente',
                        email: session.user.email ?? null,
                        profile: session.user.profile ?? null,
                        credits: (session.user as any).credits ?? 0,
                        daysUntilExpiry: (session.user as any).daysUntilExpiry ?? null,
                        subscriptionPlanId: (session.user as any).subscriptionPlanId ?? null,
                        subscriptionExpiresAt: (session.user as any).subscriptionExpiresAt ?? null,
                        subscriptionBillingType: (session.user as any).subscriptionBillingType ?? null,
                        freeTrialExpiresAt: (session.user as any).freeTrialExpiresAt ?? null,
                        freeTrialExpired: (session.user as any).freeTrialExpired ?? false,
                    });
                }
            })
            .catch((error) => {
                console.error('Erro ao carregar sessão do usuário:', error);
            });

        // Carregar margem do backend
        fetch('/api/dashboard/client/margin')
            .then(res => res.json())
            .then(data => {
                if (!data.error) {
                    setMargem(data.margem || 0);
                    setFixedMargin(data.fixedMargin || 0);
                    setMarginMode(data.marginMode || 'percent');
                    setIsInvitee(data.isInvitee || false);
                }
            })
            .catch(err => console.error('Erro ao carregar margem:', err));
    }, []);

    const updateClientMargin = async ({ margem: v, marginMode: m, fixedMargin: f }: { margem: number; marginMode: 'percent' | 'fixed'; fixedMargin: number }) => {
        setMargem(v);
        setFixedMargin(f);
        setMarginMode(m);

        try {
            await fetch('/api/dashboard/client/margin', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ margem: v, marginMode: m, fixedMargin: f })
            });
        } catch (err) {
            console.error('Erro ao salvar margem', err);
        }
    };

    return (
        <ConfigContext.Provider value={{ margem, fixedMargin, marginMode, setMargem: (v: number) => updateClientMargin({ margem: v, marginMode, fixedMargin }), setMarginConfig: updateClientMargin }}>
            <Suspense>
                <PaymentBanner />
            </Suspense>
            <ExpirationAlerts userInfo={userInfo} />
            <Suspense>
                <AutoUpgradeFromQuery />
            </Suspense>
            <FreeTrialGate userInfo={userInfo} />
            <div className={styles.container}>
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <Image
                            src="/images/logo.png"
                            alt="Logo"
                            width={240}
                            height={80}
                            className={styles.logo}
                            priority
                        />
                    </div>
                    
                    <div style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: '0 1rem' }}>
                        <div style={{ width: '100%', maxWidth: '750px', height: '80px', marginTop: '-25px' }}>
                            <BannerCarouselHorizontal />
                        </div>
                    </div>

                    <div className={styles.headerRight}>
                        <UserMenu
                            name={userInfo.name || 'Cliente'}
                            email={userInfo.email}
                            role={userInfo.profile === 'gratis' ? 'Grátis' : 'Cliente'}
                            credits={userInfo.credits}
                        />
                    </div>
                </div>

                <div className={styles.content}>
                    <SubscriptionControls />
                    <VehicleConsultation role={userInfo.profile === 'gratis' ? 'gratis' : 'client'} isInvitee={isInvitee} />
                </div>
            </div>
        </ConfigContext.Provider>
    );
}
