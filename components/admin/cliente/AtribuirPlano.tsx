'use client';

import { useState } from 'react';
import { AdminModal, modalStyles } from '@/components/admin/AdminModal';
import { InlineNotice } from '@/components/ui/Feedback';
import { brl, toDateInputValue, type CRMClient, type PlanoDoLojista } from './tipos';

/**
 * Atribuição do plano de zero km a um lojista (PATCH /api/admin/crm). É o miolo
 * que o CRM já tinha no modal "Atribuir plano", agora usado pela ficha do
 * cliente e pelo cadastro guiado.
 */

/** O que o formulário precisa saber do cliente. */
export type ClienteDoPlano = Pick<CRMClient, 'id' | 'displayName' | 'email' | 'planId' | 'billingType' | 'expiresAt' | 'valorPlano' | 'valorCombinadoAtivo'>;

/**
 * `livre` deixa escolher a origem (recebimento externo ou cortesia), como no CRM.
 * Os outros fixam a origem, para o cadastro guiado: `plano` (recebido por fora),
 * `cortesia` e `combinado` (valor diferente da tabela, guardado para as próximas).
 */
export type ModoDeAtribuicao = 'livre' | 'plano' | 'cortesia' | 'combinado';

export interface AtribuicaoDePlano {
    planId: string;
    startDate: string;
    /** Vencimento definido à mão (cliente especial). Vazio = início + 30/365 dias. */
    expiresAtManual: string;
    activationMethod: 'manual' | 'cortesia';
    paymentMethod: 'pix' | 'boleto' | 'card';
    paymentFrequency: 'monthly' | 'annual';
    /** Valor do plano para este cliente, sem telas extras. Vazio = tabela ou o combinado que ele já tem. */
    valorPlano: string;
    /** Guardar o valor como combinado: as próximas cobranças usam ele. */
    salvarValorCombinado: boolean;
}

export const PLANO_GRATIS = '__gratis__';

export function atribuicaoInicial(client: ClienteDoPlano, plans: PlanoDoLojista[], modo: ModoDeAtribuicao = 'livre'): AtribuicaoDePlano {
    return {
        planId: client.planId && plans.some(p => p.id === client.planId) ? client.planId : plans[0]?.id ?? '',
        startDate: toDateInputValue(client.expiresAt),
        expiresAtManual: '',
        activationMethod: modo === 'cortesia' ? 'cortesia' : 'manual',
        paymentMethod: 'pix',
        paymentFrequency: client.billingType === 'annual' ? 'annual' : 'monthly',
        valorPlano: '',
        salvarValorCombinado: true,
    };
}

/** Preço que vale se o campo Valor ficar vazio: o combinado do cliente (mesmo plano e periodicidade) ou a tabela. */
export function valorPadraoDaAtribuicao(client: ClienteDoPlano, plano: PlanoDoLojista | null | undefined, frequencia: 'monthly' | 'annual') {
    if (!plano) return null;
    const anual = frequencia === 'annual';
    const tabela = anual && plano.annualPrice ? plano.annualPrice : plano.price;
    const mesmoPlano = client.planId === plano.id && (client.billingType === 'annual') === anual;
    if (mesmoPlano && client.valorCombinadoAtivo && typeof client.valorPlano === 'number') return { valor: client.valorPlano, tabela, combinado: true };
    return { valor: tabela, tabela, combinado: false };
}

/** O que impede enviar, ou null quando está tudo certo. */
export function erroDaAtribuicao(valor: AtribuicaoDePlano, plans: PlanoDoLojista[], modo: ModoDeAtribuicao = 'livre'): string | null {
    if (!valor.planId) return 'Escolha um plano.';
    if (valor.planId === PLANO_GRATIS) return null;
    const plano = plans.find(p => p.id === valor.planId);
    if (plano?.type === 'monthly' && !valor.startDate) return 'Informe a data de início do plano.';
    if (modo === 'combinado') {
        if (plano?.type !== 'monthly') return 'Valor combinado vale para plano mensal ou anual. Escolha um plano de assinatura.';
        if (!valor.valorPlano.trim()) return 'Informe o valor combinado com o cliente.';
    }
    return null;
}

/** Grava a atribuição. Devolve o erro em texto, ou null quando deu certo. */
export async function enviarAtribuicaoDePlano(userId: string, valor: AtribuicaoDePlano, plans: PlanoDoLojista[]): Promise<string | null> {
    const plano = plans.find(p => p.id === valor.planId);
    const comData = plano?.type === 'monthly';
    const cortesia = valor.activationMethod === 'cortesia';
    const valorDigitado = cortesia ? '' : valor.valorPlano.trim();
    try {
        const res = await fetch('/api/admin/crm', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId,
                planId: valor.planId,
                paymentFrequency: valor.paymentFrequency || 'monthly',
                activationMethod: valor.planId === PLANO_GRATIS ? undefined : (valor.activationMethod || 'manual'),
                paymentMethod: valor.paymentMethod || 'pix',
                startDate: comData ? valor.startDate : undefined,
                expiresAt: comData && valor.expiresAtManual ? valor.expiresAtManual : undefined,
                valorPlano: valorDigitado || undefined,
                salvarValorCombinado: Boolean(valorDigitado && valor.salvarValorCombinado),
            }),
        });
        const text = await res.text();
        let data: any;
        try { data = JSON.parse(text); } catch { data = { error: text || `Erro ${res.status}` }; }
        return data.ok ? null : (data.error || 'Erro ao atribuir plano.');
    } catch (err: any) {
        return err?.message || 'Erro de conexão.';
    }
}

export function AtribuirPlanoCampos({ client, plans, valor, onChange, modo = 'livre', permitirGratis = true }: {
    client: ClienteDoPlano;
    plans: PlanoDoLojista[];
    valor: AtribuicaoDePlano;
    onChange: (valor: AtribuicaoDePlano) => void;
    modo?: ModoDeAtribuicao;
    /** Oferece "Grátis (sem plano)", que tira o plano do cliente. */
    permitirGratis?: boolean;
}) {
    const plano = plans.find(p => p.id === valor.planId) ?? null;
    const comPlano = !!valor.planId && valor.planId !== PLANO_GRATIS;
    const comData = plano?.type === 'monthly';
    const cortesia = valor.activationMethod === 'cortesia';
    const anual = valor.paymentFrequency === 'annual';
    const padrao = valorPadraoDaAtribuicao(client, plano, valor.paymentFrequency);
    // No modo "combinado" só entram planos de assinatura: crédito não tem valor recorrente.
    const disponiveis = modo === 'combinado' ? plans.filter(p => p.type === 'monthly') : plans;
    const grupos = ([
        ['Planos do checkout', disponiveis.filter(p => !p.especial)],
        ['Planos especiais (só pelo CRM)', disponiveis.filter(p => p.especial)],
    ] as const).filter(([, lista]) => lista.length > 0);

    return (
        <div className={modalStyles.stack}>
            <label className={modalStyles.field}>
                Plano
                <select value={valor.planId} onChange={e => onChange({ ...valor, planId: e.target.value })}>
                    <option value="">Selecione um plano...</option>
                    {permitirGratis && modo === 'livre' && <option value={PLANO_GRATIS}>Grátis (sem plano)</option>}
                    {grupos.map(([grupo, lista]) => (
                        <optgroup key={grupo} label={grupo}>
                            {lista.map(p => {
                                const preco = anual && p.annualPrice ? p.annualPrice : p.price;
                                return (
                                    <option key={p.id} value={p.id}>
                                        {p.name} · {brl(preco)}
                                        {p.type === 'monthly' ? (anual ? ' (ano)' : ' (mês)') : ` (${p.credits} créditos)`}
                                    </option>
                                );
                            })}
                        </optgroup>
                    ))}
                </select>
                {plans.length === 0
                    ? <span className={modalStyles.hint}>Nenhum plano de lojista ativo. Crie um em Planos.</span>
                    : plans.every(p => !p.especial) && (
                        <span className={modalStyles.hint}>
                            Para um cliente com condição especial, crie em Planos um plano marcado como especial: ele fica fora do checkout e aparece aqui.
                        </span>
                    )}
            </label>

            {comPlano && plano?.type !== 'credits' && (
                <fieldset className={modalStyles.group}>
                    <legend className={modalStyles.groupLabel}>Recorrência de pagamento</legend>
                    <div className={modalStyles.choices}>
                        <label className={modalStyles.choice}>
                            <input type="radio" name={`frequencia-${client.id}`} value="monthly" checked={!anual} onChange={() => onChange({ ...valor, paymentFrequency: 'monthly' })} />
                            Mensal (30 dias)
                        </label>
                        <label className={modalStyles.choice}>
                            <input type="radio" name={`frequencia-${client.id}`} value="annual" checked={anual} onChange={() => onChange({ ...valor, paymentFrequency: 'annual' })} />
                            Anual (365 dias)
                        </label>
                    </div>
                </fieldset>
            )}

            {comData && (
                <div className={modalStyles.grid2}>
                    <label className={modalStyles.field}>
                        Data de início do plano
                        <input type="date" value={valor.startDate} onChange={e => onChange({ ...valor, startDate: e.target.value })} required />
                        <span className={modalStyles.hint}>
                            {client.expiresAt
                                ? 'Preenchida com a expiração atual do cliente. Ajuste para a data em que o pagamento foi recebido, se necessário.'
                                : 'Preenchida com a data de hoje. Ajuste para a data em que o pagamento foi recebido, se necessário.'}
                        </span>
                    </label>
                    <label className={modalStyles.field}>
                        Vencimento manual (opcional)
                        <input type="date" value={valor.expiresAtManual} min={valor.startDate || undefined} onChange={e => onChange({ ...valor, expiresAtManual: e.target.value })} />
                        <span className={modalStyles.hint}>Para cliente especial: o acesso vai até esta data, em vez de 30 dias (ou 1 ano) a partir do início.</span>
                    </label>
                </div>
            )}

            {comPlano && modo === 'livre' && (
                <label className={modalStyles.field}>
                    Origem da ativação (financeiro)
                    <select value={valor.activationMethod} onChange={e => onChange({ ...valor, activationMethod: e.target.value as 'manual' | 'cortesia' })}>
                        <option value="manual">Recebimento externo (gera extrato com o valor do plano)</option>
                        <option value="cortesia">Cortesia / bonificação (gera extrato gratuito de R$ 0,00)</option>
                    </select>
                </label>
            )}

            {comPlano && !cortesia && (
                <label className={modalStyles.field}>
                    Forma de pagamento (recorrência)
                    <select value={valor.paymentMethod} onChange={e => onChange({ ...valor, paymentMethod: e.target.value as 'pix' | 'boleto' | 'card' })}>
                        <option value="pix">PIX</option>
                        <option value="boleto">Boleto</option>
                        <option value="card">Cartão de crédito</option>
                    </select>
                </label>
            )}

            {comData && !cortesia && padrao && (
                <label className={modalStyles.field}>
                    {modo === 'combinado' ? 'Valor combinado' : 'Valor do plano'} {anual ? '(ano)' : '(mês)'}
                    <input
                        inputMode="decimal"
                        value={valor.valorPlano}
                        onChange={e => onChange({ ...valor, valorPlano: e.target.value })}
                        placeholder={padrao.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    />
                    <span className={modalStyles.hint}>
                        {modo === 'combinado'
                            ? `Preço da tabela: ${brl(padrao.tabela)}. O valor digitado vale nesta ativação e nas próximas cobranças. Telas extras continuam somadas à parte.`
                            : `Vazio: ${brl(padrao.valor)} (${padrao.combinado ? 'valor combinado do cliente' : 'preço da tabela'}). Para cliente que paga diferente, digite o valor. Telas extras continuam somadas à parte.`}
                    </span>
                </label>
            )}

            {comData && !cortesia && modo !== 'combinado' && valor.valorPlano.trim() && (
                <label className={modalStyles.choice}>
                    <input type="checkbox" checked={valor.salvarValorCombinado} onChange={e => onChange({ ...valor, salvarValorCombinado: e.target.checked })} />
                    Usar este valor nas próximas cobranças deste cliente
                </label>
            )}
        </div>
    );
}

/** Modal "Atribuir plano" da ficha do cliente. */
export function AtribuirPlanoModal({ client, plans, onClose, onAtribuido }: {
    client: ClienteDoPlano;
    plans: PlanoDoLojista[];
    onClose: () => void;
    onAtribuido: () => void;
}) {
    const [valor, setValor] = useState<AtribuicaoDePlano>(() => atribuicaoInicial(client, plans));
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    const confirmar = async () => {
        const problema = erroDaAtribuicao(valor, plans);
        if (problema) { setErro(problema); return; }
        setEnviando(true);
        setErro(null);
        const falha = await enviarAtribuicaoDePlano(client.id, valor, plans);
        setEnviando(false);
        if (falha) setErro(falha);
        else onAtribuido();
    };

    return (
        <AdminModal
            size="md"
            title="Atribuir plano"
            subtitle={client.displayName || client.email}
            onClose={onClose}
            busy={enviando}
            footer={<>
                <button type="button" className={modalStyles.secondary} onClick={onClose} disabled={enviando}>Cancelar</button>
                <button type="button" className={modalStyles.primary} disabled={enviando || !valor.planId} onClick={confirmar}>
                    {enviando ? 'Salvando...' : 'Confirmar'}
                </button>
            </>}
        >
            <div className={modalStyles.stack}>
                <AtribuirPlanoCampos client={client} plans={plans} valor={valor} onChange={setValor} />
                {erro && <InlineNotice>{erro}</InlineNotice>}
            </div>
        </AdminModal>
    );
}
