'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from 'next-auth/react';
import { MeuPerfil } from '@/components/profile/MeuPerfil';

const DASHBOARD_ROUTE: Record<string, string> = {
    administrador: '/dashboard/admin',
    gerente: '/dashboard/admin',
    marketing: '/dashboard/admin',
    operador: '/dashboard/operator',
    operator: '/dashboard/operator',
    administrativo: '/dashboard/administrativo',
    vendedor: '/dashboard/vendedor',
    concessionaria: '/dashboard/dealership',
    cliente: '/dashboard/cliente',
    gratis: '/dashboard/cliente',
};

/**
 * Meu perfil agora abre dentro de cada painel, com o menu lateral à vista.
 * Esta rota fica para links antigos (e-mails, celular): leva ao painel do
 * perfil ativo já com o Meu perfil aberto.
 */
export default function ProfilePage() {
    const router = useRouter();
    const [semPainel, setSemPainel] = useState(false);

    useEffect(() => {
        getSession().then(session => {
            const rota = DASHBOARD_ROUTE[(session?.user as any)?.profile ?? ''];
            if (rota) router.replace(`${rota}?view=perfil`);
            else setSemPainel(true);
        });
    }, [router]);

    if (!semPainel) return null;
    return (
        <main style={{ maxWidth: 960, margin: '0 auto', padding: 32 }}>
            <h1 style={{ margin: '0 0 16px' }}>Meu perfil</h1>
            <MeuPerfil />
        </main>
    );
}
