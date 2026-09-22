'use client';

import { useCallback, useEffect, useState } from 'react';
import styles from './CobrancasManagement.module.css';

type Cobranca = {
    id: string;
    mpPaymentId: string;
    cliente: string;
    clienteEmail: string;
    clienteTelefone: string;
    assinaturaExpiraEm: string | null;
    plano: string;
    valor: number;
    status: string;
    criadoEm: string;
    boletoUrl: string | null;
    boletoBarcode: string | null;
    email: {
        enviadoEm: string | null;
        para: string;
        id: string | null;
        erro: string | null;
        situacao: string | null;
    };
};

const brl = (v: number) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '-');
const dataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '-');

const STATUS_PAGAMENTO: Record<string, { label: string; cls: string }> = {
    approved: { label: 'Pago', cls: 'badgeOk' },
    pending: { label: 'Aguardando', cls: 'badgePendente' },
    in_process: { label: 'Em análise', cls: 'badgePendente' },
    rejected: { label: 'Recusado', cls: 'badgeErro' },
    cancelled: { label: 'Cancelado', cls: 'badgeNeutro' },
    refunded: { label: 'Estornado', cls: 'badgeNeutro' },
};

// Eventos do Resend. "delivered" é o que interessa ao atendimento.
const STATUS_EMAIL: Record<string, { label: string; cls: string }> = {
    delivered: { label: 'Entregue', cls: 'badgeOk' },
    sent: { label: 'Enviado', cls: 'badgePendente' },
    delivery_delayed: { label: 'Atrasado', cls: 'badgePendente' },
    queued: { label: 'Na fila', cls: 'badgePendente' },
    bounced: { label: 'Voltou', cls: 'badgeErro' },
    complained: { label: 'Marcado como spam', cls: 'badgeErro' },
    opened: { label: 'Aberto', cls: 'badgeOk' },
    clicked: { label: 'Clicou', cls: 'badgeOk' },
};

export function CobrancasManagement() {
    const [rows, setRows] = useState<Cobranca[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('');
    const [reenviando, setReenviando] = useState<string | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    const [copiado, setCopiado] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ limit: '50' });
            if (search.trim()) params.set('search', search.trim());
            if (status) params.set('status', status);
            const res = await fetch(`/api/admin/cobrancas?${params.toString()}`);
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'Erro ao carregar cobranças');
            setRows(body.data || []);
        } catch (err: any) {
            setError(err?.message || 'Erro ao carregar cobranças');
        } finally {
            setLoading(false);
        }
    }, [search, status]);

    useEffect(() => {
        const t = setTimeout(load, 300);
        return () => clearTimeout(t);
    }, [load]);

    const reenviar = async (row: Cobranca) => {
        const destino = window.prompt(
            `Reenviar o boleto de ${row.cliente} para qual e-mail?`,
            row.email.para || row.clienteEmail,
        );
        if (destino === null) return;
        setReenviando(row.id);
        setAviso(null);
        setError(null);
        try {
            const res = await fetch(`/api/admin/cobrancas/${row.id}/reenviar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: destino.trim() }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'Falha ao reenviar');
            setAviso(`Boleto reenviado para ${body.para}.`);
            await load();
        } catch (err: any) {
            setError(err?.message || 'Falha ao reenviar');
        } finally {
            setReenviando(null);
        }
    };

    const copiarCodigo = (row: Cobranca) => {
        if (!row.boletoBarcode) return;
        navigator.clipboard?.writeText(row.boletoBarcode);
        setCopiado(row.id);
        setTimeout(() => setCopiado(null), 2000);
    };

    const badgeEmail = (row: Cobranca) => {
        if (row.email.erro) return <span className={`${styles.badge} ${styles.badgeErro}`} title={row.email.erro}>Falhou</span>;
        if (!row.email.enviadoEm) return <span className={`${styles.badge} ${styles.badgeNeutro}`}>Não enviado</span>;
        const s = row.email.situacao ? STATUS_EMAIL[row.email.situacao] : null;
        return <span className={`${styles.badge} ${s ? (styles as any)[s.cls] : styles.badgePendente}`}>{s?.label || 'Enviado'}</span>;
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h2>Cobranças por boleto</h2>
                <p>Boletos emitidos pelo sistema, com a situação do e-mail. Use para atender quem diz que não recebeu.</p>
            </div>

            <div className={styles.filters}>
                <input
                    className={styles.search}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar por cliente, e-mail ou id do pagamento..."
                />
                <div className={styles.segmented}>
                    {([['', 'Todos'], ['pending', 'Aguardando'], ['approved', 'Pagos'], ['cancelled', 'Cancelados']] as Array<[string, string]>).map(([v, label]) => (
                        <button
                            key={label}
                            type="button"
                            className={`${styles.segment} ${status === v ? styles.segmentActive : ''}`}
                            onClick={() => setStatus(v)}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <button type="button" className={styles.btn} onClick={load} disabled={loading}>
                    {loading ? 'Atualizando...' : 'Atualizar'}
                </button>
            </div>

            {error && <div className={styles.erro}>{error}</div>}
            {aviso && <div className={styles.aviso}>{aviso}</div>}

            <div className={styles.tableShell}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Cliente</th>
                            <th>Plano</th>
                            <th>Valor</th>
                            <th>Emitido</th>
                            <th>Pagamento</th>
                            <th>E-mail</th>
                            <th>Boleto</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && rows.length === 0 ? (
                            <tr><td colSpan={7} className={styles.empty}>Carregando...</td></tr>
                        ) : rows.length === 0 ? (
                            <tr><td colSpan={7} className={styles.empty}>Nenhuma cobrança por boleto encontrada.</td></tr>
                        ) : rows.map(row => {
                            const sp = STATUS_PAGAMENTO[row.status] || { label: row.status, cls: 'badgeNeutro' };
                            return (
                                <tr key={row.id}>
                                    <td>
                                        <div className={styles.cliente}>{row.cliente}</div>
                                        <div className={styles.muted}>{row.clienteEmail}</div>
                                        {row.assinaturaExpiraEm && (
                                            <div className={styles.muted}>assinatura vence {data(row.assinaturaExpiraEm)}</div>
                                        )}
                                    </td>
                                    <td>{row.plano}</td>
                                    <td style={{ whiteSpace: 'nowrap' }}>{brl(row.valor)}</td>
                                    <td style={{ whiteSpace: 'nowrap' }}>{data(row.criadoEm)}</td>
                                    <td><span className={`${styles.badge} ${(styles as any)[sp.cls]}`}>{sp.label}</span></td>
                                    <td>
                                        {badgeEmail(row)}
                                        <div className={styles.muted}>{row.email.para || '-'}</div>
                                        <div className={styles.muted}>{row.email.enviadoEm ? dataHora(row.email.enviadoEm) : 'nunca enviado'}</div>
                                        {row.email.erro && <div className={styles.muted}>{row.email.erro}</div>}
                                    </td>
                                    <td>
                                        <div className={styles.acoes}>
                                            {row.boletoUrl ? (
                                                <a className={styles.btn} href={row.boletoUrl} target="_blank" rel="noopener noreferrer">Abrir boleto</a>
                                            ) : (
                                                <span className={styles.muted}>sem link</span>
                                            )}
                                            {row.boletoBarcode && (
                                                <button type="button" className={styles.btn} onClick={() => copiarCodigo(row)}>
                                                    {copiado === row.id ? 'Copiado!' : 'Copiar código'}
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                className={`${styles.btn} ${styles.btnPrimario}`}
                                                onClick={() => reenviar(row)}
                                                disabled={reenviando === row.id || !row.boletoUrl}
                                            >
                                                {reenviando === row.id ? 'Enviando...' : 'Reenviar e-mail'}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
