'use client';

import { useEffect, useState } from 'react';
import { CircleAlert, CircleCheck, Gift, TriangleAlert } from 'lucide-react';
import { Panel, PanelFooter, SkeletonRows, StatCard, StatGrid, pageStyles } from '@/components/ui/Page';

type Ranking = { nome: string; receitaGerida: number; verde: number; amarelo: number; vermelho: number; cortesia?: number };
type Churn = {
    globalValues: {
        receitaCativa: number; totalAtivos: number;
        receitaRisco: number; totalRisco: number;
        receitaPerdida: number; totalBloqueados: number;
        totalCortesia?: number; totalInvitees?: number;
    };
    operatorRanking: Ranking[];
};

const moeda = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v || 0);
const clientes = (n: number) => `${n} ${n === 1 ? 'cliente' : 'clientes'}`;
const lojas = (n: number) => `${n} ${n === 1 ? 'loja' : 'lojas'}`;

/** Saúde das assinaturas: receita ativa, a vencer, inadimplente e carteira por responsável. */
export function ChurnDashboard() {
    const [metrics, setMetrics] = useState<Churn | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/admin/metrics/churn')
            .then(res => res.json())
            .then(data => { if (!data.error) setMetrics(data); })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    if (!loading && !metrics) return null;
    const g = metrics?.globalValues;
    const ranking = metrics?.operatorRanking ?? [];

    return (
        <>
            <StatGrid>
                <StatCard label="Receita ativa" icon={<CircleCheck size={18} />} tone="positive" value={g ? moeda(g.receitaCativa) : '-'} caption={g ? `${clientes(g.totalAtivos)} pagantes` : 'Carregando'} />
                <StatCard label="A vencer em 5 dias" icon={<TriangleAlert size={18} />} tone="warning" value={g ? moeda(g.receitaRisco) : '-'} caption={g ? `${clientes(g.totalRisco)} no radar` : 'Carregando'} />
                <StatCard label="Inadimplente" icon={<CircleAlert size={18} />} tone="negative" value={g ? moeda(g.receitaPerdida) : '-'} caption={g ? `${clientes(g.totalBloqueados)} bloqueados` : 'Carregando'} />
                <StatCard
                    label="Cortesias e convidados"
                    icon={<Gift size={18} />}
                    value={g ? (g.totalCortesia ?? 0) + (g.totalInvitees ?? 0) : '-'}
                    caption={g ? `${g.totalCortesia ?? 0} cortesia · ${g.totalInvitees ?? 0} convidados, fora da receita` : 'Carregando'}
                />
            </StatGrid>

            <Panel>
                <div className={pageStyles.panelHead}>
                    <h2 className={pageStyles.panelTitle}>Carteira por responsável</h2>
                    <p className={pageStyles.panelDescription}>Receita sob gestão e situação das lojas de cada operador ou vendedor.</p>
                </div>
                <div className={pageStyles.tableWrap}>
                    <table className={pageStyles.table}>
                        <thead>
                            <tr>
                                <th>Responsável</th>
                                <th className={pageStyles.num}>Receita sob gestão</th>
                                <th className={pageStyles.num}>Em dia</th>
                                <th className={pageStyles.num}>Em risco</th>
                                <th className={pageStyles.num}>Inadimplentes</th>
                                <th className={pageStyles.num}>Cortesias</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && <SkeletonRows rows={3} columns={6} />}
                            {!loading && ranking.map(op => (
                                <tr key={op.nome}>
                                    <td><strong>{op.nome}</strong></td>
                                    <td className={pageStyles.num}><strong>{moeda(op.receitaGerida)}</strong></td>
                                    <td className={pageStyles.num}><span className={pageStyles.textPositive}>{lojas(op.verde)}</span></td>
                                    <td className={pageStyles.num}><span className={op.amarelo ? pageStyles.textWarning : pageStyles.muted}>{lojas(op.amarelo)}</span></td>
                                    <td className={pageStyles.num}><span className={op.vermelho ? pageStyles.textNegative : pageStyles.muted}>{lojas(op.vermelho)}</span></td>
                                    <td className={pageStyles.num}><span className={pageStyles.muted}>{lojas(op.cortesia ?? 0)}</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {!loading && ranking.length === 0 && <PanelFooter>Nenhum responsável com carteira ainda.</PanelFooter>}
            </Panel>
        </>
    );
}
