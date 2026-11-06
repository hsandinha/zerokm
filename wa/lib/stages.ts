// Vocabulário compartilhado entre Caixa de entrada, Pipeline, Contatos e Visão
// geral: etapas do funil, status da conversa e formatação de tempo.
//
// Sem banco aqui — este arquivo roda no browser.

import type { EventoMeta } from "@wa/lib/conversoes-meta";

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

// Ordem do funil do CNV: o disparo abre, a resposta engata, o cadastro já
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

// Mesmas etapas (e a mesma ordem de avanço automático) no funil das LOJAS,
// com o nome que faz sentido para quem vende carro. A IA da loja leva para
// "Visita / test drive" ao agendar e para "Proposta" ao simular a parcela;
// "Vendido" é sempre à mão.
const STORE_LABELS: Record<Stage, { label: string; hint: string }> = {
  abordado: { label: "Abordado", hint: "Mensagem enviada, ainda sem resposta" },
  conversa: { label: "Em atendimento", hint: "Respondeu — IA ou vendedor conversando" },
  cadastro: { label: "Visita / test drive", hint: "Pediu visita ou test drive" },
  pagamento: { label: "Proposta", hint: "Simulou parcela ou recebeu proposta" },
  ganho: { label: "Vendido", hint: "Venda fechada (marcada à mão)" },
  perdido: { label: "Perdido", hint: "Sem interesse, opt-out ou sem resposta" },
};

export const STORE_STAGES: StageMeta[] = STAGES.map((s) => ({ ...s, ...STORE_LABELS[s.id] }));

/** Etapas do painel de quem está operando: o CNV ou uma loja. */
export function stagesFor(store: boolean): StageMeta[] {
  return store ? STORE_STAGES : STAGES;
}

export function stageByIdFor(store: boolean): Record<Stage, StageMeta> {
  return Object.fromEntries(stagesFor(store).map((s) => [s.id, s])) as Record<Stage, StageMeta>;
}

/** Etapas em que o lead ainda está vivo no funil. */
export const OPEN_STAGES: Stage[] = ["conversa", "cadastro", "pagamento"];

// ── Colunas do funil (editáveis por dono) ────────────────────
// O modelo está em wa/models/funil.ts. Aqui fica o que o navegador também
// precisa: as cores, as colunas padrão e a regra de qual coluna mostra o
// cartão.

export type ColunaTipo = "open" | "won" | "lost";

export type FunilColuna = {
  id: string;
  name: string;
  color: string;
  position: number;
  /** Etapa automática desta coluna; null = coluna criada pela loja. */
  systemKey: Stage | null;
  type: ColunaTipo;
  /** Evento que volta para o anúncio quando o cartão entra (API de
   *  Conversões da Meta). Ausente = coluna antiga: segue o tipo
   *  (eventoDaColuna em wa/lib/conversoes-meta.ts). null = nenhum. */
  eventoMeta?: EventoMeta | null;
};

/** Paleta das colunas. As classes ficam escritas por inteiro para o Tailwind achar. */
export const COLUNA_CORES: Record<string, { label: string; dot: string; chip: string }> = {
  cinza: { label: "Cinza", dot: "bg-ink-300", chip: "bg-ink-100 text-ink-800" },
  azul: { label: "Azul", dot: "bg-sky-500", chip: "bg-sky-100 text-sky-700" },
  roxo: { label: "Roxo", dot: "bg-violet-500", chip: "bg-violet-100 text-violet-700" },
  amarelo: { label: "Amarelo", dot: "bg-amber-500", chip: "bg-amber-100 text-amber-700" },
  verde: { label: "Verde", dot: "bg-emerald-500", chip: "bg-emerald-100 text-emerald-700" },
  vermelho: { label: "Vermelho", dot: "bg-red-500", chip: "bg-red-100 text-red-600" },
  rosa: { label: "Rosa", dot: "bg-pink-500", chip: "bg-pink-100 text-pink-700" },
  turquesa: { label: "Turquesa", dot: "bg-teal-500", chip: "bg-teal-100 text-teal-700" },
  laranja: { label: "Laranja", dot: "bg-orange-500", chip: "bg-orange-100 text-orange-700" },
  anil: { label: "Anil", dot: "bg-indigo-500", chip: "bg-indigo-100 text-indigo-700" },
};

export function corDaColuna(color: string | null | undefined) {
  return COLUNA_CORES[color ?? ""] ?? COLUNA_CORES.cinza;
}

const COR_PADRAO: Record<Stage, string> = {
  abordado: "cinza",
  conversa: "azul",
  cadastro: "roxo",
  pagamento: "amarelo",
  ganho: "verde",
  perdido: "vermelho",
};

export const TIPO_DA_ETAPA: Record<Stage, ColunaTipo> = {
  abordado: "open",
  conversa: "open",
  cadastro: "open",
  pagamento: "open",
  ganho: "won",
  perdido: "lost",
};

export const TIPO_LABEL: Record<ColunaTipo, string> = {
  open: "Em andamento",
  won: "Venda fechada",
  lost: "Perdido",
};

// Evento para a Meta de fábrica: a venda (Vendido / Assinante) devolve
// Purchase ao anúncio; quem pediu visita ou test drive (na loja) ou criou a
// conta (no CNV) é o lead qualificado. As outras etapas não mandam nada.
const EVENTO_PADRAO: Record<Stage, EventoMeta | null> = {
  abordado: null,
  conversa: null,
  cadastro: "QualifiedLead",
  pagamento: null,
  ganho: "Purchase",
  perdido: null,
};

/** Colunas de fábrica: uma por etapa automática, com o nome do painel. */
export function colunasPadrao(store: boolean): Array<Omit<FunilColuna, "id">> {
  return stagesFor(store).map((s, i) => ({
    name: s.label,
    color: COR_PADRAO[s.id],
    position: i,
    systemKey: s.id,
    type: TIPO_DA_ETAPA[s.id],
    eventoMeta: EVENTO_PADRAO[s.id],
  }));
}

/** Etapas que um cartão pode ter estando nesta coluna. */
export function etapasDaColuna(col: Pick<FunilColuna, "systemKey" | "type">): Stage[] {
  if (col.systemKey) return [col.systemKey];
  if (col.type === "won") return ["ganho"];
  if (col.type === "lost") return ["perdido"];
  return ["abordado", "conversa", "cadastro", "pagamento"];
}

/**
 * Qual coluna mostra o cartão. A coluna em que ele foi posto à mão vale
 * enquanto combina com a etapa; se a IA ou o sistema mudou a etapa para algo
 * que ela não comporta (fechou a venda, perdeu, avançou de uma coluna de
 * sistema), o cartão vai para a coluna de sistema da etapa nova. Sem coluna
 * para a etapa, fica em "Sem etapa" (null). É a regra do Chatrun.
 */
export function colunaDoCartao<C extends Pick<FunilColuna, "id" | "systemKey" | "type">>(
  conv: { stage: string; stageId?: string | null },
  colunas: C[],
): C | null {
  if (conv.stageId) {
    const posta = colunas.find((c) => c.id === conv.stageId);
    if (posta && etapasDaColuna(posta).includes(conv.stage as Stage)) return posta;
  }
  return colunas.find((c) => c.systemKey === conv.stage) ?? null;
}

/** Etapa que o cartão passa a ter quando alguém o põe nesta coluna. */
export function etapaAoMover(col: Pick<FunilColuna, "systemKey" | "type">, atual: string): Stage {
  if (col.systemKey) return col.systemKey;
  if (col.type === "won") return "ganho";
  if (col.type === "lost") return "perdido";
  // Coluna em andamento: quem já estava em andamento continua onde estava no
  // fluxo; quem vem de vendido/perdido volta para a conversa.
  const abertas: Stage[] = ["abordado", "conversa", "cadastro", "pagamento"];
  return abertas.includes(atual as Stage) ? (atual as Stage) : "conversa";
}

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
  ia_desligada: "IA desligada",
  ia_sem_chave: "IA sem chave",
  assinatura_inativa: "assinatura inativa",
  ia_nao_liberada: "IA não liberada pelo CNV",
};

export const OUTCOME_LABEL: Record<string, string> = {
  interessado: "interessado",
  sem_interesse: "sem interesse",
  sem_resposta: "sem resposta",
  opt_out: "pediu para sair",
};

/** Conversa aguardando humano há mais que isto viola o SLA. É o padrão: cada
 *  loja pode ter a própria meta (Configuração, wa/lib/operacao.ts). */
export const SLA_MINUTES = 15;

export function isSlaViolated(
  status: ConversationStatus,
  waitingSince: string | null | undefined,
  now = Date.now(),
  slaMinutes = SLA_MINUTES,
): boolean {
  if (status !== "waiting_human" || !waitingSince) return false;
  return now - new Date(waitingSince).getTime() > slaMinutes * 60_000;
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
