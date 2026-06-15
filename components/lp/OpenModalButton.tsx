'use client';

import { useSession } from 'next-auth/react';

const PROFILE_ROUTES: Record<string, string> = {
    administrador: '/dashboard/admin',
    gerente: '/dashboard/admin',
    concessionaria: '/dashboard/dealership',
    operador: '/dashboard/operator',
    operator: '/dashboard/operator',
    administrativo: '/dashboard/administrativo',
    vendedor: '/dashboard/vendedor',
    cliente: '/dashboard/cliente',
    gratis: '/dashboard/cliente',
};

export function OpenModalButton({
    type,
    className,
    style,
    children,
    planId,
    billing,
}: {
    type: 'cliente' | 'concessionaria';
    className?: string;
    style?: React.CSSProperties;
    children: React.ReactNode;
    planId?: string;
    billing?: 'monthly' | 'annual';
}) {
    const { data: session, status } = useSession();

    function handleClick() {
        // Se já está autenticado e tem um plano selecionado pago, abrir o modal
        // de pagamento interno (in-app) ao invés de redirecionar para o MP.
        if (status === 'authenticated' && session?.user?.uid && planId) {
            const qs = new URLSearchParams({
                upgrade: '1',
                plan: planId,
                billing: billing ?? 'monthly',
            });
            window.location.href = `/dashboard/cliente?${qs.toString()}`;
            return;
        }

        // Se já está autenticado (sem plano selecionado), redireciona para o dashboard do perfil
        if (status === 'authenticated' && session?.user?.profile) {
            const profile = session.user.profile as string;
            const target = PROFILE_ROUTES[profile] ?? '/dashboard/operator';
            window.location.href = target;
            return;
        }

        // Não está logado → abre o modal de cadastro normalmente
        window.dispatchEvent(
            new CustomEvent('open-register', { detail: { type, planId, billing } })
        );
    }

    return (
        <button
            type="button"
            className={className}
            style={style}
            onClick={handleClick}
        >
            {children}
        </button>
    );
}
