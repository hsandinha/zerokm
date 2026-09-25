'use client';

import { useEffect, useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { PaymentHistory } from '@/components/PaymentHistory';
import {
    EmptyState, Panel, PanelFooter, SkeletonRows, StatusBadge, pageStyles, type BadgeTone,
} from '@/components/ui/Page';

interface ItemExtrato {
    date?: string;
    type: string;
    description: string;
    amount: number;
    status: string;
}

const TIPO: Record<string, string> = { subscription: 'Assinatura', invite: 'Convidado', credit: 'Crédito' };
const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
    paid: { label: 'Pago', tone: 'positive' },
    pending: { label: 'Pendente', tone: 'warning' },
    cancelled: { label: 'Cancelado', tone: 'negative' },
};
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function mesAtual() {
    const agora = new Date();
    return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
}

/** Financeiro do cliente: extrato do mês e histórico de pagamentos. */
export function Financeiro() {
    const [mes, setMes] = useState(mesAtual);
    const [extrato, setExtrato] = useState<{ items: ItemExtrato[]; total: number } | null>(null);
    const [carregando, setCarregando] = useState(true);

    useEffect(() => {
        let ativo = true;
        setCarregando(true);
        fetch(`/api/user/extrato?month=${mes}`)
            .then(res => (res.ok ? res.json() : null))
            .then(data => { if (ativo) setExtrato(data && Array.isArray(data.items) ? data : null); })
            .catch(() => { if (ativo) setExtrato(null); })
            .finally(() => { if (ativo) setCarregando(false); });
        return () => { ativo = false; };
    }, [mes]);

    const itens = extrato?.items ?? [];

    return (
        <div className={pageStyles.formStack}>
            <Panel>
                <div className={`${pageStyles.panelHead} ${pageStyles.panelHeadSplit}`}>
                    <div>
                        <h2 className={pageStyles.panelTitle}>Extrato do mês</h2>
                        <p className={pageStyles.panelDescription}>Assinatura, convidados e créditos cobrados no período.</p>
                    </div>
                    <label className={pageStyles.monthField}>
                        Mês de referência
                        <input type="month" value={mes} onChange={e => e.target.value && setMes(e.target.value)} />
                    </label>
                </div>

                {(carregando || itens.length > 0) && (
                    <div className={pageStyles.tableWrap}>
                        <table className={pageStyles.table}>
                            <thead>
                                <tr>
                                    <th>Data</th>
                                    <th>Descrição</th>
                                    <th>Tipo</th>
                                    <th>Situação</th>
                                    <th className={pageStyles.num}>Valor</th>
                                </tr>
                            </thead>
                            <tbody>
                                {carregando && <SkeletonRows rows={2} columns={5} />}
                                {!carregando && itens.map((item, i) => {
                                    const status = STATUS[item.status];
                                    return (
                                        <tr key={i}>
                                            <td className={`${pageStyles.nowrap} ${pageStyles.muted}`}>{item.date ? new Date(item.date).toLocaleDateString('pt-BR') : '-'}</td>
                                            <td className={pageStyles.colMain}>{item.description}</td>
                                            <td><StatusBadge dot={false}>{TIPO[item.type] ?? 'Outro'}</StatusBadge></td>
                                            <td>{status ? <StatusBadge tone={status.tone}>{status.label}</StatusBadge> : <span className={pageStyles.muted}>-</span>}</td>
                                            <td className={`${pageStyles.num} ${pageStyles.nowrap}`}><strong>{item.amount > 0 ? brl(item.amount) : '-'}</strong></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {!carregando && itens.length === 0 && (
                    <EmptyState icon={<CalendarRange size={20} />} title="Nenhum lançamento neste mês." description="Escolha outro mês de referência para ver o extrato." />
                )}

                {!carregando && itens.length > 0 && (
                    <PanelFooter aside={<strong className={pageStyles.nowrap}>{brl(extrato?.total ?? 0)}</strong>}>
                        Total do mês
                    </PanelFooter>
                )}
            </Panel>

            <PaymentHistory month={mes} />
        </div>
    );
}
