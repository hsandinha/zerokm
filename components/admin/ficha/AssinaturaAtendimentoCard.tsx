'use client';

import { useCallback, useEffect, useState } from 'react';
import { InlineNotice, useFeedback } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Page';
// Mesmo cartão do plano de repasse, para as duas assinaturas terem a mesma cara.
import styles from '@/components/dealership/RepasseCatalog.module.css';

type Access = { active: boolean; trial: boolean; trialEndsAt: string | null; expiresAt: string | null; planName: string | null };
type Plano = { id: string; name: string; price: number; annualPrice: number | null };
type Dados = { liberado: boolean; iniciado: boolean; access: Access | null; planos: Plano[] };

const brl = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '-');

/**
 * Assinatura do atendimento por WhatsApp da loja, na ficha da concessionária:
 * situação, teste, plano e ativação à mão (pagamento por fora ou cortesia).
 * Regra em wa/lib/assinatura-atendimento.ts; rota em
 * /api/admin/concessionarias/:id/atendimento (só administrador).
 */
export function AssinaturaAtendimentoCard({ concessionariaId, onChange, onAbrirFuncionalidades }: {
    concessionariaId: string;
    onChange?: () => void;
    onAbrirFuncionalidades?: () => void;
}) {
    const { confirm, feedback } = useFeedback();
    const [dados, setDados] = useState<Dados | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [expandido, setExpandido] = useState(false);
    const [planId, setPlanId] = useState('');
    const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');
    const [metodo, setMetodo] = useState<'manual' | 'cortesia'>('manual');
    const [busy, setBusy] = useState(false);

    const rota = `/api/admin/concessionarias/${concessionariaId}/atendimento`;

    const carregar = useCallback(async () => {
        try {
            const res = await fetch(rota);
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body.error || 'Erro ao carregar a assinatura do atendimento');
            setDados(body);
            setPlanId(prev => prev || body.planos?.[0]?.id || '');
            setErro(null);
        } catch (e: any) {
            setErro(e?.message || 'Erro ao carregar a assinatura do atendimento');
        }
    }, [rota]);

    useEffect(() => { void carregar(); }, [carregar]);

    const enviar = async (corpo: Record<string, unknown>) => {
        setBusy(true);
        setErro(null);
        try {
            const res = await fetch(rota, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body.error || 'Erro ao atualizar a assinatura');
            setExpandido(false);
            await carregar();
            onChange?.();
        } catch (e: any) {
            setErro(e?.message || 'Erro ao atualizar a assinatura');
        } finally {
            setBusy(false);
        }
    };

    const desativar = async () => {
        const ok = await confirm({
            title: 'Desativar assinatura do atendimento',
            description: 'A IA da loja para de responder e as conversas vão direto para a equipe dela. Nada é apagado.',
            confirmLabel: 'Desativar assinatura',
            danger: true,
        });
        if (ok) await enviar({ acao: 'desativar' });
    };

    if (!dados) {
        return erro
            ? <InlineNotice>{erro}</InlineNotice>
            : <div className={styles.planoCard}>Carregando assinatura do atendimento...</div>;
    }

    const a = dados.access;
    const assinante = Boolean(a?.active && !a.trial);
    const emTeste = Boolean(a?.active && a.trial);
    const escolhido = dados.planos.find(p => p.id === planId) || null;

    const titulo = !dados.liberado ? 'Atendimento não liberado para esta loja'
        : !dados.iniciado ? 'Atendimento liberado, ainda sem uso'
            : assinante ? `Assinatura do atendimento ativa: ${a?.planName || 'plano'}`
                : emTeste ? 'Atendimento em período de teste'
                    : 'Assinatura do atendimento vencida';
    const texto = !dados.liberado ? 'Para a loja usar a Central de conversas e a IA, libere o Atendimento nas funcionalidades desta conta.'
        : !dados.iniciado ? 'O teste de 7 dias começa no primeiro acesso da loja ao atendimento. Você já pode ativar um plano.'
            : assinante ? `Válida até ${data(a!.expiresAt)}. A Central e a IA da loja estão no ar.`
                : emTeste ? `Teste até ${data(a!.trialEndsAt)}. Depois disso a IA para, até a loja assinar.`
                    : `${a?.expiresAt ? `Venceu em ${data(a.expiresAt)}` : `O teste acabou em ${data(a?.trialEndsAt ?? null)}`}. A IA está parada e as conversas vão direto para a equipe da loja.`;

    return (
        <div className={`${styles.planoCard} ${assinante || emTeste ? styles.planoAtivo : styles.planoInativo}`}>
            <div className={styles.planoHeader}>
                <div>
                    <strong>{titulo}</strong>
                    <p className={styles.planoTexto}>{texto}</p>
                </div>
                {!dados.liberado
                    ? onAbrirFuncionalidades && <Button variant="primary" onClick={onAbrirFuncionalidades}>Liberar em Funcionalidades</Button>
                    : !expandido && (
                        <Button variant={assinante ? 'secondary' : 'primary'} onClick={() => setExpandido(true)}>
                            {assinante ? 'Renovar ou alterar' : 'Ativar plano'}
                        </Button>
                    )}
            </div>

            {dados.liberado && dados.planos.length === 0 && (
                <p className={styles.planoTexto}>Nenhum plano de atendimento cadastrado. Crie um em Administração › Planos, com o público Atendimento.</p>
            )}

            {expandido && dados.planos.length > 0 && (
                <div className={styles.planoBody}>
                    <div className={styles.planoOpcoes}>
                        {dados.planos.map(p => (
                            <label key={p.id} className={`${styles.planoOpcao} ${planId === p.id ? styles.planoOpcaoAtiva : ''}`}>
                                <input type="radio" name="plano-atendimento" checked={planId === p.id} onChange={() => { setPlanId(p.id); if (!p.annualPrice) setBilling('monthly'); }} />
                                <span><strong>{p.name}</strong> · {brl(p.price)}/mês{p.annualPrice ? ` ou ${brl(p.annualPrice)}/ano` : ''}</span>
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
                        <label>
                            Forma
                            <select value={metodo} onChange={e => setMetodo(e.target.value as 'manual' | 'cortesia')}>
                                <option value="manual">Pagamento recebido por fora</option>
                                <option value="cortesia">Cortesia</option>
                            </select>
                        </label>
                    </div>
                    <div className={styles.formActions}>
                        <Button variant="ghost" onClick={() => setExpandido(false)} disabled={busy}>Cancelar</Button>
                        {assinante && <Button variant="danger" onClick={desativar} disabled={busy}>Desativar assinatura</Button>}
                        <Button variant="primary" onClick={() => enviar({ acao: 'ativar', planId, billingType: billing, metodo })} disabled={busy || !planId}>
                            {busy ? 'Salvando...' : assinante ? 'Renovar' : 'Ativar'}
                        </Button>
                    </div>
                </div>
            )}

            {erro && <InlineNotice>{erro}</InlineNotice>}
            {feedback}
        </div>
    );
}
