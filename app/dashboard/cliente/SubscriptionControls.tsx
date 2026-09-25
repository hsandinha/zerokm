'use client';

import { useEffect, useState } from 'react';
import { CreditCard, Receipt } from 'lucide-react';
import { Button, Callout } from '@/components/ui/Page';
import { useFeedback } from '@/components/ui/Feedback';

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
    const { confirm, notify, feedback } = useFeedback();

    useEffect(() => {
        let cancelled = false;

        fetch('/api/user/subscription')
            .then(res => res.json())
            .then(data => {
                if (cancelled) return;
                if (data?.subscription) setSubscription(data.subscription);
            })
            .catch(() => {
                if (!cancelled) setSubscription(null);
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

        const confirmed = await confirm({
            title: 'Cancelar a cobrança recorrente?',
            description: 'O cartão deixa de ser cobrado todo mês. Seu acesso continua ativo até o fim do período já pago.',
            confirmLabel: 'Cancelar recorrência',
            cancelLabel: 'Manter',
            danger: true,
        });
        if (!confirmed) return;

        setCancelling(true);

        try {
            const res = await fetch('/api/user/subscription/cancel', { method: 'POST' });
            const data = await res.json();

            if (!res.ok || !data.ok) {
                notify(data.error || 'Não foi possível cancelar a assinatura.');
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
            notify(
                data.accessUntil
                    ? `Recorrência cancelada. Seu acesso continua ativo até ${formatDate(data.accessUntil)}.`
                    : 'Recorrência cancelada.',
                'positive',
            );
        } catch {
            notify('Erro de conexão ao cancelar a assinatura.');
        } finally {
            setCancelling(false);
        }
    };

    if (loading || !subscription) return null;
    if (subscription.activationMethod !== 'card' && subscription.activationMethod !== 'boleto' && !subscription.recurrenceCancelledAt) return null;

    const plano = `${subscription.planName || 'Assinatura'}${subscription.billingType ? ` ${subscription.billingType === 'annual' ? 'anual' : 'mensal'}` : ''}`;
    const detalhe = subscription.activationMethod === 'boleto'
        ? `Renovação por boleto${subscription.expiresAt ? `. Acesso até ${formatDate(subscription.expiresAt)}.` : '.'}`
        : subscription.canCancel
            ? `Cobrança recorrente no cartão${subscription.nextPaymentDate ? `. Próxima cobrança em ${formatDate(subscription.nextPaymentDate)}.` : '.'}`
            : `Recorrência cancelada${subscription.expiresAt ? `. Acesso até ${formatDate(subscription.expiresAt)}.` : '.'}`;

    return (
        <>
            <Callout
                icon={subscription.activationMethod === 'boleto' ? <Receipt size={18} aria-hidden="true" /> : <CreditCard size={18} aria-hidden="true" />}
                title={plano}
                action={subscription.canCancel
                    ? <Button variant="danger" onClick={cancelSubscription} disabled={cancelling}>{cancelling ? 'Cancelando...' : 'Cancelar recorrência'}</Button>
                    : undefined}
            >
                {detalhe}
            </Callout>
            {feedback}
        </>
    );
}
