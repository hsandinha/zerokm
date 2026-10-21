'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { BadgeCheck, Check, CircleCheck, Clock, Copy, FileText, Landmark, MailWarning, Receipt, RefreshCw, Search, Send } from 'lucide-react';
import { AdminModal, modalStyles } from '@/components/admin/AdminModal';
import {
    Button, EmptyState, IconAction, Page, PageHeader, Panel, PanelFooter, PanelToolbar, PrimaryCell, RowActions,
    SearchField, Segmented, SkeletonRows, StatCard, StatGrid, StatusBadge, TwoLine, pageStyles, type BadgeTone,
} from '@/components/ui/Page';
import { InlineNotice, useFeedback } from '@/components/ui/Feedback';

type FiltroStatus = '' | 'pending' | 'approved' | 'cancelled';

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
    origem: 'sistema' | 'painel';
    podeReenviar: boolean;
    clienteConfirmado?: boolean;
    baixaManual?: { por: string | null; em: string; forma: string | null; dataPagamento: string | null } | null;
    email: {
        enviadoEm: string | null;
        para: string;
        id: string | null;
        erro: string | null;
        situacao: string | null;
    };
};

type FormaBaixa = 'pix' | 'transferencia' | 'dinheiro' | 'boleto' | 'cartao' | 'outro';
const FORMAS_BAIXA: Array<{ value: FormaBaixa; label: string }> = [
    { value: 'pix', label: 'PIX' },
    { value: 'transferencia', label: 'Transferência' },
    { value: 'dinheiro', label: 'Dinheiro' },
    { value: 'boleto', label: 'Boleto (pago no banco)' },
    { value: 'cartao', label: 'Cartão' },
    { value: 'outro', label: 'Outro' },
];

type Baixa = {
    row: Cobranca;
    forma: FormaBaixa;
    dataPagamento: string;
    observacao: string;
    cancelarBoleto: boolean;
    renovarAssinatura: boolean;
    clienteEmail: string;
};

const hojeISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const brl = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '-');
const dataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '-');

const STATUS_PAGAMENTO: Record<string, { label: string; tone: BadgeTone }> = {
    approved: { label: 'Pago', tone: 'positive' },
    pending: { label: 'Aguardando', tone: 'warning' },
    in_process: { label: 'Em análise', tone: 'warning' },
    rejected: { label: 'Recusado', tone: 'negative' },
    cancelled: { label: 'Cancelado', tone: 'neutral' },
    refunded: { label: 'Estornado', tone: 'neutral' },
};

// Eventos do Resend. "delivered" é o que interessa ao atendimento.
const STATUS_EMAIL: Record<string, { label: string; tone: BadgeTone }> = {
    delivered: { label: 'Entregue', tone: 'positive' },
    sent: { label: 'Enviado', tone: 'warning' },
    delivery_delayed: { label: 'Atrasado', tone: 'warning' },
    queued: { label: 'Na fila', tone: 'warning' },
    bounced: { label: 'Voltou', tone: 'negative' },
    complained: { label: 'Marcado como spam', tone: 'negative' },
    opened: { label: 'Aberto', tone: 'positive' },
    clicked: { label: 'Clicou', tone: 'positive' },
};

export function CobrancasManagement() {
    const [rows, setRows] = useState<Cobranca[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState<FiltroStatus>('');
    const [reenvio, setReenvio] = useState<{ row: Cobranca; email: string } | null>(null);
    const [reenviando, setReenviando] = useState(false);
    const [reenvioErro, setReenvioErro] = useState<string | null>(null);
    const [copiado, setCopiado] = useState<string | null>(null);
    const [avisoMP, setAvisoMP] = useState<string | null>(null);
    const [baixa, setBaixa] = useState<Baixa | null>(null);
    const [baixando, setBaixando] = useState(false);
    const [baixaErro, setBaixaErro] = useState<string | null>(null);
    const { notify, feedback } = useFeedback();

    /** Cobrança que aceita baixa manual: não paga, ou paga no painel do MP sem dono no sistema. */
    const podeDarBaixa = (row: Cobranca) => !row.baixaManual && (row.status !== 'approved' || row.origem === 'painel');

    const abrirBaixa = (row: Cobranca) => {
        setBaixaErro(null);
        const pendente = row.status === 'pending' || row.status === 'in_process';
        setBaixa({
            row,
            forma: row.status === 'approved' ? 'boleto' : 'pix',
            dataPagamento: hojeISO(),
            observacao: '',
            cancelarBoleto: pendente,
            renovarAssinatura: true,
            clienteEmail: row.clienteEmail || '',
        });
    };

    const darBaixa = async (event: FormEvent) => {
        event.preventDefault();
        if (!baixa) return;
        setBaixando(true);
        setBaixaErro(null);
        try {
            const painel = baixa.row.origem === 'painel';
            const res = await fetch('/api/admin/cobrancas/baixa', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...(painel ? { mpPaymentId: baixa.row.mpPaymentId, userEmail: baixa.clienteEmail.trim() } : { paymentId: baixa.row.id }),
                    forma: baixa.forma,
                    dataPagamento: baixa.dataPagamento,
                    observacao: baixa.observacao,
                    cancelarBoleto: baixa.cancelarBoleto,
                    renovarAssinatura: baixa.renovarAssinatura,
                }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'Não foi possível dar baixa');
            setBaixa(null);
            const vence = body.novoVencimento ? ` Assinatura renovada até ${data(body.novoVencimento)}.` : body.motivo ? ` ${body.motivo}` : '';
            notify(`Baixa registrada.${vence}`, 'positive');
            if (body.avisoMP) notify(body.avisoMP);
            await load();
        } catch (err: any) {
            setBaixaErro(err?.message || 'Não foi possível dar baixa');
        } finally {
            setBaixando(false);
        }
    };

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
            setAvisoMP(body.avisoMP || null);
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

    const abrirReenvio = (row: Cobranca) => {
        setReenvioErro(null);
        setReenvio({ row, email: row.email.para || row.clienteEmail || '' });
    };

    const reenviar = async (event: FormEvent) => {
        event.preventDefault();
        if (!reenvio) return;
        setReenviando(true);
        setReenvioErro(null);
        try {
            const res = await fetch(`/api/admin/cobrancas/${reenvio.row.id}/reenviar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: reenvio.email.trim() }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'Falha ao reenviar');
            setReenvio(null);
            notify(`Boleto reenviado para ${body.para}.`, 'positive');
            await load();
        } catch (err: any) {
            setReenvioErro(err?.message || 'Falha ao reenviar');
        } finally {
            setReenviando(false);
        }
    };

    const copiarCodigo = async (row: Cobranca) => {
        if (!row.boletoBarcode) return;
        try {
            await navigator.clipboard.writeText(row.boletoBarcode);
            setCopiado(row.id);
            setTimeout(() => setCopiado(null), 2000);
        } catch {
            notify('Não foi possível copiar. Abra o boleto e copie a linha digitável por lá.');
        }
    };

    const selosEmail = (row: Cobranca) => {
        if (row.origem === 'painel') return <StatusBadge dot={false}>Fora do sistema</StatusBadge>;
        if (row.email.erro) return <StatusBadge tone="negative">Falhou</StatusBadge>;
        if (!row.email.enviadoEm) return <StatusBadge>Não enviado</StatusBadge>;
        const s = row.email.situacao ? STATUS_EMAIL[row.email.situacao] : null;
        return <StatusBadge tone={s?.tone ?? 'warning'}>{s?.label || 'Enviado'}</StatusBadge>;
    };

    const aguardando = rows.filter(r => r.status === 'pending' || r.status === 'in_process');
    const valorAguardando = aguardando.reduce((soma, r) => soma + (Number(r.valor) || 0), 0);
    const pagos = rows.filter(r => r.status === 'approved');
    const falhasEmail = rows.filter(r => r.origem !== 'painel' && !!r.email.erro).length;
    const doPainel = rows.filter(r => r.origem === 'painel').length;
    const carregando = loading && rows.length === 0;

    return (
        <Page wide>
            <PageHeader
                title="Cobranças"
                count={carregando ? null : rows.length}
                description="Boletos do sistema e os emitidos no painel do Mercado Pago, com a situação do e-mail. O status é consultado no Mercado Pago a cada abertura."
                actions={<Button icon={<RefreshCw size={16} aria-hidden="true" />} onClick={load} disabled={loading}>{loading ? 'Atualizando...' : 'Atualizar'}</Button>}
            />

            <StatGrid>
                <StatCard label="Aguardando pagamento" icon={<Clock size={18} />} value={carregando ? '-' : aguardando.length} caption={carregando ? 'Na lista atual' : `${brl(valorAguardando)} em aberto na lista`} />
                <StatCard label="Pagos" icon={<CircleCheck size={18} />} value={carregando ? '-' : pagos.length} tone="positive" progress={rows.length ? (pagos.length / rows.length) * 100 : 0} caption="Entre os boletos listados" />
                <StatCard label="E-mails com falha" icon={<MailWarning size={18} />} value={carregando ? '-' : falhasEmail} tone={falhasEmail > 0 ? 'negative' : 'default'} caption="Precisam de reenvio" />
                <StatCard label="Emitidos no painel MP" icon={<Landmark size={18} />} value={carregando ? '-' : doPainel} caption="Sem envio pelo sistema" />
            </StatGrid>

            <Panel>
                <PanelToolbar>
                    <Segmented<FiltroStatus>
                        label="Filtrar por pagamento"
                        value={status}
                        onChange={setStatus}
                        options={[
                            { value: '', label: 'Todos' },
                            { value: 'pending', label: 'Aguardando' },
                            { value: 'approved', label: 'Pagos' },
                            { value: 'cancelled', label: 'Cancelados' },
                        ]}
                    />
                    <SearchField value={search} onChange={setSearch} placeholder="Cliente, e-mail ou id do pagamento" />
                </PanelToolbar>

                {(error || avisoMP) && (
                    <div className={pageStyles.panelNotice}>
                        {error && <InlineNotice>{error}</InlineNotice>}
                        {avisoMP && <InlineNotice tone="warning">{avisoMP} Os status abaixo podem estar desatualizados.</InlineNotice>}
                    </div>
                )}

                <div className={pageStyles.tableWrap}>
                    <table className={pageStyles.table}>
                        <thead>
                            <tr>
                                <th>Cliente</th>
                                <th>Plano</th>
                                <th className={pageStyles.num}>Valor</th>
                                <th>Emitido</th>
                                <th>Pagamento</th>
                                <th>E-mail do boleto</th>
                                <th className={pageStyles.shrink}><span className={pageStyles.srOnly}>Ações</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {carregando && <SkeletonRows rows={5} columns={7} />}
                            {!carregando && rows.map(row => {
                                const sp = STATUS_PAGAMENTO[row.status] || { label: row.status, tone: 'neutral' as BadgeTone };
                                return (
                                    <tr key={row.id}>
                                        <td className={pageStyles.colMain}>
                                            <PrimaryCell
                                                title={<>{row.cliente}{row.origem === 'painel' && <> <StatusBadge dot={false}>{row.clienteConfirmado ? 'Painel MP' : 'Painel MP · cliente incerto'}</StatusBadge></>}</>}
                                                subtitle={<>
                                                    {row.clienteEmail}
                                                    {row.assinaturaExpiraEm && <span className={pageStyles.subLine}>Assinatura vence {data(row.assinaturaExpiraEm)}</span>}
                                                </>}
                                            />
                                        </td>
                                        <td>{row.plano}</td>
                                        <td className={pageStyles.num}><strong>{brl(row.valor)}</strong></td>
                                        <td><span className={pageStyles.nowrap}>{data(row.criadoEm)}</span></td>
                                        <td>
                                            {row.baixaManual ? (
                                                <TwoLine
                                                    top={<StatusBadge tone="positive">Pago · baixa manual</StatusBadge>}
                                                    bottom={<span className={pageStyles.subLine} title={row.baixaManual.por ? `Baixa por ${row.baixaManual.por}` : undefined}>
                                                        {[FORMAS_BAIXA.find(f => f.value === row.baixaManual?.forma)?.label, row.baixaManual.dataPagamento ? `em ${data(row.baixaManual.dataPagamento)}` : null].filter(Boolean).join(' ')}
                                                    </span>}
                                                />
                                            ) : <StatusBadge tone={sp.tone}>{sp.label}</StatusBadge>}
                                        </td>
                                        <td>
                                            <TwoLine
                                                top={selosEmail(row)}
                                                bottom={<>
                                                    {row.email.para || '-'}
                                                    <span className={pageStyles.subLine}>{row.email.enviadoEm ? dataHora(row.email.enviadoEm) : 'Nunca enviado'}</span>
                                                    {row.email.erro && <span className={pageStyles.subLine}>{row.email.erro}</span>}
                                                </>}
                                            />
                                        </td>
                                        <td>
                                            <RowActions>
                                                {row.boletoUrl && (
                                                    <IconAction label="Abrir boleto" href={row.boletoUrl}>
                                                        <FileText size={17} aria-hidden="true" />
                                                    </IconAction>
                                                )}
                                                {row.boletoBarcode && (
                                                    <IconAction label={copiado === row.id ? 'Código copiado' : 'Copiar linha digitável'} onClick={() => copiarCodigo(row)}>
                                                        {copiado === row.id ? <Check size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}
                                                    </IconAction>
                                                )}
                                                {row.podeReenviar && row.boletoUrl && row.status !== 'approved' && (
                                                    <IconAction label="Reenviar boleto por e-mail" onClick={() => abrirReenvio(row)}>
                                                        <Send size={17} aria-hidden="true" />
                                                    </IconAction>
                                                )}
                                                {podeDarBaixa(row) && (
                                                    <IconAction
                                                        label={row.status === 'approved' ? 'Ligar ao cliente e renovar a assinatura' : 'Dar baixa: marcar como pago'}
                                                        onClick={() => abrirBaixa(row)}
                                                    >
                                                        <BadgeCheck size={17} aria-hidden="true" />
                                                    </IconAction>
                                                )}
                                            </RowActions>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {!carregando && rows.length === 0 && (
                    <EmptyState
                        icon={search || status ? <Search size={20} /> : <Receipt size={20} />}
                        title={search || status ? 'Nenhuma cobrança encontrada' : 'Nenhum boleto emitido ainda'}
                        description={search || status ? 'Ajuste a busca ou o filtro de pagamento.' : 'Os boletos aparecem aqui assim que um cliente escolhe pagar por boleto.'}
                    />
                )}

                {!carregando && rows.length > 0 && (
                    <PanelFooter aside="Mais recentes primeiro, até 50 por consulta">
                        Mostrando <strong>{rows.length}</strong> {rows.length === 1 ? 'boleto' : 'boletos'}
                    </PanelFooter>
                )}
            </Panel>

            {baixa && (
                <AdminModal
                    title={baixa.row.status === 'approved' ? 'Ligar pagamento ao cliente' : 'Dar baixa manual'}
                    subtitle={<>{baixa.row.cliente} · {baixa.row.plano} · {brl(baixa.row.valor)}</>}
                    size="sm"
                    busy={baixando}
                    onClose={() => setBaixa(null)}
                    onSubmit={darBaixa}
                    footer={<>
                        <button type="button" className={modalStyles.secondary} onClick={() => setBaixa(null)} disabled={baixando}>Cancelar</button>
                        <button type="submit" className={modalStyles.primary} disabled={baixando || (baixa.row.origem === 'painel' && !baixa.clienteEmail.trim())}>
                            {baixando ? 'Salvando...' : 'Marcar como pago'}
                        </button>
                    </>}
                >
                    <div className={modalStyles.stack}>
                        <p className={modalStyles.flush}>
                            {baixa.row.status === 'approved'
                                ? 'Este boleto foi pago no Mercado Pago, mas foi emitido no painel e não está ligado a nenhum cliente. Informe o cliente para registrar o pagamento e renovar o acesso dele.'
                                : 'Use quando o cliente pagou por fora do boleto (PIX direto, transferência). A cobrança fica como paga e o acesso do cliente é renovado.'}
                        </p>
                        {baixa.row.origem === 'painel' && (
                            <label className={modalStyles.field}>
                                E-mail do cliente
                                <input type="email" required value={baixa.clienteEmail} onChange={e => setBaixa({ ...baixa, clienteEmail: e.target.value })} />
                                <span className={modalStyles.hint}>{baixa.row.clienteConfirmado ? 'Preenchido pelo nome na descrição do boleto. Confira.' : 'Não deu para identificar o cliente pela descrição do boleto.'}</span>
                            </label>
                        )}
                        <div className={modalStyles.grid2}>
                            <label className={modalStyles.field}>
                                Como pagou
                                <select value={baixa.forma} onChange={e => setBaixa({ ...baixa, forma: e.target.value as FormaBaixa })}>
                                    {FORMAS_BAIXA.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                                </select>
                            </label>
                            <label className={modalStyles.field}>
                                Data do pagamento
                                <input type="date" required value={baixa.dataPagamento} max={hojeISO()} onChange={e => setBaixa({ ...baixa, dataPagamento: e.target.value })} />
                            </label>
                        </div>
                        <label className={modalStyles.field}>
                            Observação (opcional)
                            <input type="text" maxLength={500} value={baixa.observacao} onChange={e => setBaixa({ ...baixa, observacao: e.target.value })} placeholder="Ex.: comprovante enviado no WhatsApp" />
                        </label>
                        <div className={modalStyles.choices}>
                            {(baixa.row.status === 'pending' || baixa.row.status === 'in_process') && (
                                <label className={modalStyles.choice}>
                                    <input type="checkbox" checked={baixa.cancelarBoleto} onChange={e => setBaixa({ ...baixa, cancelarBoleto: e.target.checked })} />
                                    Cancelar o boleto no Mercado Pago (evita pagar duas vezes)
                                </label>
                            )}
                            <label className={modalStyles.choice}>
                                <input type="checkbox" checked={baixa.renovarAssinatura} onChange={e => setBaixa({ ...baixa, renovarAssinatura: e.target.checked })} />
                                Renovar a assinatura do cliente
                            </label>
                        </div>
                        {baixaErro && <InlineNotice>{baixaErro}</InlineNotice>}
                    </div>
                </AdminModal>
            )}

            {reenvio && (
                <AdminModal
                    title="Reenviar boleto"
                    subtitle={<>{reenvio.row.cliente} · {reenvio.row.plano} · {brl(reenvio.row.valor)}</>}
                    size="sm"
                    busy={reenviando}
                    onClose={() => setReenvio(null)}
                    onSubmit={reenviar}
                    footer={<>
                        <button type="button" className={modalStyles.secondary} onClick={() => setReenvio(null)} disabled={reenviando}>Cancelar</button>
                        <button type="submit" className={modalStyles.primary} disabled={reenviando || !reenvio.email.trim()}>{reenviando ? 'Enviando...' : 'Reenviar boleto'}</button>
                    </>}
                >
                    <div className={modalStyles.stack}>
                        <label className={modalStyles.field}>
                            E-mail de destino
                            <input
                                type="email"
                                required
                                autoFocus
                                value={reenvio.email}
                                onChange={e => setReenvio({ ...reenvio, email: e.target.value })}
                            />
                            <span className={modalStyles.hint}>O boleto sai com o mesmo link e a mesma linha digitável.</span>
                        </label>
                        {reenvioErro && <InlineNotice>{reenvioErro}</InlineNotice>}
                    </div>
                </AdminModal>
            )}
            {feedback}
        </Page>
    );
}
