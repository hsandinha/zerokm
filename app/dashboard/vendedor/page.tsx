'use client';

import { useEffect, useState } from 'react';
import { getSession } from 'next-auth/react';
import { Building2, CarFront, LayoutDashboard, Target } from 'lucide-react';
import { VehicleConsultation } from '@/components/operator/VehicleConsultation';
import { ConcessionariasManagement } from '@/components/admin/ConcessionariasManagement';
import { VisaoGeralVendedor } from '@/components/operacao/VisaoGeralVendedor';
import { ProspectsVendedor } from '@/components/operacao/ProspectsVendedor';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { ConfigContext } from '@/lib/contexts/ConfigContext';
import { useMargemConfig } from '@/lib/hooks/useMargemConfig';
import { useFeedback } from '@/components/ui/Feedback';

type Aba = 'visao-geral' | 'veiculos' | 'clientes' | 'prospects';

const TABS = [
    { id: 'visao-geral', label: 'Visão geral', icon: <LayoutDashboard size={20} aria-hidden="true" /> },
    { id: 'veiculos', label: 'Veículos', icon: <CarFront size={20} aria-hidden="true" /> },
    { id: 'clientes', label: 'Concessionárias', icon: <Building2 size={20} aria-hidden="true" /> },
    { id: 'prospects', label: 'Prospects', icon: <Target size={20} aria-hidden="true" /> },
];

/** Painel do vendedor: carteira, prospects e as telas compartilhadas da equipe. */
export default function VendedorDashboard() {
    const [aba, setAba] = useState<Aba>('visao-geral');
    const [usuario, setUsuario] = useState<{ name?: string | null; email?: string | null; profile?: string }>({});
    const { notify, feedback } = useFeedback();
    const config = useMargemConfig(notify);

    useEffect(() => {
        getSession()
            .then(session => {
                if (session?.user) setUsuario({ name: session.user.name, email: session.user.email, profile: session.user.profile });
            })
            .catch(error => console.error('Erro ao carregar sessão do usuário:', error));
    }, []);

    const perfil = (usuario.profile || 'vendedor') as 'vendedor';

    return (
        <ConfigContext.Provider value={config}>
            <DashboardShell
                sectionLabel="Vendas"
                tabs={TABS}
                activeId={aba}
                onSelect={id => setAba(id as Aba)}
                primaryIds={TABS.map(t => t.id)}
                user={{ name: usuario.name || 'Vendedor', email: usuario.email ?? null, role: 'Vendedor' }}
            >
                {aba === 'visao-geral' && <VisaoGeralVendedor />}
                {aba === 'veiculos' && <VehicleConsultation role={perfil} />}
                {aba === 'clientes' && <ConcessionariasManagement perfil="vendedor" />}
                {aba === 'prospects' && <ProspectsVendedor />}
                {feedback}
            </DashboardShell>
        </ConfigContext.Provider>
    );
}
