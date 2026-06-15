'use client';

import { useEffect, useState } from 'react';

type SubscriptionInfo = {
    planName: string | null;
    status: string | null;
    billingType: 'monthly' | 'annual' | null;
    activationMethod: 'card' | 'pix' | 'boleto' | 'manual' | 'cortesia' | null;
    expiresAt: string | null;
    nextPaymentDate: string | null;
    mpPreapprovalStatus: string | null;
    recurrenceCancelledAt: string | null;
    canCancel: boolean;
};

function formatDate(value: string | null): string {
    if (!value) return '';
    return new Date(value).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
}

export function SubscriptionControls() {
    const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [cancelling, setCancelling] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;

        fetch('/api/user/subscription')
            .then(res => res.json())
            .then(data => {
                if (cancelled) return;
                if (data?.subscription) setSubscription(data.subscription);
            })
            .catch(() => {
                if (!cancelled) setError('Não foi possível carregar sua assinatura.');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const cancelSubscription = async () => {
        if (!subscription?.canCancel || cancelling) return;

        const confirmed = window.confirm(
            'Cancelar a cobrança recorrente no cartão? Seu acesso continuará ativo até o fim do período já pago.'
        );
        if (!confirmed) return;

        setCancelling(true);
        setError('');
        setMessage('');

        try {
            const res = await fetch('/api/user/subscription/cancel', { method: 'POST' });
            const data = await res.json();

            if (!res.ok || !data.ok) {
                setError(data.error || 'Não foi possível cancelar a assinatura.');
                return;
            }

            setSubscription(prev => prev
                ? {
                    ...prev,
                    canCancel: false,
                    mpPreapprovalStatus: data.status || 'cancelled',
                    recurrenceCancelledAt: new Date().toISOString(),
                }
                : prev
            );
            setMessage(
                data.accessUntil
                    ? `Recorrência cancelada. Seu acesso continua ativo até ${formatDate(data.accessUntil)}.`
                    : 'Recorrência cancelada.'
            );
        } catch {
            setError('Erro de conexão ao cancelar assinatura.');
        } finally {
            setCancelling(false);
        }
    };

    if (loading || !subscription) return null;
    if (subscription.activationMethod !== 'card' && subscription.activationMethod !== 'boleto' && !subscription.recurrenceCancelledAt) return null;

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            margin: '0 0 16px',
            padding: '12px 14px',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '8px',
            background: 'rgba(255,255,255,0.04)',
            color: 'var(--color-text)',
            flexWrap: 'wrap',
        }}>
            <div style={{ minWidth: 220 }}>
                <div style={{ fontSize: '0.92rem', fontWeight: 700 }}>
                    {subscription.planName || 'Assinatura'}
                    {subscription.billingType && (
                        <span style={{ fontWeight: 500, color: 'var(--color-text-muted)' }}>
                            {' '}({subscription.billingType === 'annual' ? 'Anual' : 'Mensal'})
                        </span>
                    )}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                    {subscription.activationMethod === 'boleto'
                        ? `Renovação por boleto${subscription.expiresAt ? ` · acesso até ${formatDate(subscription.expiresAt)}` : ''}`
                        : subscription.canCancel
                            ? `Cobrança recorrente no cartão ativa${subscription.nextPaymentDate ? ` · próxima cobrança ${formatDate(subscription.nextPaymentDate)}` : ''}`
                            : `Recorrência cancelada${subscription.expiresAt ? ` · acesso até ${formatDate(subscription.expiresAt)}` : ''}`}
                </div>
                {(message || error) && (
                    <div style={{
                        fontSize: '0.8rem',
                        marginTop: 6,
                        color: error ? '#ef4444' : '#10b981',
                    }}>
                        {error || message}
                    </div>
                )}
            </div>

            {subscription.canCancel && (
                <button
                    type="button"
                    onClick={cancelSubscription}
                    disabled={cancelling}
                    style={{
                        border: '1px solid rgba(239,68,68,0.45)',
                        color: '#ef4444',
                        background: 'transparent',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        cursor: cancelling ? 'not-allowed' : 'pointer',
                        opacity: cancelling ? 0.65 : 1,
                        fontWeight: 700,
                    }}
                >
                    {cancelling ? 'Cancelando...' : 'Cancelar recorrência'}
                </button>
            )}
        </div>
    );
}
