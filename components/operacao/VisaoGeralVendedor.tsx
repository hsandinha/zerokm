'use client';

import { useEffect, useMemo, useState } from 'react';
import { Ban, Building2, CarFront, MessageCircle, TriangleAlert, Users } from 'lucide-react';
import {
    EmptyState, IconAction, Page, PageHeader, Panel, PanelFooter, PrimaryCell, RowActions, SkeletonRows,
    StatCard, StatGrid, StatusBadge, TwoLine, pageStyles, type BadgeTone,
} from '@/components/ui/Page';
import { InlineNotice } from '@/components/ui/Feedback';
import { farolDe, linkWhatsApp, type ClienteCarteira, type Farol } from './carteira';

const FAROL: Record<Farol, { label: string; tone: BadgeTone; ordem: number }> = {
    expired: { label: 'Vencido', tone: 'negative', ordem: 0 },
    no_plan: { label: 'Sem plano', tone: 'negative', ordem: 1 },
    expiring_soon: { label: 'Vence em até 5 dias', tone: 'warning', ordem: 2 },
    active: { label: 'Regular', tone: 'positive', ordem: 3 },
};

/** Carteira do vendedor: indicadores e farol de vencimentos dos planos. */
export function VisaoGeralVendedor() {
    const [clientes, setClientes] = useState<ClienteCarteira[] | null>(null);
    const [totalVeiculos, setTotalVeiculos] = useState<number | null>(null);
    const [erro, setErro] = useState(false);

    useEffect(() => {
        fetch('/api/vehicles?page=1&limit=1&accessProfile=vendedor')
            .then(res => res.json())
            .then((r: any) => { if (r && typeof r.total === 'number') setTotalVeiculos(r.total); })
            .catch(console.error);
        fetch('/api/vendedor/clientes')
            .then(res => res.json())
            .then((data: unknown) => { if (!Array.isArray(data)) throw new Error(); setClientes(data as ClienteCarteira[]); })
            .catch(() => { setErro(true); setClientes([]); });
    }, []);

    const linhas = useMemo(() => {
        const agora = Date.now();
        return (clientes ?? [])
            .map(c => ({ c, ...farolDe(c, agora) }))
            .sort((a, b) => FAROL[a.farol].ordem - FAROL[b.farol].ordem || (a.dias ?? 0) - (b.dias ?? 0));
    }, [clientes]);

    const carregando = clientes === null;
    const vencendo = linhas.filter(l => l.farol === 'expiring_soon').length;
    const perdidos = linhas.filter(l => l.farol === 'expired' || l.farol === 'no_plan').length;

    return (
        <Page>
            <PageHeader title="Visão geral" description="Sua carteira de lojistas e os vencimentos dos planos, do mais urgente ao regular." />
            {erro && <InlineNotice>Não foi possível carregar a carteira. Atualize a página.</InlineNotice>}

            <StatGrid>
                <StatCard label="Lojistas na carteira" icon={<Users size={18} />} value={carregando ? '-' : linhas.length} caption="Atendidos por você" />
                <StatCard label="Vencendo" icon={<TriangleAlert size={18} />} value={carregando ? '-' : vencendo} tone={vencendo ? 'warning' : 'default'} caption="Cobrar nos próximos 5 dias" />
                <StatCard label="Sem assinatura" icon={<Ban size={18} />} value={carregando ? '-' : perdidos} tone={perdidos ? 'negative' : 'default'} caption="Vencidos ou sem plano" />
                <StatCard label="Veículos na consulta" icon={<CarFront size={18} />} value={totalVeiculos === null ? '-' : totalVeiculos.toLocaleString('pt-BR')} caption="Disponíveis para oferecer" />
            </StatGrid>

            <Panel>
                <div className={pageStyles.panelHead}>
                    <h2 className={pageStyles.panelTitle}>Farol de vencimentos</h2>
                    <p className={pageStyles.panelDescription}>Vermelho: vencido ou sem plano. Amarelo: vence em até 5 dias. Verde: regular.</p>
                </div>
                <div className={pageStyles.tableWrap}>
                    <table className={pageStyles.table}>
                        <thead>
                            <tr>
                                <th>Lojista</th>
                                <th>Situação</th>
                                <th>Plano</th>
                                <th>Renovação</th>
                                <th className={pageStyles.shrink}><span className={pageStyles.srOnly}>Ações</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {carregando && <SkeletonRows rows={4} columns={5} />}
                            {!carregando && linhas.map(({ c, farol, dias }) => {
                                const wa = linkWhatsApp(c.telefone, `Olá ${c.nome || ''}, tudo bem? Seu plano na CNV precisa de atenção.`);
                                return (
                                    <tr key={c.id}>
                                        <td className={pageStyles.colMain}><PrimaryCell title={c.nome || c.email || '-'} subtitle={[c.email, c.telefone].filter(Boolean).join(' · ') || undefined} /></td>
                                        <td><StatusBadge tone={FAROL[farol].tone}>{FAROL[farol].label}</StatusBadge></td>
                                        <td>{c.plano || <span className={pageStyles.muted}>Sem plano</span>}</td>
                                        <td>
                                            {c.vencimento
                                                ? <TwoLine nowrap top={new Date(c.vencimento).toLocaleDateString('pt-BR')} bottom={dias === null ? undefined : dias < 0 ? `há ${Math.abs(dias)} ${Math.abs(dias) === 1 ? 'dia' : 'dias'}` : dias === 0 ? 'hoje' : `em ${dias} ${dias === 1 ? 'dia' : 'dias'}`} />
                                                : <span className={pageStyles.muted}>-</span>}
                                        </td>
                                        <td>
                                            <RowActions>
                                                {wa && <IconAction label={`Chamar ${c.nome || 'lojista'} no WhatsApp`} href={wa}><MessageCircle size={17} aria-hidden="true" /></IconAction>}
                                            </RowActions>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {!carregando && linhas.length === 0 && (
                    <EmptyState icon={<Building2 size={20} />} title="Carteira vazia" description="Puxe lojistas em Prospects para começar a acompanhar os vencimentos." />
                )}
                {!carregando && linhas.length > 0 && (
                    <PanelFooter aside="Mais urgentes primeiro">
                        <strong>{linhas.length}</strong> {linhas.length === 1 ? 'lojista' : 'lojistas'} na carteira
                    </PanelFooter>
                )}
            </Panel>
        </Page>
    );
}
