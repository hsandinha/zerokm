'use client';

import { useEffect, useState } from 'react';
import { getSession } from 'next-auth/react';
import { Building2, CarFront, CircleCheck, Clock, ContactRound, Images, LayoutDashboard, Plus, Tag, TriangleAlert } from 'lucide-react';
import { VehicleConsultation } from '@/components/operator/VehicleConsultation';
import KanbanBoard from '@/components/crm/KanbanBoard';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { MeusAnuncios } from '@/components/dealership/MeusAnuncios';
import { DealerInventory } from '@/components/dealership/DealerInventory';
import { StockReminderModal } from '@/components/dealership/StockReminderModal';
import { ConfigContext } from '@/lib/contexts/ConfigContext';
import { Concessionaria } from '@/lib/services/concessionariaService';
import { Button, EmptyState, Page, PageHeader, SectionCard, StatCard, StatGrid, pageStyles } from '@/components/ui/Page';
import { InlineNotice } from '@/components/ui/Feedback';

type Aba = 'visao-geral' | 'veiculos' | 'precos' | 'perfil' | 'crm' | 'anuncios';

interface DealershipMetrics {
    veiculosCadastrados: number;
    daysSinceUpdate: number;
    statusBreakdown?: { verde: number; amarelo: number; vermelho: number };
    chartData: { label: string; value: number }[];
}

const TABS = [
    { id: 'visao-geral', label: 'Visão geral', icon: <LayoutDashboard size={20} aria-hidden="true" /> },
    { id: 'veiculos', label: 'Meus veículos', icon: <CarFront size={20} aria-hidden="true" /> },
    { id: 'precos', label: 'Estoque e preços', icon: <Tag size={20} aria-hidden="true" /> },
    { id: 'perfil', label: 'Meu perfil', icon: <Building2 size={20} aria-hidden="true" /> },
    { id: 'crm', label: 'CRM', icon: <ContactRound size={20} aria-hidden="true" /> },
    { id: 'anuncios', label: 'Meus anúncios', icon: <Images size={20} aria-hidden="true" /> },
];

// Concessionária não usa margem: a consulta mostra o preço da própria loja.
const SEM_MARGEM = { margem: 0, fixedMargin: 0, marginMode: 'percent' as const, setMargem: () => { }, setMarginConfig: () => { } };

export default function DealershipDashboard() {
    const [aba, setAba] = useState<Aba>('visao-geral');
    const [usuario, setUsuario] = useState<{ name?: string | null; email?: string | null }>({});

    useEffect(() => {
        getSession()
            .then(session => { if (session?.user) setUsuario({ name: session.user.name, email: session.user.email }); })
            .catch(() => { });
    }, []);

    return (
        <ConfigContext.Provider value={SEM_MARGEM}>
            <DashboardShell
                sectionLabel="Concessionária"
                tabs={TABS}
                activeId={aba}
                onSelect={id => setAba(id as Aba)}
                primaryIds={['visao-geral', 'veiculos', 'precos', 'crm']}
                user={{ name: usuario.name || 'Concessionária', email: usuario.email, role: 'Concessionária' }}
            >
                <StockReminderModal onUpdateStock={() => setAba('precos')} />
                {aba === 'visao-geral' && <VisaoGeral onAtualizar={() => setAba('precos')} />}
                {aba === 'veiculos' && <VehicleConsultation role="dealership" />}
                {aba === 'precos' && (
                    <Page wide>
                        <PageHeader title="Estoque e preços" description="Preço e quantidade dos seus 0KM sobre o catálogo da CNV, e os usados do repasse." />
                        <DealerInventory />
                    </Page>
                )}
                {aba === 'crm' && <KanbanBoard />}
                {aba === 'perfil' && <PerfilLoja onCadastrarVeiculo={() => setAba('precos')} />}
                {aba === 'anuncios' && <MeusAnuncios />}
            </DashboardShell>
        </ConfigContext.Provider>
    );
}

/** Situação do estoque pelo tempo sem atualizar: em dia até 1 dia, atenção até 3, depois crítico. */
function situacaoEstoque(dias: number) {
    if (dias <= 1) return { tone: 'positive' as const, texto: 'Estoque em dia' };
    if (dias <= 3) return { tone: 'warning' as const, texto: 'Atualize o estoque' };
    return { tone: 'negative' as const, texto: 'Estoque desatualizado' };
}

function VisaoGeral({ onAtualizar }: { onAtualizar: () => void }) {
    const [m, setM] = useState<DealershipMetrics | null>(null);
    const [erro, setErro] = useState(false);

    useEffect(() => {
        fetch('/api/dealership/metrics')
            .then(res => (res.ok ? res.json() : Promise.reject()))
            .then(setM)
            .catch(() => setErro(true));
    }, []);

    const s = m ? situacaoEstoque(m.daysSinceUpdate) : null;
    const grafico = m?.chartData ?? [];
    const max = Math.max(10, ...grafico.map(d => d.value));
    const b = m?.statusBreakdown;

    return (
        <Page>
            <PageHeader
                title="Visão geral"
                description="Seu estoque na CNV e há quanto tempo ele foi atualizado."
                actions={<Button variant="primary" icon={<Tag size={16} aria-hidden="true" />} onClick={onAtualizar}>Atualizar estoque</Button>}
            />
            {erro && <InlineNotice>Não foi possível carregar os indicadores. Atualize a página.</InlineNotice>}

            <StatGrid>
                <StatCard label="Veículos cadastrados" icon={<CarFront size={18} />} value={m ? m.veiculosCadastrados.toLocaleString('pt-BR') : '-'} caption="Total no seu estoque" />
                <StatCard
                    label="Última atualização"
                    icon={<Clock size={18} />}
                    tone={s?.tone ?? 'default'}
                    value={m ? (m.daysSinceUpdate === 0 ? 'Hoje' : `${m.daysSinceUpdate} ${m.daysSinceUpdate === 1 ? 'dia' : 'dias'}`) : '-'}
                    caption={s?.texto ?? 'Carregando'}
                />
                <StatCard label="Preços em dia" icon={<CircleCheck size={18} />} tone="positive" value={b ? b.verde : '-'} caption="Veículos atualizados recentemente" />
                <StatCard
                    label="Precisam de revisão"
                    icon={<TriangleAlert size={18} />}
                    tone={b && b.vermelho > 0 ? 'negative' : b && b.amarelo > 0 ? 'warning' : 'default'}
                    value={b ? b.amarelo + b.vermelho : '-'}
                    caption={b ? `${b.amarelo} em atenção · ${b.vermelho} desatualizados` : 'Carregando'}
                />
            </StatGrid>

            <SectionCard title="Evolução do estoque" description="Quantidade de veículos cadastrados em cada período.">
                {grafico.length === 0
                    ? <p className={pageStyles.muted}>{m ? 'Ainda não há histórico suficiente.' : 'Carregando...'}</p>
                    : (
                        <div className={pageStyles.columnChart} role="img" aria-label={`Evolução do estoque: ${grafico.map(d => `${d.label} ${d.value}`).join(', ')}`}>
                            {grafico.map(d => (
                                <div key={d.label} className={pageStyles.columnChartItem}>
                                    <span className={pageStyles.columnChartValue}>{d.value}</span>
                                    <span className={pageStyles.columnChartBar} style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }} />
                                    <span className={pageStyles.columnChartLabel}>{d.label}</span>
                                </div>
                            ))}
                        </div>
                    )}
            </SectionCard>
        </Page>
    );
}

function PerfilLoja({ onCadastrarVeiculo }: { onCadastrarVeiculo: () => void }) {
    const [p, setP] = useState<Concessionaria | null>(null);
    const [estado, setEstado] = useState<'carregando' | 'ok' | 'erro'>('carregando');

    useEffect(() => {
        fetch('/api/dealership/profile')
            .then(res => (res.ok ? res.json() : Promise.reject()))
            .then(data => { setP(data); setEstado('ok'); })
            .catch(() => setEstado('erro'));
    }, []);

    const endereco = p ? [[p.endereco, p.numero].filter(Boolean).join(', '), p.complemento, p.bairro, [p.cidade, p.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ') : '';
    const fatos: [string, string | undefined][] = p ? [
        ['Razão social', p.razaoSocial], ['CNPJ', p.cnpj], ['Telefone', p.telefone || p.celular], ['E-mail', p.email],
        ['Responsável', p.nomeResponsavel], ['Telefone do responsável', p.telefoneResponsavel], ['Endereço', endereco],
    ] : [];

    return (
        <Page>
            <PageHeader
                title="Meu perfil"
                description="Dados da loja na CNV. Para corrigir alguma informação, fale com o seu operador."
                actions={<Button variant="primary" icon={<Plus size={16} aria-hidden="true" />} onClick={onCadastrarVeiculo}>Cadastrar veículo</Button>}
            />
            {estado === 'erro' && <EmptyState icon={<Building2 size={20} />} title="Perfil indisponível" description="Não foi possível carregar os dados da loja. Atualize a página." />}
            {estado === 'carregando' && <p className={pageStyles.muted}>Carregando dados da loja...</p>}
            {p && (
                <SectionCard title={p.nome || 'Concessionária'} description={[p.cidade, p.uf].filter(Boolean).join(', ')}>
                    <dl className={pageStyles.facts}>
                        {fatos.map(([rotulo, valor]) => (
                            <div key={rotulo} className={pageStyles.fact}>
                                <dt>{rotulo}</dt>
                                <dd>{valor || <span className={pageStyles.muted}>Não informado</span>}</dd>
                            </div>
                        ))}
                    </dl>
                </SectionCard>
            )}
        </Page>
    );
}
