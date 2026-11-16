'use client';

import { useState, useEffect } from 'react';
import { getSession } from 'next-auth/react';
import { VehicleConsultation } from '../../../components/operator/VehicleConsultation';
import { ConfigContext } from '../../../lib/contexts/ConfigContext';
import { UsersTable } from '../admin/users/UsersTable';
import { ConcessionariasManagement } from '../../../components/admin/ConcessionariasManagement';
import { TransportadorasManagement } from '../../../components/admin/TransportadorasManagement';
import { BannersManagement } from '../../../components/admin/BannersManagement';
import { CatalogVariationsManagement } from '../../../components/admin/CatalogVariationsManagement';
import { AdminDealershipVehicles } from '../../../components/admin/AdminDealershipVehicles';
import { DashboardShell, shellStyles } from '@/components/dashboard/DashboardShell';
import { CarFront, Warehouse, BookOpen, Building2, Truck, Users, Images, Megaphone } from 'lucide-react';
import { AvisosManagement } from '../../../components/admin/AvisosManagement';
import { faixasSalvas, type FaixaDeMargem } from '@/lib/utils/margem';

type TabType = 'veiculos' | 'estoque-concessionarias' | 'catalogo' | 'concessionarias' | 'transportadoras' | 'usuarios' | 'banners' | 'avisos';

// ----------------------------------------------------------------
// Dashboard principal do Administrativo
// ----------------------------------------------------------------
export default function AdministrativoDashboard() {
    const [activeTab, setActiveTab] = useState<TabType>('veiculos');
    const [margem, setMargem] = useState(0);
    const [fixedMargin, setFixedMargin] = useState(0);
    const [marginMode, setMarginMode] = useState<'percent' | 'fixed'>('percent');
    const [faixas, setFaixas] = useState<FaixaDeMargem[]>([]);
    const [userInfo, setUserInfo] = useState<{ name?: string | null; email?: string | null; profile?: string }>({});

    // Carregar margem
    useEffect(() => {
        fetch('/api/config/margem')
            .then(r => r.json())
            .then(data => {
                setMargem(data.margem || 0);
                setFixedMargin(data.fixedMargin || 0);
                setMarginMode(data.marginMode === 'fixed' ? 'fixed' : 'percent');
                setFaixas(faixasSalvas(data.faixas));
            })
            .catch(() => { });
    }, []);

    // Verificar sessão
    useEffect(() => {
        getSession().then(session => {
            if (!session?.user) { window.location.replace('/login'); return; }
            const profile = session.user.profile as string;
            if (profile !== 'administrativo' && profile !== 'administrador' && profile !== 'admin') {
                window.location.replace('/dashboard/operator');
                return;
            }
            setUserInfo({ name: session.user.name, email: session.user.email, profile });
        });
    }, []);

    const updateMargem = async (v: number, mode = marginMode, fm = fixedMargin, fx?: FaixaDeMargem[]) => {
        const res = await fetch('/api/config/margem', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ margem: v, marginMode: mode, fixedMargin: fm, ...(fx ? { faixas: fx } : {}) }),
        });
        // Só troca o que a tela mostra quando o servidor aceitou.
        if (!res.ok) return;
        setMargem(v); setFixedMargin(fm); setMarginMode(mode);
        if (fx) setFaixas(faixasSalvas(fx));
    };

    const effectiveRole = (userInfo.profile as any) || 'administrativo';

    const tabs = [
        { id: 'veiculos', label: 'Veículos', icon: <CarFront size={20} aria-hidden="true" /> },
        { id: 'estoque-concessionarias', label: 'Estoque', icon: <Warehouse size={20} aria-hidden="true" /> },
        { id: 'catalogo', label: 'Catálogo', icon: <BookOpen size={20} aria-hidden="true" /> },
        { id: 'concessionarias', label: 'Concessionárias', icon: <Building2 size={20} aria-hidden="true" /> },
        { id: 'transportadoras', label: 'Frete', icon: <Truck size={20} aria-hidden="true" /> },
        { id: 'usuarios', label: 'Equipe', icon: <Users size={20} aria-hidden="true" /> },
        { id: 'banners', label: 'Banners', icon: <Images size={20} aria-hidden="true" /> },
        { id: 'avisos', label: 'Avisos', icon: <Megaphone size={20} aria-hidden="true" /> },
    ];

    // Telas que já montam a própria página (components/ui/Page) ou ocupam a tela toda.
    const SEM_MOLDURA = new Set(['veiculos', 'usuarios', 'concessionarias', 'banners', 'estoque-concessionarias', 'catalogo', 'transportadoras', 'avisos']);

    const renderContent = () => {
        switch (activeTab) {
            case 'veiculos': return <VehicleConsultation role={effectiveRole} showBanners />;
            case 'estoque-concessionarias': return <AdminDealershipVehicles />;
            case 'catalogo': return <CatalogVariationsManagement />;
            case 'concessionarias': return <ConcessionariasManagement />;
            case 'transportadoras': return <TransportadorasManagement />;
            case 'usuarios': return <UsersTable restrictedProfiles={['administrador']} destinos={{ concessionarias: () => setActiveTab('concessionarias') }} />;
            case 'banners': return <BannersManagement />;
            case 'avisos': return <AvisosManagement />;
        }
    };

    return (
        <ConfigContext.Provider value={{
            margem,
            fixedMargin,
            marginMode,
            faixas,
            setMargem: (v) => updateMargem(v, marginMode, fixedMargin),
            setMarginConfig: ({ margem: v, marginMode: m, fixedMargin: f, faixas: fx }) => updateMargem(v, m, f, fx),
        }}>
            <DashboardShell
                sectionLabel="Administrativo"
                tabs={tabs}
                activeId={activeTab}
                onSelect={id => setActiveTab(id as TabType)}
                primaryIds={['veiculos', 'estoque-concessionarias', 'concessionarias', 'usuarios']}
                user={{ name: userInfo.name ?? 'Administrativo', email: userInfo.email, role: 'Administrativo' }}
            >
                {/* A Consulta de veículos ocupa a tela toda, como no admin. */}
                {SEM_MOLDURA.has(activeTab) ? renderContent() : <div className={shellStyles.contentArea}>{renderContent()}</div>}
            </DashboardShell>
        </ConfigContext.Provider>
    );
}
