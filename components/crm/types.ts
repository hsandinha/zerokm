import type { LeadStageType } from '@/lib/utils/crmFunnel';

export type { LeadStageType };

export type Lead = {
    id: string;
    name: string;
    phone: string;
    email?: string | null;
    source?: string | null;
    campaign?: string | null;
    tags: string[];
    firstMessage?: string | null;
    stageId: string;
    ownerId?: string | null;
    ownerName?: string | null;
    lostReason?: string | null;
    lostReasonNote?: string | null;
    notes?: string | null;
    proposalValue?: number | null;
    nextTaskAt?: string | null;
    pendingTasks?: number;
    createdAt: string;
};

export type LeadTaskItem = {
    id: string;
    title: string;
    dueAt: string;
    done: boolean;
    doneAt: string | null;
    createdBy: string | null;
    createdAt: string;
};

export type Stage = {
    id: string;
    name: string;
    order: number;
    color: string;
    type: LeadStageType;
};

export type LeadEventItem = {
    id: string;
    type: 'created' | 'stage_changed';
    fromStageName: string | null;
    toStageName: string | null;
    actor: 'user' | 'webhook';
    actorEmail: string | null;
    lostReason: string | null;
    createdAt: string;
};

export type LeadDetail = Lead & {
    stageName: string;
    stageType: LeadStageType;
    history: LeadEventItem[];
};

export type Owner = { id: string; name: string; email: string };

export type ReportData = {
    period: { preset: string; from: string | null; to: string | null };
    radar: { leadsCriados: number; propostasEnviadas: number; vendasGanhas: number; vendasPerdidas: number };
    conversao: { leadParaProposta: number; propostaParaVenda: number; geral: number };
    porEtapa: {
        id: string; name: string; color: string; type: LeadStageType; order: number;
        entradas: number; atuais: number; conversao: number;
    }[];
    porOrigem: { tag: string; criados: number; propostas: number; ganhas: number; conversao: number }[];
    motivosPerda: { reason: string; label: string; total: number; percentual: number }[];
};

export const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

export const formatCurrencyBRL = (value: number) =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const formatDateTime = (iso: string) =>
    new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
