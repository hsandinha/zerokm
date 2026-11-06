"use client";

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { getSession } from 'next-auth/react';
import { UsersTable } from './users/UsersTable';
import { ConcessionariasManagement } from '../../../components/admin/ConcessionariasManagement';
import { TransportadorasManagement } from '../../../components/admin/TransportadorasManagement';
import { ConfigContext } from '../../../lib/contexts/ConfigContext';
import { PlansManagement } from '../../../components/settings/PlansManagement';
import { CRMManagement } from '../../../components/admin/CRMManagement';
import { CobrancasManagement } from '../../../components/admin/CobrancasManagement';
import { ConfiguracoesManagement } from '../../../components/admin/ConfiguracoesManagement';
import { BannersManagement } from '@/components/admin/BannersManagement';
import IntegrationsPanel from '@/components/admin/IntegrationsPanel';
import { VisaoGeralTab } from '../../../components/admin/VisaoGeralTab';
import { CatalogVariationsManagement } from '../../../components/admin/CatalogVariationsManagement';
import { AdminDealershipVehicles } from '../../../components/admin/AdminDealershipVehicles';
import KanbanBoard from '../../../components/crm/KanbanBoard';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { Page, pageStyles } from '@/components/ui/Page';
import { AvisosManagement } from '@/components/admin/AvisosManagement';
import { RecursosManagement } from '@/components/admin/RecursosManagement';
import { useRouter } from 'next/navigation';
import { ABAS_ADMIN, abasDoAdmin } from '@/components/dashboard/abas-dos-paineis';

const VehicleConsultation = dynamic<any>(
    () =>
        import('../../../components/operator/VehicleConsultation').then((mod) => ({ default: mod.VehicleConsultation })),
    {
        loading: () => (
            <Page wide>
                <p className={pageStyles.muted}>Carregando consulta de veículos...</p>
            </Page>
        ),
        ssr: false
    }
);

type TabType = 'visao-geral' | 'usuarios' | 'veiculos' | 'estoque-concessionarias' | 'catalogo' | 'concessionarias' | 'transportadoras' | 'margem' | 'configuracoes' | 'planos' | 'cobrancas' | 'crm' | 'funil' | 'integracoes' | 'banners' | 'avisos' | 'funcionalidades';

export default function AdminDashboard() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<TabType>('visao-geral');
    const [crmHighlightEmail, setCrmHighlightEmail] = useState<string | null>(null);
    const [margem, setMargem] = useState<number>(0);
    const [fixedMargin, setFixedMargin] = useState<number>(0);
    const [marginMode, setMarginMode] = useState<'percent' | 'fixed'>('percent');
    const [userInfo, setUserInfo] = useState<{ name?: string | null; email?: string | null; profile?: string }>({});
    useEffect(() => {
        const fetchMargem = async () => {
            try {
                const response = await fetch('/api/config/margem');
                if (response.ok) {
                    const data = await response.json();
                    setMargem(data.margem || 0);
                    setFixedMargin(data.fixedMargin || 0);
                    setMarginMode(data.marginMode === 'fixed' ? 'fixed' : 'percent');
                }
            } catch (error) {
                console.error('Erro ao carregar margem:', error);
                // Fallback para localStorage se API falhar
                const savedMargem = localStorage.getItem('vehicleMargem');
                if (savedMargem) {
                    setMargem(parseFloat(savedMargem));
                }
            }
        };
        fetchMargem();
    }, []);

    const updateMargem = async (newMargem: number, mode: 'percent' | 'fixed' = marginMode, newFixedMargin: number = fixedMargin) => {
        try {
            const response = await fetch('/api/config/margem', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ margem: newMargem, marginMode: mode, fixedMargin: newFixedMargin })
            });

            if (response.ok) {
                setMargem(newMargem);
                setFixedMargin(newFixedMargin);
                setMarginMode(mode);
                // Manter localStorage como backup
                localStorage.setItem('vehicleMargem', newMargem.toString());
            } else {
                console.error('Erro ao salvar margem na API');
                alert('Erro ao salvar margem. Tente novamente.');
            }
        } catch (error) {
            console.error('Erro ao atualizar margem:', error);
            alert('Erro ao salvar margem. Tente novamente.');
        }
    };

    // Vindo do WhatsApp (o mesmo menu lateral): abre a aba pedida.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const view = params.get('view');
        if (!view || !ABAS_ADMIN.some(t => t.id === view && !t.rota)) return;
        setActiveTab(view as TabType);
        params.delete('view');
        const query = params.toString();
        window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
    }, []);

    useEffect(() => {
        getSession()
            .then((session) => {
                if (session?.user) {
                    const profile = session.user.profile;
                    setUserInfo({
                        name: session.user.name ?? 'Administrador',
                        email: session.user.email ?? null,
                        profile,
                    });
                    if (profile === 'marketing') {
                        setActiveTab('funil');
                    }
                }
            })
            .catch((error) => {
                console.error('Erro ao carregar sessão do usuário:', error);
            });
    }, []);

    const allTabs = ABAS_ADMIN;
    const tabs = abasDoAdmin(userInfo.profile).map(({ rota: _rota, ...t }) => t);

    const abrirTab = (id: string) => {
        const destino = allTabs.find((t) => t.id === id)?.rota;
        if (destino) {
            router.push(destino);
            return;
        }
        setActiveTab(id as TabType);
    };

    const renderTabContent = () => {
        switch (activeTab) {
            case 'visao-geral':
                return <VisaoGeralTab userInfo={userInfo} />;
            case 'usuarios':
                return <UsersTable onViewInCRM={(email) => { setActiveTab('crm'); setCrmHighlightEmail(email); }} />;
            case 'veiculos':
                return <VehicleConsultation role={userInfo.profile as any || 'admin'} />;
            case 'estoque-concessionarias':
                return <AdminDealershipVehicles />;
            case 'catalogo':
                return <CatalogVariationsManagement />;
            case 'concessionarias':
                return <ConcessionariasManagement />;
            case 'transportadoras':
                return <TransportadorasManagement />;
            case 'configuracoes':
                return <ConfiguracoesManagement />;
            case 'planos':
                return <PlansManagement />;
            case 'cobrancas':
                return <CobrancasManagement />;
            case 'crm':
                return <CRMManagement highlightEmail={crmHighlightEmail} />;
            case 'funil':
                return <KanbanBoard />;
            case 'integracoes':
                return <IntegrationsPanel />;
            case 'banners':
                return <BannersManagement />;
            case 'avisos':
                return <AvisosManagement />;
            case 'funcionalidades':
                return <RecursosManagement />;
            default:
                return null;
        }
    };

    return (
        <ConfigContext.Provider value={{ margem, fixedMargin, marginMode, setMargem: (v: number) => updateMargem(v, marginMode, fixedMargin), setMarginConfig: ({ margem: v, marginMode: m, fixedMargin: f }) => updateMargem(v, m, f) }}>
            <DashboardShell
                sectionLabel="Administração"
                tabs={tabs}
                activeId={activeTab}
                onSelect={abrirTab}
                primaryIds={['visao-geral', 'veiculos', 'crm', 'usuarios']}
                user={{
                    name: userInfo.name || 'Administrador',
                    email: userInfo.email,
                    role: userInfo.profile === 'gerente' ? 'Gerente' : userInfo.profile === 'marketing' ? 'Marketing' : 'Administrador',
                }}
            >
                {renderTabContent()}
            </DashboardShell>
        </ConfigContext.Provider>
    );
}
