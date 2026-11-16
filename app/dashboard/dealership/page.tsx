'use client';

import { useEffect, useState } from 'react';
import { getSession } from 'next-auth/react';
import { Building2, CarFront, CircleCheck, Clock, Plus, Tag, TriangleAlert } from 'lucide-react';
import { VehicleConsultation } from '@/components/operator/VehicleConsultation';
import KanbanBoard from '@/components/crm/KanbanBoard';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { MeusAnuncios } from '@/components/dealership/MeusAnuncios';
import { CobrancasDaLoja } from '@/components/dealership/CobrancasDaLoja';
import { DealerInventory } from '@/components/dealership/DealerInventory';
import { StockReminderModal, confirmarEstoqueDaLoja } from '@/components/dealership/StockReminderModal';
import { AvisosAssinante } from '@/components/cliente/AvisosAssinante';
import { ConfigContext } from '@/lib/contexts/ConfigContext';
import { Concessionaria } from '@/lib/services/concessionariaService';
import { Button, EmptyState, Page, PageHeader, SectionCard, StatCard, StatGrid, pageStyles } from '@/components/ui/Page';
import { InlineNotice } from '@/components/ui/Feedback';
import { useRecursos } from '@/lib/hooks/useRecursos';
import { ABAS_CONCESSIONARIA } from '@/components/dashboard/abas-dos-paineis';
import { AtendentesDaLoja } from '@/components/dealership/Atendentes';
import { usePapelDaLoja } from '@/lib/hooks/usePapelDaLoja';

type Aba = 'visao-geral' | 'veiculos' | 'precos' | 'perfil' | 'crm' | 'anuncios' | 'atendentes' | 'cobrancas';

interface DealershipMetrics {
    veiculosCadastrados: number;
    daysSinceUpdate: number;
    statusBreakdown?: { verde: number; amarelo: number; vermelho: number };
    chartData: { label: string; value: number }[];
}

const TABS = ABAS_CONCESSIONARIA;

// Concessionária não usa margem: a consulta mostra o preço da própria loja.
const SEM_MARGEM = { margem: 0, fixedMargin: 0, marginMode: 'percent' as const, setMargem: () => { }, setMarginConfig: () => { } };

export default function DealershipDashboard() {
    const [aba, setAba] = useState<Aba>('visao-geral');
    const [usuario, setUsuario] = useState<{ name?: string | null; email?: string | null }>({});
    // Abas que o CNV liberou para esta concessionária (lib/recursos.ts).
    const { pode } = useRecursos();
    // Sobe a cada confirmação de estoque: a Visão geral busca os indicadores de novo.
    const [versaoEstoque, setVersaoEstoque] = useState(0);
    const estoqueConfirmado = () => setVersaoEstoque(v => v + 1);
    // Atendentes (cadastro da equipe) é só do titular; o atendente não vê a aba e a API recusa.
    const { ehTitular, papel, carregado: papelCarregado } = usePapelDaLoja();
    useEffect(() => {
        if (papelCarregado && !ehTitular && (aba === 'atendentes' || aba === 'cobrancas')) setAba('visao-geral');
    }, [papelCarregado, ehTitular, aba]);
    const tabs = TABS.filter(t => (!t.soTitular || ehTitular) && (!t.recurso || pode(t.recurso))).map(({ recurso: _recurso, soTitular: _soTitular, ...t }) => t);

    // Vindo da área de Atendimento (o mesmo menu lateral): abre a aba pedida.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const view = params.get('view');
        if (!view || !TABS.some(t => t.id === view && t.id !== 'atendimento')) return;
        setAba(view as Aba);
        params.delete('view');
        const query = params.toString();
        window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
    }, []);

    useEffect(() => {
        getSession()
            .then(session => { if (session?.user) setUsuario({ name: session.user.name, email: session.user.email }); })
            .catch(() => { });
    }, []);

    return (
        <ConfigContext.Provider value={SEM_MARGEM}>
            <DashboardShell
                sectionLabel="Concessionária"
                tabs={tabs}
                activeId={aba}
                onSelect={id => (id === 'atendimento' ? window.location.assign('/dashboard/atendimento') : setAba(id as Aba))}
                primaryIds={['visao-geral', 'veiculos', 'precos', 'crm', 'atendimento']}
                user={{ name: usuario.name || 'Concessionária', email: usuario.email, role: papel === 'atendente' ? 'Atendente' : 'Concessionária' }}
            >
                <StockReminderModal onUpdateStock={() => setAba('precos')} onConfirmado={estoqueConfirmado} />
                <AvisosAssinante />
                {aba === 'visao-geral' && <VisaoGeral versao={versaoEstoque} onRevisar={() => setAba('precos')} onConfirmado={estoqueConfirmado} />}
                {aba === 'veiculos' && <VehicleConsultation role="dealership" />}
                {aba === 'precos' && (
                    <Page wide>
                        <PageHeader title="Estoque e preços" description="Preço e quantidade dos seus 0KM sobre o catálogo do CNV, e os usados do repasse." />
                        <DealerInventory />
                    </Page>
                )}
                {aba === 'crm' && pode('crm') && <KanbanBoard />}
                {aba === 'perfil' && <PerfilLoja onCadastrarVeiculo={() => setAba('precos')} />}
                {aba === 'anuncios' && pode('anuncios') && <MeusAnuncios podeContratar={papel !== 'atendente'} />}
                {aba === 'atendentes' && ehTitular && <AtendentesDaLoja />}
                {/* Cobrança é do titular: o atendente não vê nem paga. */}
                {aba === 'cobrancas' && ehTitular && <CobrancasDaLoja />}
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

function VisaoGeral({ versao, onRevisar, onConfirmado }: { versao: number; onRevisar: () => void; onConfirmado: () => void }) {
    const [m, setM] = useState<DealershipMetrics | null>(null);
    const [erro, setErro] = useState(false);
    const [confirmando, setConfirmando] = useState(false);
    const [aviso, setAviso] = useState<{ texto: string; ok: boolean } | null>(null);

    useEffect(() => {
        fetch('/api/dealership/metrics', { cache: 'no-store' })
            .then(res => (res.ok ? res.json() : Promise.reject()))
            .then(dados => { setM(dados); setErro(false); })
            .catch(() => setErro(true));
    }, [versao]);

    // Confirmar grava a data de hoje nos anúncios da loja. O botão antigo
    // ("Atualizar estoque") só abria a aba de preços e não gravava nada.
    const confirmar = async () => {
        setConfirmando(true);
        setAviso(null);
        try {
            const { total } = await confirmarEstoqueDaLoja();
            setAviso({ ok: true, texto: total === 1 ? 'Estoque confirmado: 1 veículo com a data de hoje.' : `Estoque confirmado: ${total} veículos com a data de hoje.` });
            onConfirmado();
        } catch (error: any) {
            setAviso({ ok: false, texto: error?.message || 'Não foi possível confirmar o estoque. Tente de novo.' });
        } finally {
            setConfirmando(false);
        }
    };

    const s = m ? situacaoEstoque(m.daysSinceUpdate) : null;
    const grafico = m?.chartData ?? [];
    const max = Math.max(10, ...grafico.map(d => d.value));
    const b = m?.statusBreakdown;

    return (
        <Page>
            <PageHeader
                title="Visão geral"
                description="Seu estoque no CNV e há quanto tempo ele foi atualizado."
                actions={<>
                    <Button icon={<Tag size={16} aria-hidden="true" />} onClick={onRevisar}>Revisar preços</Button>
                    <Button variant="primary" icon={<CircleCheck size={16} aria-hidden="true" />} onClick={confirmar} disabled={confirmando || !m || m.veiculosCadastrados === 0}>
                        {confirmando ? 'Confirmando...' : 'Confirmar estoque atualizado'}
                    </Button>
                </>}
            />
            {aviso && <InlineNotice tone={aviso.ok ? 'positive' : undefined}>{aviso.texto}</InlineNotice>}
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
                description="Dados da loja no CNV. Para corrigir alguma informação, fale com o seu operador."
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
