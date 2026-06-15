'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { UpgradeModal } from '../../../components/operator/UpgradeModal';

/**
 * Quando a página é carregada com `?upgrade=1&plan=<id>&billing=<monthly|annual>`,
 * abre o UpgradeModal já com o plano pré-selecionado. Usado pelo fluxo de
 * cadastro/landing page para evitar redirecionar o usuário ao Checkout Pro
 * do Mercado Pago — em vez disso, usamos o modal in-app (Secure Fields PCI).
 */
export function AutoUpgradeFromQuery() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [planId, setPlanId] = useState<string | undefined>(undefined);
    const [billing, setBilling] = useState<'monthly' | 'annual' | undefined>(undefined);

    useEffect(() => {
        if (searchParams?.get('upgrade') === '1') {
            const p = searchParams.get('plan') || undefined;
            const b = searchParams.get('billing');
            setPlanId(p);
            setBilling(b === 'annual' ? 'annual' : b === 'monthly' ? 'monthly' : undefined);
            setOpen(true);
        }
    }, [searchParams]);

    if (!open) return null;

    return (
        <UpgradeModal
            initialPlanId={planId}
            initialBilling={billing}
            onClose={() => {
                setOpen(false);
                // Limpa a query string pra não reabrir em refresh.
                router.replace('/dashboard/cliente');
            }}
        />
    );
}
