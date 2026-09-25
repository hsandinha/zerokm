'use client';

import { useEffect, useState } from 'react';
import { Receipt } from 'lucide-react';
import {
    EmptyState, Panel, PanelFooter, PrimaryCell, SkeletonRows, StatusBadge, TwoLine, pageStyles, type BadgeTone,
} from '@/components/ui/Page';

interface PaymentItem {
    id: string;
    mpPaymentId?: string;
    method: string;
    methodDetail?: string;
    status: string;
    statusDetail?: string;
    amount: number;
    currency: string;
    installments?: number;
    billingType?: string;
    planName: string;
    planType?: string;
    pixQrCode?: string;
    pixQrCodeBase64?: string;
    boletoUrl?: string;
    boletoBarcode?: string;
    payerEmail?: string;
    createdAt: string;
    mpDateApproved?: string;
}

const BANDEIRA: Record<string, string> = {
    pix: 'PIX',
    visa: 'Visa',
    master: 'Mastercard',
    elo: 'Elo',
    amex: 'American Express',
    hipercard: 'Hipercard',
    debvisa: 'Visa Débito',
    debmaster: 'Mastercard Débito',
    debelo: 'Elo Débito',
    bolbradesco: 'Boleto Bradesco',
    account_money: 'Saldo Mercado Pago',
};

const METODO: Record<string, string> = {
    credit_card: 'Cartão de crédito',
    debit_card: 'Cartão de débito',
    pix: 'PIX',
    bank_transfer: 'PIX',
    ticket: 'Boleto',
    boleto: 'Boleto',
    account_money: 'Saldo Mercado Pago',
    pending: 'Aguardando pagamento',
};

const SITUACAO: Record<string, { label: string; tone: BadgeTone }> = {
    approved: { label: 'Aprovado', tone: 'positive' },
    pending: { label: 'Pendente', tone: 'warning' },
    in_process: { label: 'Em análise', tone: 'warning' },
    rejected: { label: 'Recusado', tone: 'negative' },
    cancelled: { label: 'Cancelado', tone: 'neutral' },
    refunded: { label: 'Estornado', tone: 'info' },
    charged_back: { label: 'Contestado', tone: 'negative' },
};

const metodo = (p: PaymentItem) => {
    const nome = (p.methodDetail && BANDEIRA[p.methodDetail]) || METODO[p.method] || p.method;
    return p.installments && p.installments > 1 ? `${nome} em ${p.installments}x` : nome;
};

const brl = (valor: number) => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const dataHora = (valor: string) => {
    const d = new Date(valor);
    return {
        dia: d.toLocaleDateString('pt-BR'),
        hora: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    };
};

/** Histórico de pagamentos do cliente (Mercado Pago), filtrado pelo mês quando informado. */
export function PaymentHistory({ month }: { month?: string }) {
    const [payments, setPayments] = useState<PaymentItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const url = month ? `/api/user/payments?month=${month}` : '/api/user/payments';
        setLoading(true);
        fetch(url)
            .then(r => r.json())
            .then(data => {
                if (!Array.isArray(data)) return;
                if (!month) { setPayments(data); return; }
                // Filtro também no cliente, por segurança.
                const [ano, mes] = month.split('-').map(Number);
                setPayments(data.filter((p: PaymentItem) => {
                    const d = new Date(p.createdAt);
                    return d.getFullYear() === ano && d.getMonth() + 1 === mes;
                }));
            })
            .catch(err => console.error('Erro ao carregar pagamentos:', err))
            .finally(() => setLoading(false));
    }, [month]);

    return (
        <Panel>
            <div className={pageStyles.panelHead}>
                <h2 className={pageStyles.panelTitle}>Histórico de pagamentos</h2>
                <p className={pageStyles.panelDescription}>Tentativas de pagamento feitas pelo Mercado Pago.</p>
            </div>

            {loading && <p role="status" className={pageStyles.srOnly}>Carregando pagamentos...</p>}

            {(loading || payments.length > 0) && (
                <div className={pageStyles.tableWrap}>
                    <table className={pageStyles.table}>
                        <thead>
                            <tr>
                                <th>Plano</th>
                                <th>Situação</th>
                                <th>Data</th>
                                <th className={pageStyles.num}>Valor</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && <SkeletonRows rows={3} columns={4} />}
                            {!loading && payments.map(p => {
                                const situacao = SITUACAO[p.status] ?? { label: p.status, tone: 'neutral' as BadgeTone };
                                const quando = dataHora(p.mpDateApproved || p.createdAt);
                                return (
                                    <tr key={p.id}>
                                        <td className={pageStyles.colMain}>
                                            <PrimaryCell
                                                title={`${p.planName} (${p.billingType === 'annual' ? 'Anual' : 'Mensal'})`}
                                                subtitle={metodo(p)}
                                            />
                                        </td>
                                        <td>
                                            <TwoLine
                                                top={<StatusBadge tone={situacao.tone}>{situacao.label}</StatusBadge>}
                                                bottom={p.boletoUrl && p.status === 'pending'
                                                    ? <a href={p.boletoUrl} target="_blank" rel="noopener noreferrer" className={pageStyles.link}>Ver boleto</a>
                                                    : undefined}
                                            />
                                        </td>
                                        <td><TwoLine nowrap top={quando.dia} bottom={quando.hora} /></td>
                                        <td className={`${pageStyles.num} ${pageStyles.nowrap}`}><strong>{brl(p.amount)}</strong></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {!loading && payments.length === 0 && (
                <EmptyState icon={<Receipt size={20} />} title="Nenhum pagamento registrado ainda." description="Quando você pagar uma assinatura, o comprovante aparece aqui." />
            )}

            {!loading && payments.length > 0 && (
                <PanelFooter>
                    Mostrando <strong>{payments.length}</strong> {payments.length === 1 ? 'pagamento' : 'pagamentos'}
                </PanelFooter>
            )}
        </Panel>
    );
}
