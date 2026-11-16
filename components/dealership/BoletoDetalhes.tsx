'use client';

import { useState } from 'react';
import { modalStyles } from '@/components/admin/AdminModal';
import { StatusBadge, type BadgeTone } from '@/components/ui/Page';
import { situacaoDaCobranca } from '@/lib/utils/cobrancaConcessionaria';
import styles from './BoletoConcessionaria.module.css';

export type CobrancaDaLoja = {
    id: string;
    mpPaymentId: string | null;
    tipo: 'plano' | 'banner' | 'avulsa' | null;
    tipoLabel: string;
    descricao: string;
    valor: number;
    status: string;
    meio: string;
    vencimento: string | null;
    criadoEm: string | null;
    pagoEm: string | null;
    baixaManual: boolean;
    boletoUrl: string | null;
    boletoBarcode: string | null;
};

export const brl = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const dataBR = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-');

const TOM: Record<ReturnType<typeof situacaoDaCobranca>['chave'], BadgeTone> = {
    paga: 'positive', aguardando: 'warning', vencida: 'negative', cancelada: 'neutral', recusada: 'negative', estornada: 'neutral',
};

export function SeloSituacao({ cobranca }: { cobranca: Pick<CobrancaDaLoja, 'status' | 'vencimento' | 'baixaManual'> }) {
    const s = situacaoDaCobranca({ status: cobranca.status, vencimento: cobranca.vencimento, baixaManual: cobranca.baixaManual ? { em: true } : null });
    return <StatusBadge tone={TOM[s.chave]}>{s.label}</StatusBadge>;
}

/** Lista do que falta no cadastro da concessionária para o boleto sair. */
export function CadastroIncompleto({ faltando, paraEquipe = false }: { faltando: string[]; paraEquipe?: boolean }) {
    return (
        <div role="alert">
            <strong>{paraEquipe ? 'O cadastro desta concessionária está incompleto para emitir boleto.' : 'Para pagar por boleto, complete o cadastro da sua loja.'}</strong>
            <ul className={styles.faltando}>
                {faltando.map(item => <li key={item}>{item}</li>)}
            </ul>
            <span className={modalStyles.hint}>
                {paraEquipe ? 'Complete os dados na ficha da concessionária e emita de novo.' : 'Atualize em Meu perfil ou peça ao CNV para completar os dados.'}
            </span>
        </div>
    );
}

/**
 * O boleto pronto: valor, vencimento, situação, linha digitável para copiar e
 * o link do PDF. O mesmo bloco aparece para a equipe (depois de emitir) e para
 * a concessionária (ao pagar e no histórico).
 */
export function BoletoDetalhes({ cobranca }: { cobranca: CobrancaDaLoja }) {
    const [copiado, setCopiado] = useState(false);
    const [erroCopia, setErroCopia] = useState(false);

    const copiar = async () => {
        if (!cobranca.boletoBarcode) return;
        try {
            await navigator.clipboard.writeText(cobranca.boletoBarcode);
            setCopiado(true);
            setErroCopia(false);
            setTimeout(() => setCopiado(false), 2500);
        } catch {
            setErroCopia(true);
        }
    };

    return (
        <div className={modalStyles.stack}>
            <div className={styles.resumo}>
                <div>
                    <span className={modalStyles.factLabel}>{cobranca.descricao}</span>
                    <p className={styles.valor}>{brl(cobranca.valor)}</p>
                </div>
                <SeloSituacao cobranca={cobranca} />
            </div>

            <div className={modalStyles.facts}>
                <div className={modalStyles.fact}>
                    <span className={modalStyles.factLabel}>Vencimento</span>
                    <strong className={modalStyles.factValue}>{dataBR(cobranca.vencimento)}</strong>
                </div>
                <div className={modalStyles.fact}>
                    <span className={modalStyles.factLabel}>Emitido em</span>
                    <strong className={modalStyles.factValue}>{dataBR(cobranca.criadoEm)}</strong>
                </div>
                {cobranca.pagoEm && (
                    <div className={modalStyles.fact}>
                        <span className={modalStyles.factLabel}>Pago em</span>
                        <strong className={modalStyles.factValue}>{dataBR(cobranca.pagoEm)}</strong>
                    </div>
                )}
            </div>

            {(cobranca.boletoBarcode || cobranca.boletoUrl) ? (
                <div className={styles.linha}>
                    <span className={styles.linhaRotulo}>Linha digitável / código de barras</span>
                    <span className={styles.linhaCodigo}>{cobranca.boletoBarcode || 'Disponível no PDF do boleto'}</span>
                    <div className={styles.linhaAcoes}>
                        {cobranca.boletoBarcode && (
                            <button type="button" className={modalStyles.secondary} onClick={copiar}>
                                {copiado ? 'Código copiado' : 'Copiar código'}
                            </button>
                        )}
                        {cobranca.boletoUrl && (
                            <a href={cobranca.boletoUrl} target="_blank" rel="noreferrer" className={modalStyles.primary}>Abrir boleto (PDF)</a>
                        )}
                    </div>
                    {erroCopia && <span className={modalStyles.fieldError}>Não foi possível copiar. Selecione o código acima e copie.</span>}
                </div>
            ) : (
                <p className={styles.vazio}>Esta cobrança não tem boleto.</p>
            )}
        </div>
    );
}
