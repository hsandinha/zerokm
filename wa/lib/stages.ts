// Vocabulário compartilhado entre Caixa de entrada, Pipeline, Contatos e Visão
// geral: etapas do funil, status da conversa e formatação de tempo.
//
// Sem banco aqui — este arquivo roda no browser.

export type Stage = "abordado" | "conversa" | "cadastro" | "pagamento" | "ganho" | "perdido";
export type ConversationStatus = "ai_active" | "waiting_human" | "human_active" | "closed";

export type StageMeta = {
  id: Stage;
  label: string;
  hint: string;
  /** Bolinha de cor na coluna do kanban. */
  dot: string;
  /** Chip com fundo + texto. */
  chip: string;
};

// Ordem do funil da CNV: o disparo abre, a resposta engata, o cadastro já
// liga o teste grátis de 24h, a cobrança sai e a assinatura fecha.
export const STAGES: StageMeta[] = [
  {
    id: "abordado",
    label: "Abordado",
    hint: "Disparo enviado, ainda sem resposta",
    dot: "bg-ink-300",
    chip: "bg-ink-100 text-ink-800",
  },
  {
    id: "conversa",
    label: "Em conversa",
    hint: "Respondeu — IA ou humano conversando",
    dot: "bg-sky-500",
    chip: "bg-sky-100 text-sky-700",
  },
  {
    id: "cadastro",
    label: "Cadastrado",
    hint: "Conta criada — teste grátis de 24h ativo",
    dot: "bg-violet-500",
    chip: "bg-violet-100 text-violet-700",
  },
  {
    id: "pagamento",
    label: "Pagamento enviado",
    hint: "PIX ou link de assinatura gerado",
    dot: "bg-amber-500",
    chip: "bg-amber-100 text-amber-700",
  },
  {
    id: "ganho",
    label: "Assinante",
    hint: "Assinatura ativa",
    dot: "bg-emerald-500",
    chip: "bg-emerald-100 text-emerald-700",
  },
  {
    id: "perdido",
    label: "Perdido",
    hint: "Sem interesse, opt-out ou sem resposta",
    dot: "bg-red-500",
    chip: "bg-red-100 text-red-600",
  },
];

export const STAGE_BY_ID = Object.fromEntries(STAGES.map((s) => [s.id, s])) as Record<
  Stage,
  StageMeta
>;

/** Etapas em que o lead ainda está vivo no funil. */
export const OPEN_STAGES: Stage[] = ["conversa", "cadastro", "pagamento"];

// Ordem do funil para o avanço automático. `perdido` fica acima de `pagamento`
// de propósito: quem tinha cobrança e disse não vai para perdido; quem está em
// perdido não volta sozinho. E de `ganho` nunca se sai automaticamente.
const RANK: Record<Stage, number> = {
  abordado: 1,
  conversa: 2,
  cadastro: 3,
  pagamento: 4,
  perdido: 5,
  ganho: 6,
};

export function stageRank(stage: string | null | undefined): number {
  return RANK[(stage ?? "") as Stage] ?? 0;
}

export function isStage(value: unknown): value is Stage {
  return typeof value === "string" && value in STAGE_BY_ID;
}

export const STATUS_LABEL: Record<ConversationStatus, { label: string; cls: string }> = {
  ai_active: { label: "Com a IA", cls: "bg-brand-100 text-brand-700" },
  waiting_human: { label: "Aguardando", cls: "bg-amber-100 text-amber-700" },
  human_active: { label: "Em atendimento", cls: "bg-sky-100 text-sky-700" },
  closed: { label: "Resolvida", cls: "bg-ink-100 text-muted" },
};

export const TRANSFER_REASON_LABEL: Record<string, string> = {
  pediu_humano: "pediu uma pessoa",
  problema_pagamento: "problema no pagamento",
  reclamacao: "reclamação",
  negociacao: "negociação de preço",
  fora_do_escopo: "fora do escopo",
  falha_cadastro: "falha ao criar o cadastro",
  limite_de_mensagens: "limite de mensagens da IA",
  falha_ia: "falha da IA",
};

export const OUTCOME_LABEL: Record<string, string> = {
  interessado: "interessado",
  sem_interesse: "sem interesse",
  sem_resposta: "sem resposta",
  opt_out: "pediu para sair",
};

/** Conversa aguardando humano há mais que isto viola o SLA. */
export const SLA_MINUTES = 15;

export function isSlaViolated(
  status: ConversationStatus,
  waitingSince: string | null | undefined,
  now = Date.now(),
): boolean {
  if (status !== "waiting_human" || !waitingSince) return false;
  return now - new Date(waitingSince).getTime() > SLA_MINUTES * 60_000;
}

/** Depois de 3 dias sem mensagem, o negócio conta como parado. */
export const STALLED_DAYS = 3;

export function initials(name: string | null | undefined, fallback = "?"): string {
  const clean = (name ?? "").trim();
  if (!clean) return fallback;
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d} ${d === 1 ? "dia" : "dias"}`;
  const m = Math.floor(d / 30);
  return `há ${m} ${m === 1 ? "mês" : "meses"}`;
}

export function daysSince(iso: string | null | undefined, now = Date.now()): number {
  if (!iso) return 0;
  return Math.floor((now - new Date(iso).getTime()) / 86_400_000);
}

/** Hoje: hora; outro dia: dd/mm. */
export function shortTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    ...(sameDay ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "2-digit" }),
  }).format(d);
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function dateOnly(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

export function formatNumber(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString("pt-BR");
}

export function money(v: number | null | undefined): string {
  return (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function percent(part: number, total: number): string {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

export function greeting(now = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false })
      .format(now)
      .replace(/\D/g, ""),
  );
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}
