'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { UpgradeModal } from '../../../components/operator/UpgradeModal';

interface FreeTrialGateProps {
    userInfo: {
        profile?: string | null;
        freeTrialExpiresAt?: string | null;
        freeTrialExpired?: boolean;
    };
}

function expiredByDate(expiresAt?: string | null) {
    if (!expiresAt) return false;
    const expiry = new Date(expiresAt).getTime();
    return Number.isFinite(expiry) && expiry <= Date.now();
}

export function FreeTrialGate({ userInfo }: FreeTrialGateProps) {
    const { update: updateSession } = useSession();
    const [expiresAt, setExpiresAt] = useState<string | null>(userInfo.freeTrialExpiresAt ?? null);
    const [expired, setExpired] = useState(Boolean(userInfo.freeTrialExpired || expiredByDate(userInfo.freeTrialExpiresAt)));

    useEffect(() => {
        // Wait until profile is known before acting
        if (!userInfo.profile) return;

        if (userInfo.profile !== 'gratis') {
            setExpired(false);
            setExpiresAt(null);
            return;
        }

        // JWT already says expired — lock immediately without waiting for API
        if (userInfo.freeTrialExpired || expiredByDate(userInfo.freeTrialExpiresAt)) {
            setExpired(true);
            setExpiresAt(userInfo.freeTrialExpiresAt ?? null);
            return;
        }

        let cancelled = false;

        fetch('/api/user/free-trial')
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (cancelled || !data?.isFreeClient) return;
                setExpiresAt(data.freeTrialExpiresAt ?? null);
                setExpired(Boolean(data.freeTrialExpired || expiredByDate(data.freeTrialExpiresAt)));
            })
            .catch(() => {
                setExpired(Boolean(userInfo.freeTrialExpired || expiredByDate(userInfo.freeTrialExpiresAt)));
                setExpiresAt(userInfo.freeTrialExpiresAt ?? null);
            });

        return () => {
            cancelled = true;
        };
    }, [userInfo.profile, userInfo.freeTrialExpired, userInfo.freeTrialExpiresAt]);

    useEffect(() => {
        if (userInfo.profile !== 'gratis' || expired || !expiresAt) return;

        const expiry = new Date(expiresAt).getTime();
        if (!Number.isFinite(expiry)) return;

        const remainingMs = Math.max(0, expiry - Date.now());
        const timer = window.setTimeout(() => {
            setExpired(true);
            updateSession({ freeTrialExpired: true });
        }, remainingMs);

        return () => window.clearTimeout(timer);
    }, [userInfo.profile, expired, expiresAt, updateSession]);

    if (userInfo.profile !== 'gratis' || !expired) return null;

    return (
        <UpgradeModal
            locked
            paidOnly
            onClose={() => undefined}
            title="Teste grátis encerrado"
            subtitle="Para continuar acessando a plataforma, escolha um plano e pague via PIX ou cartão de crédito."
        />
    );
}
