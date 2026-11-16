'use client';

import { useCallback, useEffect, useState } from 'react';
import { modalStyles } from '@/components/admin/AdminModal';
import { StatusBadge } from '@/components/ui/Page';
import { InlineNotice } from '@/components/ui/Feedback';
import { formatDate } from './tipos';

type Loja = {
    id: string;
    name: string;
    access: { active: boolean; trial: boolean; trialEndsAt: string | null; expiresAt: string | null; planName: string | null };
    aiActive: boolean;
};
type PlanoDeAtendimento = { id: string; name: string; publico?: string; active: boolean };

/**
 * Assinatura do atendimento por WhatsApp do lojista, dentro da ficha. Mesma
 * regra da tela "Lojas do atendimento" (wa/components/lojas-atendimento.tsx):
 * ativa 30 dias à mão (pago fora ou cortesia) ou desativa, por /api/wa/lojas/[id].
 */
export function AtendimentoDoCliente({ userId }: { userId: string }) {
    const [loja, setLoja] = useState<Loja | null | undefined>(undefined);
    const [planos, setPlanos] = useState<PlanoDeAtendimento[]>([]);
    const [escolha, setEscolha] = useState('');
    const [ocupado, setOcupado] = useState(false);
    const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

    const carregar = useCallback(() => {
        fetch(`/api/admin/clientes/${userId}/atendimento`, { cache: 'no-store' })
            .then(r => r.json())
            .then(d => setLoja(d?.loja ?? null))
            .catch(() => setLoja(null));
    }, [userId]);

    useEffect(() => { carregar(); }, [carregar]);

    // Os planos só importam para quem tem loja de atendimento.
    const temLoja = !!loja;
    useEffect(() => {
        if (!temLoja) return;
        fetch('/api/admin/plans')
            .then(r => r.json())
            .then(d => setPlanos((Array.isArray(d) ? d : []).filter((p: PlanoDeAtendimento) => p.active && p.publico === 'atendimento')))
            .catch(() => {});
    }, [temLoja]);

    const acao = async (body: Record<string, unknown>) => {
        if (!loja) return;
        setOcupado(true);
        setAviso(null);
        try {
            const res = await fetch(`/api/wa/lojas/${loja.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const r = await res.json().catch(() => ({}));
            setAviso(res.ok ? { ok: true, texto: 'Assinatura do atendimento atualizada.' } : { ok: false, texto: r.error ?? 'Não foi possível atualizar.' });
            setEscolha('');
            carregar();
        } catch {
            setAviso({ ok: false, texto: 'Erro de conexão.' });
        } finally {
            setOcupado(false);
        }
    };

    if (loja === undefined) return <p className={`${modalStyles.hint} ${modalStyles.flush}`}>Consultando o atendimento...</p>;
    if (loja === null) {
        return (
            <p className={`${modalStyles.hint} ${modalStyles.flush}`}>
                Este lojista ainda não tem loja de atendimento. Ela nasce no primeiro acesso dele ao atendimento, com 7 dias de teste, e a assinatura passa a aparecer aqui.
            </p>
        );
    }

    const { access } = loja;
    const paga = access.active && !access.trial;
    return (
        <div className={modalStyles.stack}>
            <div className={modalStyles.facts}>
                <div className={modalStyles.fact}>
                    <span className={modalStyles.factLabel}>Situação</span>
                    <span className={modalStyles.factValue}>
                        <StatusBadge tone={!access.active ? 'negative' : access.trial ? 'warning' : 'positive'}>
                            {!access.active ? 'Inativa' : access.trial ? 'Em teste' : 'Ativa'}
                        </StatusBadge>
                    </span>
                </div>
                <div className={modalStyles.fact}>
                    <span className={modalStyles.factLabel}>Plano</span>
                    <span className={modalStyles.factValue}>{paga ? (access.planName ?? 'Ativa') : 'Sem plano'}</span>
                </div>
                <div className={modalStyles.fact}>
                    <span className={modalStyles.factLabel}>{access.trial ? 'Teste até' : 'Vence em'}</span>
                    <span className={modalStyles.factValue}>{formatDate(access.trial ? access.trialEndsAt : access.expiresAt)}</span>
                </div>
                <div className={modalStyles.fact}>
                    <span className={modalStyles.factLabel}>IA</span>
                    <span className={modalStyles.factValue}>{loja.aiActive ? 'Ligada' : 'Desligada'}</span>
                </div>
            </div>

            {aviso && <InlineNotice tone={aviso.ok ? 'positive' : 'negative'}>{aviso.texto}</InlineNotice>}

            <div className={modalStyles.row}>
                {planos.length > 0 ? (
                    <label className={modalStyles.field}>
                        Ativar 30 dias
                        <select value={escolha} onChange={e => setEscolha(e.target.value)} disabled={ocupado}>
                            <option value="">Escolha o plano e a origem...</option>
                            {planos.map(p => (
                                <optgroup key={p.id} label={p.name}>
                                    <option value={`${p.id}|manual`}>{p.name}: pago fora</option>
                                    <option value={`${p.id}|cortesia`}>{p.name}: cortesia</option>
                                </optgroup>
                            ))}
                        </select>
                    </label>
                ) : (
                    <p className={`${modalStyles.hint} ${modalStyles.flush}`}>Nenhum plano de atendimento ativo. Crie um em Planos, com o público Atendimento.</p>
                )}
            </div>
            <div className={modalStyles.choices}>
                {planos.length > 0 && (
                    <button
                        type="button"
                        className={modalStyles.secondary}
                        disabled={ocupado || !escolha}
                        onClick={() => {
                            const [planId, metodo] = escolha.split('|');
                            acao({ acao: 'ativar', planId, metodo, billingType: 'monthly' });
                        }}
                    >
                        {ocupado ? 'Salvando...' : 'Ativar atendimento'}
                    </button>
                )}
                {paga && (
                    <button type="button" className={modalStyles.danger} disabled={ocupado} onClick={() => acao({ acao: 'desativar' })}>
                        Desativar atendimento
                    </button>
                )}
            </div>
        </div>
    );
}
