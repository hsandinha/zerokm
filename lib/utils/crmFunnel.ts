/**
 * Vocabulário do funil comercial.
 *
 * O `type` da fase é o que permite a qualquer relatório saber o que contar: sem ele,
 * "Venda Ganha" e "teste1" são apenas nomes. Fases `open` são intermediárias.
 */
export const LEAD_STAGE_TYPES = ['open', 'proposal', 'won', 'lost'] as const;
export type LeadStageType = (typeof LEAD_STAGE_TYPES)[number];

export const LEAD_STAGE_TYPE_LABELS: Record<LeadStageType, string> = {
    open: 'Em andamento',
    proposal: 'Proposta enviada',
    won: 'Venda ganha',
    lost: 'Venda perdida',
};

export const LOST_REASONS = [
    { value: 'preco', label: 'Preço' },
    { value: 'concorrente', label: 'Concorrente' },
    { value: 'sem_interesse', label: 'Sem interesse' },
    { value: 'momento_inadequado', label: 'Momento inadequado' },
    { value: 'outros', label: 'Outros' },
] as const;

export type LostReason = (typeof LOST_REASONS)[number]['value'];
export const LOST_REASON_VALUES: string[] = LOST_REASONS.map(r => r.value);

export function lostReasonLabel(value?: string | null): string {
    return LOST_REASONS.find(r => r.value === value)?.label ?? 'Não informado';
}

/** Funil padrão pedido pelo time de marketing. Criado sob demanda via POST /api/crm/stages/seed. */
export const DEFAULT_FUNNEL: { name: string; type: LeadStageType; color: string }[] = [
    { name: 'Novos Leads', type: 'open', color: '#3B82F6' },
    { name: '1º Contato', type: 'open', color: '#60A5FA' },
    { name: '2º Contato', type: 'open', color: '#818CF8' },
    { name: '3º Contato', type: 'open', color: '#A78BFA' },
    { name: 'Qualificação do Lead', type: 'open', color: '#C084FC' },
    { name: 'Teste Gratuito', type: 'open', color: '#F472B6' },
    { name: 'Proposta Enviada', type: 'proposal', color: '#FBBF24' },
    { name: 'Follow-up Pós Teste', type: 'open', color: '#FB923C' },
    { name: 'Follow-up Pós Proposta', type: 'open', color: '#F97316' },
    { name: 'Venda Ganha', type: 'won', color: '#10B981' },
    { name: 'Venda Perdida', type: 'lost', color: '#EF4444' },
];
