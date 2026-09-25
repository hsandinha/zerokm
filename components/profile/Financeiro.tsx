'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { PaymentHistory } from '@/components/PaymentHistory';
import { modalStyles } from '@/components/admin/AdminModal';
import styles from './Financeiro.module.css';

interface ItemExtrato {
    date?: string;
    type: string;
    description: string;
    amount: number;
    status: string;
}

const TIPO: Record<string, string> = { subscription: 'Assinatura', invite: 'Convidado', credit: 'Crédito' };
const STATUS: Record<string, string> = { paid: 'Pago', pending: 'Pendente', cancelled: 'Cancelado' };
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

    return (
        <div className={styles.financeiro}>
            <section className={styles.card}>
                <header className={styles.cardHead}>
                    <div>
                        <h2>Extrato do mês</h2>
                        <p>Assinatura e cobranças do período.</p>
                    </div>
                    <label className={`${modalStyles.field} ${styles.mes}`}>
                        Mês de referência
                        <input type="month" value={mes} onChange={e => e.target.value && setMes(e.target.value)} />
                    </label>
                </header>

                {carregando ? (
                    <p className={styles.vazio}><Loader2 size={16} className={styles.girando} aria-hidden="true" /> Carregando...</p>
                ) : !extrato || extrato.items.length === 0 ? (
                    <p className={styles.vazio}>Nenhum lançamento neste mês.</p>
                ) : (
                    <div className={styles.tabelaWrap}>
                        <table className={styles.tabela}>
                            <thead>
                                <tr>
                                    <th>Data</th>
                                    <th>Descrição</th>
                                    <th>Tipo</th>
                                    <th>Status</th>
                                    <th className={styles.valor}>Valor</th>
                                </tr>
                            </thead>
                            <tbody>
                                {extrato.items.map((item, i) => (
                                    <tr key={i}>
                                        <td className={styles.data}>{item.date ? new Date(item.date).toLocaleDateString('pt-BR') : '-'}</td>
                                        <td>{item.description}</td>
                                        <td><span className={styles.tag}>{TIPO[item.type] ?? 'Info'}</span></td>
                                        <td><span className={styles.status} data-status={item.status}>{STATUS[item.status] ?? '-'}</span></td>
                                        <td className={styles.valor}>{item.amount > 0 ? brl(item.amount) : '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                            {extrato.total > 0 && (
                                <tfoot>
                                    <tr>
                                        <td colSpan={4}>Total do mês</td>
                                        <td className={styles.valor}>{brl(extrato.total)}</td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                )}
            </section>

            <section className={styles.card}>
                <PaymentHistory month={mes} />
            </section>
        </div>
    );
}
