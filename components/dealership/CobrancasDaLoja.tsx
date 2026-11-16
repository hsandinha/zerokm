'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, FileText, Receipt, RefreshCw } from 'lucide-react';
import { AdminModal, modalStyles } from '@/components/admin/AdminModal';
import {
    Button, EmptyState, IconAction, Page, PageHeader, Panel, PanelFooter, PrimaryCell, RowActions, SkeletonRows, StatCard, StatGrid, pageStyles,
} from '@/components/ui/Page';
import { InlineNotice } from '@/components/ui/Feedback';
import { situacaoDaCobranca } from '@/lib/utils/cobrancaConcessionaria';
import { BoletoDetalhes, CadastroIncompleto, SeloSituacao, brl, dataBR, type CobrancaDaLoja } from './BoletoDetalhes';

const MEIO: Record<string, string> = { boleto: 'Boleto', pix: 'PIX', credit_card: 'Cartão', debit_card: 'Cartão', cortesia: 'Cortesia' };

/**
 * Cobranças da concessionária: os boletos que o CNV emitiu para a loja e os
 * pagamentos que ela mesma gerou (plano de repasse, banner). Daqui a loja
 * reabre o boleto, copia a linha digitável e acompanha a situação.
 */
export function CobrancasDaLoja() {
    const [rows, setRows] = useState<CobrancaDaLoja[]>([]);
    const [faltando, setFaltando] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [aberta, setAberta] = useState<CobrancaDaLoja | null>(null);
    const [copiado, setCopiado] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/dealership/cobrancas');
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'Erro ao carregar as cobranças');
            setRows(body.cobrancas || []);
            setFaltando(body.faltando || []);
        } catch (err: any) {
            setError(err?.message || 'Erro ao carregar as cobranças');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const copiar = async (row: CobrancaDaLoja) => {
        if (!row.boletoBarcode) return;
        try {
            await navigator.clipboard.writeText(row.boletoBarcode);
            setCopiado(row.id);
            setTimeout(() => setCopiado(null), 2000);
        } catch {
            setAberta(row);
        }
    };

    const situacao = (r: CobrancaDaLoja) => situacaoDaCobranca({ status: r.status, vencimento: r.vencimento, baixaManual: r.baixaManual ? { em: true } : null }).chave;
    const emAberto = rows.filter(r => situacao(r) === 'aguardando');
    const vencidas = rows.filter(r => situacao(r) === 'vencida');
    const pagas = rows.filter(r => situacao(r) === 'paga');
    // Em centavos, para a soma não carregar erro de ponto flutuante.
    const totalEmAberto = emAberto.reduce((soma, r) => soma + Math.round((Number(r.valor) || 0) * 100), 0) / 100;
    const carregando = loading && rows.length === 0;

    return (
        <Page wide>
            <PageHeader
                title="Cobranças"
                count={carregando ? null : rows.length}
                description="Boletos e pagamentos da sua loja no CNV: plano de repasse, banners e cobranças avulsas."
                actions={<Button icon={<RefreshCw size={16} aria-hidden="true" />} onClick={load} disabled={loading}>{loading ? 'Atualizando...' : 'Atualizar'}</Button>}
            />

            <StatGrid>
                <StatCard label="Em aberto" value={carregando ? '-' : emAberto.length} tone={emAberto.length > 0 ? 'warning' : 'default'} caption={carregando ? 'Carregando' : `${brl(totalEmAberto)} a pagar`} />
                <StatCard label="Vencidas" value={carregando ? '-' : vencidas.length} tone={vencidas.length > 0 ? 'negative' : 'default'} caption="Boleto vencido não pode ser pago. Peça um novo ao CNV." />
                <StatCard label="Pagas" value={carregando ? '-' : pagas.length} tone="positive" caption="Pagamentos confirmados" />
            </StatGrid>

            {!carregando && faltando.length > 0 && (
                <InlineNotice tone="warning"><CadastroIncompleto faltando={faltando} /></InlineNotice>
            )}

            <Panel>
                {error && <div className={pageStyles.panelNotice}><InlineNotice>{error}</InlineNotice></div>}
                <div className={pageStyles.tableWrap}>
                    <table className={pageStyles.table}>
                        <thead>
                            <tr>
                                <th>Cobrança</th>
                                <th className={pageStyles.num}>Valor</th>
                                <th>Emitido</th>
                                <th>Vencimento</th>
                                <th>Situação</th>
                                <th className={pageStyles.shrink}><span className={pageStyles.srOnly}>Ações</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {carregando && <SkeletonRows rows={4} columns={6} />}
                            {!carregando && rows.map(row => (
                                <tr key={row.id}>
                                    <td className={pageStyles.colMain}>
                                        <PrimaryCell title={row.descricao} subtitle={<>{row.tipoLabel} · {MEIO[row.meio] || row.meio}</>} />
                                    </td>
                                    <td className={pageStyles.num}><strong>{brl(row.valor)}</strong></td>
                                    <td><span className={pageStyles.nowrap}>{dataBR(row.criadoEm)}</span></td>
                                    <td><span className={pageStyles.nowrap}>{dataBR(row.vencimento)}</span></td>
                                    <td>
                                        <SeloSituacao cobranca={row} />
                                        {row.pagoEm && <span className={pageStyles.subLine}>em {dataBR(row.pagoEm)}</span>}
                                    </td>
                                    <td>
                                        <RowActions>
                                            {row.boletoBarcode && (
                                                <IconAction label={copiado === row.id ? 'Código copiado' : 'Copiar linha digitável'} onClick={() => copiar(row)}>
                                                    {copiado === row.id ? <Check size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}
                                                </IconAction>
                                            )}
                                            {(row.boletoUrl || row.boletoBarcode) && (
                                                <IconAction label="Ver boleto" onClick={() => setAberta(row)}>
                                                    <FileText size={17} aria-hidden="true" />
                                                </IconAction>
                                            )}
                                        </RowActions>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {!carregando && rows.length === 0 && !error && (
                    <EmptyState
                        icon={<Receipt size={20} />}
                        title="Nenhuma cobrança ainda"
                        description="Os boletos emitidos pelo CNV e os pagamentos do plano de repasse e dos banners aparecem aqui."
                    />
                )}
                {!carregando && rows.length > 0 && (
                    <PanelFooter aside="Mais recentes primeiro">
                        Mostrando <strong>{rows.length}</strong> {rows.length === 1 ? 'cobrança' : 'cobranças'}
                    </PanelFooter>
                )}
            </Panel>

            {aberta && (
                <AdminModal
                    title="Boleto"
                    subtitle={aberta.tipoLabel}
                    size="sm"
                    onClose={() => setAberta(null)}
                    footer={<button type="button" className={modalStyles.primary} onClick={() => setAberta(null)}>Fechar</button>}
                >
                    <BoletoDetalhes cobranca={aberta} />
                </AdminModal>
            )}
        </Page>
    );
}
