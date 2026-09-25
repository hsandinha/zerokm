'use client';

import { InlineNotice, useFeedback } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Page';
import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './RepasseCatalog.module.css';

type PlanoInfo = {
    ativo: boolean;
    status: string;
    planName: string | null;
    billingType: 'monthly' | 'annual' | null;
    expiresAt: string | null;
    activationMethod: string | null;
};

type PlanoVenda = {
    id: string;
    name: string;
    description: string;
    price: number;
    annualPrice: number | null;
    features: string[];
};

type Pix = { paymentId: string; qrCode: string | null; qrCodeBase64: string | null; amount: number };

const brl = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '-');

const METODO_LABEL: Record<string, string> = {
    pix: 'PIX', boleto: 'boleto', card: 'cartão', manual: 'ativação manual', cortesia: 'cortesia',
};

/**
 * Plano de repasse da concessionária.
 * - Concessionária (sem `concessionariaId`): vê a situação e contrata/renova por PIX.
 * - Equipe interna (com `concessionariaId`): ativa manualmente ou como cortesia, ou desativa.
 */
export function PlanoRepasseCard({ concessionariaId, onChange }: { concessionariaId?: string; onChange?: (ativo: boolean) => void }) {
    const { confirm, feedback } = useFeedback();
    const isStaff = Boolean(concessionariaId);
    const [plano, setPlano] = useState<PlanoInfo | null>(null);
    const [planos, setPlanos] = useState<PlanoVenda[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandido, setExpandido] = useState(false);

    const [planId, setPlanId] = useState('');
    const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');
    const [metodo, setMetodo] = useState<'manual' | 'cortesia'>('manual');
    const [busy, setBusy] = useState(false);
    const [pix, setPix] = useState<Pix | null>(null);
    const [copiado, setCopiado] = useState(false);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const qs = concessionariaId ? `?concessionariaId=${encodeURIComponent(concessionariaId)}` : '';
            const res = await fetch(`/api/dealership/plano-repasse${qs}`);
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'Erro ao carregar o plano');
            setPlano(body.plano);
            setPlanos(body.planos || []);
            setPlanId(prev => prev || body.plano?.planId || body.planos?.[0]?.id || '');
            onChange?.(Boolean(body.plano?.ativo));
        } catch (err: any) {
            setError(err?.message || 'Erro ao carregar o plano');
        } finally {
            setLoading(false);
        }
    }, [concessionariaId, onChange]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

    const escolhido = planos.find(p => p.id === planId) || null;
    const valor = escolhido ? (billing === 'annual' && escolhido.annualPrice ? escolhido.annualPrice : escolhido.price) : 0;

    const gerarPix = async () => {
        if (!escolhido) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch('/api/checkout/plano-repasse/pix', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ planId: escolhido.id, billingType: billing }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'Erro ao gerar PIX');
            setPix({ paymentId: String(body.paymentId), qrCode: body.qrCode, qrCodeBase64: body.qrCodeBase64, amount: body.amount });

            // A ativação vem pelo webhook; aqui só acompanhamos até aprovar.
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = setInterval(async () => {
                const st = await fetch(`/api/checkout/status/${body.paymentId}`).then(r => r.json()).catch(() => null);
                if (st?.status === 'approved') {
                    if (pollRef.current) clearInterval(pollRef.current);
                    // Dá tempo do webhook gravar antes de reler.
                    setTimeout(() => { setPix(null); setExpandido(false); load(); }, 2500);
                }
            }, 5000);
        } catch (err: any) {
            setError(err?.message || 'Erro ao gerar PIX');
        } finally {
            setBusy(false);
        }
    };

    const ativarManual = async (acao: 'ativar' | 'desativar') => {
        if (acao === 'desativar') {
            const ok = await confirm({ title: 'Desativar plano de repasse', description: 'Os anúncios de repasse da loja saem da vitrine na hora.', confirmLabel: 'Desativar plano', danger: true });
            if (!ok) return;
        }
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/concessionarias/${concessionariaId}/plano-repasse`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(acao === 'ativar' ? { acao, planId, billingType: billing, metodo } : { acao }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'Erro ao atualizar o plano');
            setExpandido(false);
            await load();
        } catch (err: any) {
            setError(err?.message || 'Erro ao atualizar o plano');
        } finally {
            setBusy(false);
        }
    };

    if (loading && !plano) return <div className={styles.planoCard}>Carregando plano de repasse...</div>;

    const ativo = Boolean(plano?.ativo);
    const vencido = !ativo && plano?.status === 'active' && plano?.expiresAt;

    return (
        <div className={`${styles.planoCard} ${ativo ? styles.planoAtivo : styles.planoInativo}`}>
            <div className={styles.planoHeader}>
                <div>
                    <strong>{ativo ? `Plano de repasse ativo: ${plano?.planName}` : vencido ? 'Plano de repasse vencido' : 'Sem plano de repasse'}</strong>
                    <p className={styles.planoTexto}>
                        {ativo
                            ? `Válido até ${data(plano!.expiresAt)}${plano?.activationMethod ? ` · ${METODO_LABEL[plano.activationMethod] || plano.activationMethod}` : ''}. Seus repasses aparecem para os lojistas.`
                            : vencido
                                ? `Venceu em ${data(plano!.expiresAt)}. Os anúncios estão fora da vitrine até a renovação. Nada foi apagado.`
                                : 'Para anunciar repasse para os lojistas, contrate um plano.'}
                    </p>
                </div>
                {!expandido && (
                    <Button variant={ativo ? 'secondary' : 'primary'} onClick={() => setExpandido(true)} disabled={planos.length === 0 && !isStaff}>
                        {isStaff ? (ativo ? 'Renovar ou alterar' : 'Ativar plano') : ativo ? 'Renovar plano' : 'Contratar plano'}
                    </Button>
                )}
            </div>

            {planos.length === 0 && !loading && (
                <p className={styles.planoTexto}>Nenhum plano de concessionária cadastrado. Crie um em Administração › Planos, com o público Concessionária.</p>
            )}

            {expandido && planos.length > 0 && (
                <div className={styles.planoBody}>
                    <div className={styles.planoOpcoes}>
                        {planos.map(p => (
                            <label key={p.id} className={`${styles.planoOpcao} ${planId === p.id ? styles.planoOpcaoAtiva : ''}`}>
                                <input type="radio" name="plano-repasse" checked={planId === p.id} onChange={() => { setPlanId(p.id); if (!p.annualPrice) setBilling('monthly'); }} />
                                <span>
                                    <strong>{p.name}</strong> · {brl(p.price)}/mês{p.annualPrice ? ` ou ${brl(p.annualPrice)}/ano` : ''}
                                    {p.description && <span className={styles.planoTexto}> · {p.description}</span>}
                                    {p.features.length > 0 && <span className={styles.planoTexto}> {p.features.join(' · ')}</span>}
                                </span>
                            </label>
                        ))}
                    </div>

                    <div className={styles.formGrid}>
                        <label>
                            Período
                            <select value={billing} onChange={e => setBilling(e.target.value as 'monthly' | 'annual')}>
                                <option value="monthly">Mensal (30 dias)</option>
                                {escolhido?.annualPrice && <option value="annual">Anual</option>}
                            </select>
                        </label>
                        {isStaff && (
                            <label>
                                Forma
                                <select value={metodo} onChange={e => setMetodo(e.target.value as 'manual' | 'cortesia')}>
                                    <option value="manual">Pagamento recebido por fora</option>
                                    <option value="cortesia">Cortesia</option>
                                </select>
                            </label>
                        )}
                    </div>

                    {pix ? (
                        <div className={styles.pixBox}>
                            {pix.qrCodeBase64 && <img src={`data:image/png;base64,${pix.qrCodeBase64}`} alt="QR Code PIX" width={180} height={180} />}
                            <div>
                                <strong>Pague {brl(pix.amount)} com PIX</strong>
                                <p className={styles.planoTexto}>O plano ativa sozinho assim que o pagamento for confirmado. Pode deixar esta tela aberta.</p>
                                {pix.qrCode && (
                                    <Button onClick={() => { navigator.clipboard?.writeText(pix.qrCode || ''); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }}>
                                        {copiado ? 'Código copiado' : 'Copiar código PIX'}
                                    </Button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className={styles.formActions}>
                            <Button variant="ghost" onClick={() => setExpandido(false)} disabled={busy}>Cancelar</Button>
                            {isStaff && ativo && (
                                <Button variant="danger" onClick={() => ativarManual('desativar')} disabled={busy}>Desativar plano</Button>
                            )}
                            {isStaff ? (
                                <Button variant="primary" onClick={() => ativarManual('ativar')} disabled={busy || !planId}>
                                    {busy ? 'Salvando...' : ativo ? 'Renovar' : 'Ativar'}
                                </Button>
                            ) : (
                                <Button variant="primary" onClick={gerarPix} disabled={busy || !escolhido}>
                                    {busy ? 'Gerando PIX...' : `Pagar ${brl(valor)} com PIX`}
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            )}

            {error && <InlineNotice>{error}</InlineNotice>}
            {feedback}
        </div>
    );
}
