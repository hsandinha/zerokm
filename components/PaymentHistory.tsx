'use client';

import { useState, useEffect } from 'react';
import styles from './PaymentHistory.module.css';

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

function getMethodIcon(method: string): string {
    const map: Record<string, string> = {
        'credit_card': '💳',
        'debit_card': '💳',
        'pix': '📱',
        'bank_transfer': '📱',
        'ticket': '📄',
        'bolbradesco': '📄',
        'account_money': '💰',
        'pending': '⏳',
    };
    return map[method] || '💳';
}

function getMethodLabel(method: string, detail?: string): string {
    const detailMap: Record<string, string> = {
        'pix': 'PIX',
        'visa': 'Visa',
        'master': 'Mastercard',
        'elo': 'Elo',
        'amex': 'American Express',
        'hipercard': 'Hipercard',
        'debvisa': 'Visa Débito',
        'debmaster': 'Mastercard Débito',
        'debelo': 'Elo Débito',
        'bolbradesco': 'Boleto Bradesco',
        'account_money': 'Saldo Mercado Pago',
    };

    if (detail && detailMap[detail]) return detailMap[detail];

    const methodMap: Record<string, string> = {
        'credit_card': 'Cartão de Crédito',
        'debit_card': 'Cartão de Débito',
        'pix': 'PIX',
        'bank_transfer': 'PIX',
        'ticket': 'Boleto Bancário',
        'account_money': 'Saldo MP',
        'pending': 'Aguardando pagamento',
    };

    return methodMap[method] || method;
}

function getStatusBadge(status: string): { label: string; className: string } {
    const map: Record<string, { label: string; className: string }> = {
        'approved': { label: 'Aprovado', className: styles.badgeApproved },
        'pending': { label: 'Pendente', className: styles.badgePending },
        'in_process': { label: 'Em análise', className: styles.badgePending },
        'rejected': { label: 'Recusado', className: styles.badgeRejected },
        'cancelled': { label: 'Cancelado', className: styles.badgeCancelled },
        'refunded': { label: 'Estornado', className: styles.badgeRefunded },
        'charged_back': { label: 'Contestado', className: styles.badgeRefunded },
    };
    return map[status] || { label: status, className: styles.badgePending };
}

function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatCurrency(amount: number): string {
    return `R$ ${amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface PaymentHistoryProps {
    month?: string; // YYYY-MM format
}

export function PaymentHistory({ month }: PaymentHistoryProps) {
    const [payments, setPayments] = useState<PaymentItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const url = month
            ? `/api/user/payments?month=${month}`
            : '/api/user/payments';
        setLoading(true);
        fetch(url)
            .then(r => r.json())
            .then(data => {
                if (Array.isArray(data)) {
                    // Client-side filter as a safety net
                    if (month) {
                        const [year, mon] = month.split('-').map(Number);
                        const filtered = data.filter((p: PaymentItem) => {
                            const d = new Date(p.createdAt);
                            return d.getFullYear() === year && (d.getMonth() + 1) === mon;
                        });
                        setPayments(filtered);
                    } else {
                        setPayments(data);
                    }
                }
            })
            .catch(err => console.error('Erro ao carregar pagamentos:', err))
            .finally(() => setLoading(false));
    }, [month]);

    if (loading) {
        return (
            <div className={styles.loading}>
                <div className={styles.spinner} />
                Carregando pagamentos...
            </div>
        );
    }

    if (payments.length === 0) {
        return (
            <div className={styles.container}>
                <h3 className={styles.title}>💰 Minhas Transações</h3>
                <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>📋</div>
                    Nenhum pagamento registrado ainda.
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <h3 className={styles.title}>💰 Minhas Transações</h3>
            <div className={styles.list}>
                {payments.map(p => {
                    const statusBadge = getStatusBadge(p.status);
                    return (
                        <div key={p.id} className={styles.card}>
                            <div className={styles.methodIcon}>
                                {getMethodIcon(p.method)}
                            </div>
                            <div className={styles.info}>
                                <div className={styles.planName}>
                                    {p.planName}
                                    {p.billingType === 'annual' ? ' (Anual)' : ' (Mensal)'}
                                </div>
                                <div className={styles.methodLabel}>
                                    {getMethodLabel(p.method, p.methodDetail)}
                                    {p.installments && p.installments > 1 ? ` — ${p.installments}x` : ''}
                                </div>
                                <span className={`${styles.badge} ${statusBadge.className}`}>
                                    {statusBadge.label}
                                </span>
                                {/* Link do boleto para pagamentos pendentes */}
                                {p.boletoUrl && p.status === 'pending' && (
                                    <a
                                        href={p.boletoUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={styles.actionLink}
                                    >
                                        📄 Ver Boleto
                                    </a>
                                )}
                            </div>
                            <div className={styles.right}>
                                <div className={styles.amount}>
                                    {formatCurrency(p.amount)}
                                </div>
                                <div className={styles.date}>
                                    {formatDate(p.mpDateApproved || p.createdAt)}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
