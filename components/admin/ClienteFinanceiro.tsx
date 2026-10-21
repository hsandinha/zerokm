'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AdminModal, modalStyles } from '@/components/admin/AdminModal';
import { InlineNotice } from '@/components/ui/Feedback';
import { lerValorEmReais } from '@/lib/utils/valorCombinado';
import styles from './ClienteFinanceiro.module.css';

type Cobranca = {
    id: string;
    mpPaymentId: string;
    plano: string;
    valor: number;
    status: string;
    criadoEm: string;
    boletoUrl: string | null;
    boletoBarcode: string | null;
    email: { enviadoEm: string | null; para: string; id: string | null; erro: string | null; situacao: string | null };
    /** Registro manual (ativação pelo CRM ou baixa manual): o valor pode ser corrigido. */
    podeEditarValor?: boolean;
    valorEditado?: { valorOriginal: number | null; por: string | null; em: string } | null;
};

const brl = (v: number) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
const dataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

const PAGAMENTO: Record<string, { label: string; tom: string }> = {
    approved: { label: 'Pago', tom: 'ok' },
    pending: { label: 'Aguardando', tom: 'alerta' },
    in_process: { label: 'Em análise', tom: 'alerta' },
    rejected: { label: 'Recusado', tom: 'erro' },
    cancelled: { label: 'Cancelado', tom: 'neutro' },
    refunded: { label: 'Estornado', tom: 'neutro' },
    charged_back: { label: 'Chargeback', tom: 'erro' },
};

/** Eventos do Resend traduzidos para quem atende o cliente. */
const ENTREGA: Record<string, { label: string; tom: string }> = {
    delivered: { label: 'Entregue', tom: 'ok' },
    opened: { label: 'Aberto', tom: 'ok' },
    clicked: { label: 'Clicou no link', tom: 'ok' },
    sent: { label: 'Enviado', tom: 'alerta' },
    queued: { label: 'Na fila', tom: 'alerta' },
    delivery_delayed: { label: 'Atrasado', tom: 'alerta' },
    bounced: { label: 'Voltou', tom: 'erro' },
    complained: { label: 'Caiu em spam', tom: 'erro' },
};

/**
 * Financeiro do cliente dentro do CRM: o atendimento resolve "não recebi o
 * boleto" sem sair da ficha — vê se o e-mail saiu e foi entregue, reabre o
 * boleto, copia a linha digitável ou reenvia.
 */
export function ClienteFinanceiro({ userId }: { userId: string }) {
    const [rows, setRows] = useState<Cobranca[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState<string | null>(null);
    const [copiado, setCopiado] = useState<string | null>(null);
    const [corrigindo, setCorrigindo] = useState<{ row: Cobranca; valor: string } | null>(null);
    const [erroCorrecao, setErroCorrecao] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/cobrancas?tudo=true&limit=20&userId=${encodeURIComponent(userId)}`);
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'Erro ao carregar o financeiro');
            setRows(body.data || []);
        } catch (err: any) {
            setError(err?.message || 'Erro ao carregar o financeiro');
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => { load(); }, [load]);

    const reenviar = async (row: Cobranca) => {
        const destino = window.prompt('Reenviar o boleto para qual e-mail?', row.email.para);
        if (destino === null) return;
        setOcupado(row.id);
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
            setOcupado(null);
        }
    };

    const salvarValor = async (event: FormEvent) => {
        event.preventDefault();
        if (!corrigindo) return;
        const valor = lerValorEmReais(corrigindo.valor);
        if (valor === null || valor < 0) {
            setErroCorrecao('Informe o valor recebido.');
            return;
        }
        setOcupado(corrigindo.row.id);
        setErroCorrecao(null);
        try {
            const res = await fetch(`/api/admin/cobrancas/${corrigindo.row.id}/valor`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ valor }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body.error || 'Não foi possível corrigir o valor');
            setCorrigindo(null);
            setAviso(`Valor corrigido para ${brl(body.valor)}.`);
            await load();
        } catch (err: any) {
            setErroCorrecao(err?.message || 'Não foi possível corrigir o valor');
        } finally {
            setOcupado(null);
        }
    };

    const copiar = (row: Cobranca) => {
        if (!row.boletoBarcode) return;
        navigator.clipboard?.writeText(row.boletoBarcode);
        setCopiado(row.id);
        setTimeout(() => setCopiado(null), 2000);
    };

    if (loading && rows.length === 0) return <p className={styles.vazio}>Carregando financeiro...</p>;

    return (
        <div className={styles.wrap}>
            {error && <div className={styles.erro}>{error}</div>}
            {aviso && <div className={styles.aviso}>{aviso}</div>}

            {rows.length === 0 ? (
                <p className={styles.vazio}>Nenhuma cobrança registrada para este cliente.</p>
            ) : rows.map(row => {
                const pag = PAGAMENTO[row.status] || { label: row.status, tom: 'neutro' };
                const entrega = row.email.erro
                    ? { label: 'Falhou', tom: 'erro' }
                    : row.email.enviadoEm
                        ? (row.email.situacao ? ENTREGA[row.email.situacao] || { label: 'Enviado', tom: 'alerta' } : { label: 'Enviado', tom: 'alerta' })
                        : { label: 'Não enviado', tom: 'neutro' };

                return (
                    <article key={row.id} className={styles.card}>
                        <header className={styles.cardTopo}>
                            <div>
                                <strong className={styles.valor}>{brl(row.valor)}</strong>
                                <span className={styles.plano}>{row.plano}</span>
                                {row.valorEditado && (
                                    <span className={styles.sub}>
                                        Valor corrigido{row.valorEditado.valorOriginal !== null ? ` (era ${brl(row.valorEditado.valorOriginal)})` : ''}{row.valorEditado.por ? ` por ${row.valorEditado.por}` : ''}
                                    </span>
                                )}
                            </div>
                            <span className={`${styles.chip} ${(styles as any)[pag.tom]}`}>{pag.label}</span>
                        </header>

                        <dl className={styles.dados}>
                            <div>
                                <dt>Emitida em</dt>
                                <dd>{data(row.criadoEm)}</dd>
                            </div>
                            <div>
                                <dt>E-mail</dt>
                                <dd>
                                    <span className={`${styles.chip} ${(styles as any)[entrega.tom]}`}>{entrega.label}</span>
                                    <span className={styles.sub}>{row.email.para || '—'}</span>
                                    <span className={styles.sub}>{row.email.enviadoEm ? dataHora(row.email.enviadoEm) : 'nunca enviado'}</span>
                                    {row.email.erro && <span className={styles.sub}>{row.email.erro}</span>}
                                </dd>
                            </div>
                        </dl>

                        {row.podeEditarValor && !row.boletoUrl && (
                            <footer className={styles.acoes}>
                                <button type="button" className={styles.btn} onClick={() => { setErroCorrecao(null); setCorrigindo({ row, valor: Number(row.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) }); }}>
                                    Corrigir valor
                                </button>
                            </footer>
                        )}

                        {row.boletoUrl && (
                            <footer className={styles.acoes}>
                                {row.podeEditarValor && (
                                    <button type="button" className={styles.btn} onClick={() => { setErroCorrecao(null); setCorrigindo({ row, valor: Number(row.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) }); }}>
                                        Corrigir valor
                                    </button>
                                )}
                                <a className={styles.btn} href={row.boletoUrl} target="_blank" rel="noopener noreferrer">Abrir boleto</a>
                                {row.boletoBarcode && (
                                    <button type="button" className={styles.btn} onClick={() => copiar(row)}>
                                        {copiado === row.id ? 'Copiado' : 'Copiar linha digitável'}
                                    </button>
                                )}
                                <button type="button" className={`${styles.btn} ${styles.btnPrimario}`} onClick={() => reenviar(row)} disabled={ocupado === row.id}>
                                    {ocupado === row.id ? 'Enviando...' : 'Reenviar e-mail'}
                                </button>
                            </footer>
                        )}
                    </article>
                );
            })}

            {corrigindo && (
                <AdminModal
                    size="sm"
                    title="Corrigir valor"
                    subtitle={<>Registro de {corrigindo.row.plano} de {data(corrigindo.row.criadoEm)}. Vale para o extrato e os relatórios; não gera cobrança nova.</>}
                    onClose={() => { if (!ocupado) setCorrigindo(null); }}
                    busy={ocupado === corrigindo.row.id}
                    onSubmit={salvarValor}
                    footer={<>
                        <button type="button" className={modalStyles.secondary} onClick={() => setCorrigindo(null)} disabled={ocupado === corrigindo.row.id}>Cancelar</button>
                        <button type="submit" className={modalStyles.primary} disabled={ocupado === corrigindo.row.id}>{ocupado === corrigindo.row.id ? 'Salvando...' : 'Salvar valor'}</button>
                    </>}
                >
                    <div className={modalStyles.stack}>
                        {erroCorrecao && <InlineNotice>{erroCorrecao}</InlineNotice>}
                        <label className={modalStyles.field}>
                            Valor recebido
                            <input value={corrigindo.valor} onChange={e => setCorrigindo({ ...corrigindo, valor: e.target.value })} inputMode="decimal" autoFocus />
                            <span className={modalStyles.hint}>Para as próximas cobranças usarem outro valor, use Valor combinado, acima.</span>
                        </label>
                    </div>
                </AdminModal>
            )}
        </div>
    );
}
