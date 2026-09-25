'use client';

import { useEffect, useState } from 'react';
import { getSession } from 'next-auth/react';
import { BookOpen, Building2, CarFront, LayoutDashboard } from 'lucide-react';
import { VehicleConsultation } from '@/components/operator/VehicleConsultation';
import { CatalogVariationsManagement } from '@/components/admin/CatalogVariationsManagement';
import { ConcessionariasManagement } from '@/components/admin/ConcessionariasManagement';
import { VisaoGeralOperador } from '@/components/operacao/VisaoGeralOperador';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { ConfigContext } from '@/lib/contexts/ConfigContext';
import { useMargemConfig } from '@/lib/hooks/useMargemConfig';
import { useFeedback } from '@/components/ui/Feedback';

type Aba = 'visao-geral' | 'veiculos' | 'clientes' | 'catalogo';

const TABS = [
    { id: 'visao-geral', label: 'Visão geral', icon: <LayoutDashboard size={20} aria-hidden="true" /> },
    { id: 'veiculos', label: 'Veículos', icon: <CarFront size={20} aria-hidden="true" /> },
    { id: 'clientes', label: 'Concessionárias', icon: <Building2 size={20} aria-hidden="true" /> },
    { id: 'catalogo', label: 'Catálogo', icon: <BookOpen size={20} aria-hidden="true" /> },
];

/** Painel do operador: mesmas telas do admin, no recorte da carteira dele. */
export default function OperatorDashboard() {
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

    // Administrador que abre o painel do operador continua vendo como administrador.
    const perfil = usuario.profile === 'administrador' || usuario.profile === 'admin' ? usuario.profile : 'operador';

    return (
        <ConfigContext.Provider value={config}>
            <DashboardShell
                sectionLabel="Operação"
                tabs={TABS}
                activeId={aba}
                onSelect={id => setAba(id as Aba)}
                user={{ name: usuario.name || 'Operador', email: usuario.email ?? null, role: 'Operador' }}
            >
                {aba === 'visao-geral' && <VisaoGeralOperador />}
                {aba === 'veiculos' && <VehicleConsultation role={perfil as 'operador'} />}
                {aba === 'clientes' && <ConcessionariasManagement perfil={perfil === 'operador' ? 'operador' : 'admin'} />}
                {aba === 'catalogo' && <CatalogVariationsManagement />}
                {feedback}
            </DashboardShell>
        </ConfigContext.Provider>
    );
}
