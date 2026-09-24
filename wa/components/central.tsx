"use client";

// Central: filtros à esquerda, fila, chat e o dossiê do cliente ao lado.
//
// O painel da direita é a diferença em relação a um inbox comum: quem assume a
// conversa vê na hora a situação do lojista na CNV — se já tem conta, se o
// teste de 24h está de pé, se a assinatura está ativa e o que já foi cobrado.
// Sem isso, o atendente promete o que já existe ou cobra quem já pagou.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import clsx from "clsx";
import { metaErrorInfo } from "@wa/lib/meta-errors";
import { formatPhoneBr } from "@wa/lib/phone";
import { TemplateComposer, type ComposerTarget } from "@wa/components/template-composer";
import {
  AlertCircle,
  AlertTriangle,
  BadgeCheck,
  Bot,
  Building2,
  CreditCard,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Headset,
  Inbox,
  Hand,
  MessageCircle,
  MessageSquarePlus,
  PanelRightClose,
  PanelRightOpen,
  Search,
  SendHorizonal,
  Undo2,
  UserRound,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import {
  OUTCOME_LABEL,
  SLA_MINUTES,
  STAGES,
  STAGE_BY_ID,
  STATUS_LABEL,
  TRANSFER_REASON_LABEL,
  dateTime,
  formatNumber,
  initials,
  isStage,
  money,
  shortTime,
  timeAgo,
  type ConversationStatus,
  type Stage,
} from "@wa/lib/stages";

const POLL_MS = 4000;

type Filter = "todas" | "aguardando" | "ia" | "atendimento" | "minhas" | "sla" | "resolvidas";

type Counts = {
  total: number;
  waiting: number;
  ai: number;
  human: number;
  closed: number;
  mine: number;
  sla: number;
  stages: Record<string, number>;
};

type Row = {
  id: string;
  status: ConversationStatus;
  outcome: string | null;
  transferReason: string | null;
  lastMessageAt: string | null;
  lastInboundAt: string | null;
  preview: string | null;
  unread: number;
  stage: string;
  assignedTo: string | null;
  waitingSince: string | null;
  slaViolated: boolean;
  campaignId: string | null;
  contact: { id: string | null; phone: string; name: string | null; company: string | null };
};

type Message = {
  id: string;
  direction: "inbound" | "outbound";
  sender: "contact" | "ai" | "human" | "system";
  content: string | null;
  mediaType: string;
  status: string | null;
  reaction: string | null;
  error: string | null;
  createdAt: string;
};

type Detail = {
  conversation: {
    id: string;
    status: ConversationStatus;
    outcome: string | null;
    transferReason: string | null;
    lastInboundAt: string | null;
    lastMessageAt: string | null;
    stage: string;
    stageChangedAt: string;
    assignedTo: string | null;
    waitingSince: string | null;
    createdAt: string;
    campaign: { id: string; name: string } | null;
  };
  contact: {
    id: string;
    phone: string;
    name: string | null;
    email: string | null;
    document: string | null;
    company: string | null;
    city: string | null;
    state: string | null;
    optOut: boolean;
    registered: boolean;
  } | null;
  /** Situação do lojista na CNV — o que o atendente precisa saber antes de falar. */
  dossier: {
    registered: boolean;
    displayName: string | null;
    email: string | null;
    subscriptionActive: boolean;
    planName: string | null;
    trialActive: boolean;
    trialExpiresAt: string | null;
    payments: Array<{
      id: string;
      status: string;
      amount: number;
      method: string | null;
      createdAt: string;
      planName: string | null;
    }>;
    company: {
      cnpj: string | null;
      legalName: string | null;
      city: string | null;
      state: string | null;
      cnae: string | null;
    } | null;
    campaigns: Array<{ campaignId: string; status: string; sentAt: string | null }>;
  } | null;
  messages: Message[];
};

const FILTERS: Array<{
  id: Filter;
  label: string;
  icon: LucideIcon;
  /** Quando o filtro é um status, a API já devolve só ele. */
  status?: ConversationStatus;
  count: (c: Counts) => number;
}> = [
  { id: "todas", label: "Todas", icon: Inbox, count: (c) => c.total },
  { id: "aguardando", label: "Aguardando", icon: Clock, status: "waiting_human", count: (c) => c.waiting },
  { id: "ia", label: "Com a IA", icon: Bot, status: "ai_active", count: (c) => c.ai },
  { id: "atendimento", label: "Em atendimento", icon: Headset, status: "human_active", count: (c) => c.human },
  { id: "minhas", label: "Minhas", icon: UserRound, count: (c) => c.mine },
  { id: "sla", label: "SLA violado", icon: AlertTriangle, count: (c) => c.sla },
  { id: "resolvidas", label: "Resolvidas", icon: CheckCircle2, status: "closed", count: (c) => c.closed },
];

function within24h(lastInboundAt: string | null | undefined): boolean {
  if (!lastInboundAt) return false;
  return Date.now() - new Date(lastInboundAt).getTime() < 24 * 3600_000;
}

function personLabel(email: string | null): string {
  if (!email) return "";
  return email.split("@")[0].replace(/[._-]/g, " ");
}

const MEDIA_LABEL: Record<string, string> = {
  button: "toque no botão",
  interactive: "resposta interativa",
  image: "imagem",
  audio: "áudio",
  video: "vídeo",
  document: "documento",
  sticker: "figurinha",
  location: "localização",
  contacts: "contato",
};

const XL = "(min-width: 1280px)";
const DOSSIER_KEY = "cnv-dossie";

/** true a partir do xl — decide se o dossiê é coluna ou gaveta. */
function useIsXl(): boolean {
  const [xl, setXl] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(XL);
    const apply = () => setXl(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return xl;
}

export function Central({ currentEmail }: { currentEmail: string }) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Carregando…</p>}>
      <CentralInner currentEmail={currentEmail} />
    </Suspense>
  );
}

function CentralInner({ currentEmail }: { currentEmail: string }) {
  const params = useSearchParams();
  const [conversations, setConversations] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [channelPhone, setChannelPhone] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(params?.get("c") ?? null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<Filter>("todas");
  const [stageFilter, setStageFilter] = useState<Stage | null>(null);
  const [search, setSearch] = useState("");
  const [dossierOpen, setDossierOpen] = useState(false);
  const [composer, setComposer] = useState<ComposerTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const isXl = useIsXl();

  // No desktop largo o dossiê começa aberto (e lembra a escolha); abaixo do xl
  // é gaveta, sempre fechada até alguém pedir.
  useEffect(() => {
    if (!isXl) {
      setDossierOpen(false);
      return;
    }
    try {
      setDossierOpen(localStorage.getItem(DOSSIER_KEY) !== "fechado");
    } catch {
      setDossierOpen(true);
    }
  }, [isXl]);

  function toggleDossier() {
    setDossierOpen((v) => {
      const next = !v;
      if (isXl) {
        try {
          localStorage.setItem(DOSSIER_KEY, next ? "aberto" : "fechado");
        } catch {
          /* modo anônimo */
        }
      }
      return next;
    });
  }

  // Link direto (?c=) vindo da Visão geral, do Pipeline ou dos Contatos.
  useEffect(() => {
    const c = params?.get("c");
    if (c) {
      setSelectedId(c);
      stickToBottom.current = true;
    }
  }, [params]);

  const statusParam = FILTERS.find((f) => f.id === filter)?.status;

  const loadList = useCallback(async () => {
    try {
      const sp = new URLSearchParams();
      if (statusParam) sp.set("status", statusParam);
      const res = await fetch(`/api/wa/conversations?${sp.toString()}`);
      if (!res.ok) return;
      const body = await res.json();
      setConversations(body.conversations ?? []);
      setCounts(body.counts ?? null);
      setChannelPhone(body.channel?.phone ?? null);
    } catch {
      /* rede oscilou — o próximo poll resolve */
    }
  }, [statusParam]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/wa/conversations/${id}`);
      if (!res.ok) {
        if (res.status === 404) setError("Conversa não encontrada.");
        return;
      }
      setDetail(await res.json());
    } catch {
      /* idem */
    }
  }, []);

  useEffect(() => {
    loadList();
    const t = setInterval(loadList, POLL_MS);
    return () => clearInterval(t);
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setError(null);
    loadDetail(selectedId);
    const t = setInterval(() => loadDetail(selectedId), POLL_MS);
    return () => clearInterval(t);
  }, [selectedId, loadDetail]);

  useEffect(() => {
    if (stickToBottom.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [detail?.messages.length, selectedId]);

  async function patch(action: "assumir" | "devolver" | "encerrar" | "etapa", extra?: Record<string, unknown>) {
    if (!selectedId) return;
    setError(null);
    const res = await fetch(`/api/wa/conversations/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Falha ao atualizar a conversa");
    }
    await Promise.all([loadDetail(selectedId), loadList()]);
  }

  async function send() {
    const text = input.trim();
    if (!text || !selectedId || sending) return;
    setSending(true);
    setInput("");
    setError(null);
    try {
      const res = await fetch(`/api/wa/conversations/${selectedId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Falha ao enviar");
        setInput(text);
      }
      stickToBottom.current = true;
      await Promise.all([loadDetail(selectedId), loadList()]);
    } finally {
      setSending(false);
    }
  }

  const term = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      conversations.filter((c) => {
        if (filter === "minhas" && (c.assignedTo !== currentEmail || c.status === "closed")) return false;
        if (filter === "sla" && !c.slaViolated) return false;
        if (stageFilter && c.stage !== stageFilter) return false;
        if (term) {
          const hay = [c.contact.name, c.contact.phone, c.contact.company, c.preview]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!hay.includes(term)) return false;
        }
        return true;
      }),
    [conversations, filter, stageFilter, term, currentEmail],
  );

  const conv = detail?.conversation;
  const canText = within24h(conv?.lastInboundAt);

  function select(id: string) {
    setSelectedId(id);
    stickToBottom.current = true;
    if (!isXl) setDossierOpen(false);
  }

  return (
    <div className="card flex h-[calc(100dvh-13.5rem)] min-h-[32rem] flex-col overflow-hidden p-0 lg:h-[calc(100dvh-6.5rem)] lg:flex-row">
      {/* ── Filtros ─────────────────────────────────────────── */}
      {/* Celular: chips em linha acima da fila */}
      <div className={clsx("scrollbar-thin flex shrink-0 gap-1 overflow-x-auto border-b border-line p-2 lg:hidden", selectedId && "hidden")}>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={clsx(
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold",
              filter === f.id ? "pill-active" : "border border-line bg-paper text-muted",
            )}
          >
            {f.label}
            {counts && <span className="ml-1 opacity-70">{formatNumber(f.count(counts))}</span>}
          </button>
        ))}
      </div>

      {/* Desktop: coluna compacta */}
      <aside className="hidden w-48 shrink-0 flex-col overflow-y-auto border-r border-line bg-canvas/60 py-3 lg:flex">
        <p className="px-4 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-muted">Conversas</p>
        <nav className="px-2">
          {FILTERS.map((f) => {
            const Icon = f.icon;
            const n = counts ? f.count(counts) : 0;
            const active = filter === f.id;
            const alert = f.id === "sla" && n > 0;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={clsx(
                  "flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[13px]",
                  active ? "bg-paper font-semibold text-ink-900 shadow-[0_1px_2px_rgba(11,18,21,0.06)]" : "text-ink-700 hover:bg-paper/70",
                )}
              >
                <Icon size={14} className={clsx("shrink-0", alert ? "text-red-600" : active ? "text-brand-700" : "text-muted")} />
                <span className="flex-1 truncate">{f.label}</span>
                <span className={clsx("text-[11px] tabular-nums", alert ? "font-bold text-red-600" : "text-muted")}>
                  {formatNumber(n)}
                </span>
              </button>
            );
          })}
        </nav>

        <p className="px-4 pb-1 pt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-muted">Etapa</p>
        <nav className="px-2">
          {STAGES.map((st) => {
            const n = counts?.stages?.[st.id] ?? 0;
            const active = stageFilter === st.id;
            return (
              <button
                key={st.id}
                onClick={() => setStageFilter(active ? null : st.id)}
                className={clsx(
                  "flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[13px]",
                  active ? "bg-paper font-semibold text-ink-900 shadow-[0_1px_2px_rgba(11,18,21,0.06)]" : "text-ink-700 hover:bg-paper/70",
                )}
              >
                <span className={clsx("h-2 w-2 shrink-0 rounded-full", st.dot)} />
                <span className="flex-1 truncate">{st.label}</span>
                <span className="text-[11px] tabular-nums text-muted">{formatNumber(n)}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto px-4 pt-4">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-700">
            <MessageCircle size={12} className="text-emerald-600" /> WhatsApp
          </p>
          <p className="truncate text-[10px] text-muted">{channelPhone ?? "número da CNV"}</p>
        </div>
      </aside>

      {/* ── Fila ────────────────────────────────────────────── */}
      <section
        className={clsx(
          "flex min-h-0 w-full shrink-0 flex-col border-line lg:w-[21rem] lg:border-r",
          selectedId && "hidden lg:flex",
        )}
      >
        <div className="border-b border-line p-3">
          <div className="flex gap-2">
            <label className="relative block min-w-0 flex-1">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                className="input py-2 pl-8 text-sm"
                placeholder="Buscar nas conversas…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <button
              className="btn-dark shrink-0 px-3 py-2 text-xs"
              onClick={() => setComposer({ mode: "new" })}
              title="Iniciar conversa com um template aprovado"
            >
              <MessageSquarePlus size={15} /> <span className="hidden sm:inline">Nova</span>
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
            <span>
              {formatNumber(filtered.length)} conversa{filtered.length === 1 ? "" : "s"}
              {stageFilter && (
                <button className="ml-1 text-brand-700 hover:underline" onClick={() => setStageFilter(null)}>
                  · {STAGE_BY_ID[stageFilter].label} <X size={10} className="inline" />
                </button>
              )}
            </span>
            <span>mais recentes</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="px-6 py-10 text-center text-sm text-muted">
              <MessageCircle className="mx-auto mb-2 opacity-40" />
              {conversations.length === 0
                ? "Nenhuma conversa ainda. Elas aparecem aqui quando uma campanha dispara ou alguém escreve para o número."
                : "Nenhuma conversa com esse filtro."}
            </div>
          )}
          {filtered.map((c) => {
            const stage = isStage(c.stage) ? STAGE_BY_ID[c.stage] : null;
            const active = selectedId === c.id;
            // Chips só quando dizem algo além do padrão (IA em conversa).
            const showStatus = c.status !== "ai_active";
            const showStage = stage && stage.id !== "conversa" && stage.id !== "abordado";
            return (
              <button
                key={c.id}
                onClick={() => select(c.id)}
                className={clsx(
                  "flex w-full items-start gap-3 border-b border-line px-3 py-2.5 text-left transition hover:bg-canvas",
                  active && "bg-canvas",
                )}
              >
                <span
                  className={clsx(
                    "relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    c.status === "waiting_human"
                      ? "bg-amber-100 text-amber-700"
                      : c.status === "human_active"
                        ? "bg-sky-100 text-sky-700"
                        : c.status === "closed"
                          ? "bg-ink-100 text-muted"
                          : "bg-brand-100 text-brand-700",
                  )}
                >
                  {initials(c.contact.name, "#")}
                  {c.status === "ai_active" && (
                    <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-paper bg-brand-500 text-ink-950" title="Com a IA">
                      <Bot size={9} />
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className={clsx("truncate text-sm", c.unread > 0 ? "font-bold" : "font-semibold")}>
                      {c.contact.name || formatPhoneBr(c.contact.phone)}
                    </span>
                    <span className={clsx("shrink-0 text-[11px]", c.unread > 0 ? "font-semibold text-brand-700" : "text-muted")}>
                      {shortTime(c.lastMessageAt)}
                    </span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-2">
                    <span className={clsx("min-w-0 flex-1 truncate text-xs", c.unread > 0 ? "text-ink-900" : "text-muted")}>
                      {c.preview}
                    </span>
                    {c.unread > 0 && (
                      <span className="shrink-0 rounded-full bg-brand-500 px-1.5 text-[10px] font-bold text-[#102333]">
                        {c.unread}
                      </span>
                    )}
                  </span>
                  {(showStatus || showStage || c.slaViolated || c.assignedTo) && (
                    <span className="mt-1 flex flex-wrap items-center gap-1">
                      {c.slaViolated ? (
                        <span className="flex items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">
                          <AlertTriangle size={10} /> SLA · {timeAgo(c.waitingSince)}
                        </span>
                      ) : (
                        showStatus && (
                          <span className={clsx("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", STATUS_LABEL[c.status].cls)}>
                            {STATUS_LABEL[c.status].label}
                            {c.status === "waiting_human" && c.waitingSince ? ` · ${timeAgo(c.waitingSince)}` : ""}
                          </span>
                        )
                      )}
                      {showStage && (
                        <span className={clsx("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", stage.chip)}>
                          {stage.label}
                        </span>
                      )}
                      {c.assignedTo && (
                        <span
                          className="flex h-4 w-4 items-center justify-center rounded-full bg-sky-100 text-[8px] font-bold text-sky-700"
                          title={c.assignedTo}
                        >
                          {initials(personLabel(c.assignedTo))}
                        </span>
                      )}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Chat ────────────────────────────────────────────── */}
      <section className={clsx("flex min-h-0 min-w-0 flex-1 flex-col", !selectedId && "hidden lg:flex")}>
        {!conv ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-canvas">
              <Inbox size={24} className="opacity-50" />
            </span>
            <p className="mt-2 font-semibold text-ink-900">
              {error ?? (conversations.length === 0 ? "Nenhuma conversa ainda" : "Selecione uma conversa")}
            </p>
            <p className="max-w-xs">
              {conversations.length === 0
                ? "Conecte o número em IA & WABA e dispare uma campanha para começar a receber mensagens aqui."
                : "A fila ao lado mostra quem está com a IA, quem espera você e quem já foi resolvido."}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
              <button
                onClick={() => setSelectedId(null)}
                className="-ml-1 rounded-full p-1.5 text-muted hover:bg-canvas lg:hidden"
                aria-label="Voltar para a fila"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                {initials(detail?.contact?.name, "#")}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">
                  {detail?.contact?.name || formatPhoneBr(detail?.contact?.phone ?? "")}
                </p>
                <p className="truncate text-xs text-muted">
                  {detail?.contact?.name ? formatPhoneBr(detail.contact.phone) : ""}
                  {detail?.contact?.company ? ` · ${detail.contact.company}` : ""}
                  {conv.transferReason
                    ? ` · ${TRANSFER_REASON_LABEL[conv.transferReason] ?? conv.transferReason}`
                    : ""}
                  {conv.status === "waiting_human" && conv.waitingSince ? ` · aguardando ${timeAgo(conv.waitingSince)}` : ""}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <select
                  className={clsx(
                    "hidden rounded-full border border-line px-2.5 py-1 text-xs font-semibold sm:block",
                    isStage(conv.stage) ? STAGE_BY_ID[conv.stage].chip : "bg-paper",
                  )}
                  value={conv.stage}
                  onChange={(e) => patch("etapa", { stage: e.target.value })}
                  title="Etapa no pipeline"
                >
                  {STAGES.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.label}
                    </option>
                  ))}
                </select>
                {conv.status !== "human_active" && conv.status !== "closed" && (
                  <button className="btn-dark px-3 py-1.5 text-xs" onClick={() => patch("assumir")} title="Assumir a conversa (a IA para de responder)">
                    <Hand size={14} /> <span className="hidden sm:inline">Assumir</span>
                  </button>
                )}
                {conv.status !== "ai_active" && conv.status !== "closed" && (
                  <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => patch("devolver")} title="Devolver à IA">
                    <Bot size={14} /> <span className="hidden md:inline">Devolver à IA</span>
                  </button>
                )}
                {conv.status !== "closed" ? (
                  <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => patch("encerrar")} title="Encerrar">
                    <XCircle size={14} /> <span className="hidden md:inline">Encerrar</span>
                  </button>
                ) : (
                  <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => patch("devolver")} title="Reabrir com IA">
                    <Undo2 size={14} /> <span className="hidden md:inline">Reabrir com IA</span>
                  </button>
                )}
                <button
                  className={clsx(
                    "rounded-full border p-1.5 transition",
                    dossierOpen ? "border-brand-300 bg-brand-50 text-brand-700" : "border-line text-muted hover:bg-canvas",
                  )}
                  onClick={toggleDossier}
                  aria-label="Dossiê"
                  title={dossierOpen ? "Esconder dossiê" : "Mostrar dossiê"}
                >
                  {dossierOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="border-b border-red-300 bg-red-50 px-4 py-2 text-xs text-red-600">{error}</p>
            )}

            <div className="flex min-h-0 flex-1">
              <div className="flex min-w-0 flex-1 flex-col">
                <div
                  ref={scrollRef}
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                  }}
                  className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-canvas px-4 py-4 sm:px-6"
                >
                  {detail?.messages.map((m) => {
                    if (m.sender === "system" && m.content?.startsWith("—")) {
                      return (
                        <p key={m.id} className="py-1 text-center text-[11px] italic text-muted">
                          {m.content}
                        </p>
                      );
                    }
                    const mine = m.direction === "outbound";
                    const info = mine && m.status === "failed" ? metaErrorInfo(m.error) : null;
                    return (
                      <div key={m.id} className={clsx("flex", mine ? "justify-end" : "justify-start")}>
                        <div
                          className={clsx(
                            "relative max-w-[70%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                            mine ? "bg-brand-100" : "border border-line bg-paper",
                          )}
                        >
                          {mine && (
                            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                              {m.sender === "ai" ? "IA" : m.sender === "human" ? "Você" : "Sistema"}
                            </p>
                          )}
                          {m.mediaType !== "text" && m.mediaType !== "template" && (
                            <p className="mb-0.5 text-xs italic text-muted">
                              [{MEDIA_LABEL[m.mediaType] ?? m.mediaType}]
                            </p>
                          )}
                          {m.content && <p>{m.content}</p>}
                          <p className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted">
                            {shortTime(m.createdAt)}
                            {mine && m.status === "read" && <CheckCheck size={12} className="text-sky-700" />}
                            {mine && m.status === "delivered" && <CheckCheck size={12} />}
                            {mine && m.status === "sent" && <Check size={12} />}
                            {mine && m.status === "failed" && (
                              <span className="flex items-center gap-1 font-semibold text-red-600">
                                <AlertCircle size={12} /> não entregue
                              </span>
                            )}
                          </p>
                          {mine && m.status === "failed" && (
                            <p className="mt-1 border-t border-red-300 pt-1 text-[10px] leading-snug text-red-600">
                              {info?.titulo ?? m.error ?? "A Meta recusou o envio."}
                              {info && <span className="block text-muted">{info.explicacao}</span>}
                            </p>
                          )}
                          {m.reaction && (
                            <span className="absolute -bottom-2 right-2 rounded-full border border-line bg-paper px-1 text-xs">
                              {m.reaction}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-line p-3">
                  {!canText ? (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <p className="flex flex-1 items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-700">
                        <Clock size={13} className="mt-0.5 shrink-0" />
                        {conv.lastInboundAt
                          ? "Fora da janela de 24h do WhatsApp: texto livre é recusado pela Meta. Um template aprovado reabre a conversa — quando o cliente responder, a janela volta e a IA continua."
                          : "O cliente ainda não respondeu. Até ele escrever, só template aprovado chega."}
                      </p>
                      <button
                        className="btn-dark shrink-0 px-4 py-2 text-xs"
                        onClick={() =>
                          detail?.contact &&
                          setComposer({
                            mode: "reopen",
                            conversationId: conv.id,
                            phone: detail.contact.phone,
                            name: detail.contact.name,
                          })
                        }
                        disabled={!detail?.contact || detail.contact.optOut}
                        title={detail?.contact?.optOut ? "Contato em opt-out" : "Escolher um template aprovado e enviar"}
                      >
                        <MessageSquarePlus size={14} /> Enviar template
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        className="input flex-1"
                        placeholder={
                          conv.status === "ai_active"
                            ? "Responder assume a conversa (a IA para de responder)…"
                            : "Mensagem…"
                        }
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
                      />
                      <button className="btn-primary px-3" onClick={send} disabled={sending}>
                        <SendHorizonal size={16} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Dossiê como coluna, só no xl+ */}
              {isXl && dossierOpen && (
                <aside className="w-80 shrink-0 overflow-y-auto border-l border-line p-4">
                  <DossierPanel detail={detail} currentEmail={currentEmail} />
                </aside>
              )}
            </div>
          </>
        )}
      </section>

      {composer && (
        <TemplateComposer
          target={composer}
          onClose={() => setComposer(null)}
          onSent={(id) => {
            setComposer(null);
            setFilter("todas");
            setStageFilter(null);
            select(id);
            loadList();
          }}
        />
      )}

      {/* Dossiê como gaveta, abaixo do xl */}
      {!isXl && dossierOpen && selectedId && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          <button className="absolute inset-0 bg-black/50" aria-label="Fechar" onClick={() => setDossierOpen(false)} />
          <aside className="absolute inset-y-0 right-0 w-full max-w-sm overflow-y-auto border-l border-line bg-paper p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="brand-kicker">Dossiê</p>
              <button onClick={() => setDossierOpen(false)} className="rounded-full p-1.5 text-muted hover:bg-canvas">
                <X size={16} />
              </button>
            </div>
            <DossierPanel detail={detail} currentEmail={currentEmail} hideTitle />
          </aside>
        </div>
      )}
    </div>
  );
}

function DossierPanel({
  detail,
  currentEmail,
  hideTitle,
}: {
  detail: Detail | null;
  currentEmail: string;
  hideTitle?: boolean;
}) {
  if (!detail) {
    return (
      <>
        {!hideTitle && <p className="brand-kicker mb-3">Dossiê</p>}
        <p className="text-sm text-muted">Selecione uma conversa para ver por que essa pessoa foi abordada e o que a IA já descobriu.</p>
      </>
    );
  }

  const conv = detail.conversation;
  const st = STATUS_LABEL[conv.status];
  const stage = isStage(conv.stage) ? STAGE_BY_ID[conv.stage] : null;
  const d = detail.dossier;

  return (
    <div className="space-y-4 text-sm">
      {!hideTitle && <p className="brand-kicker">Dossiê</p>}

      {/* Atendimento */}
      <div>
        <div className="flex flex-wrap gap-1">
          <span className={clsx("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", st.cls)}>
            {st.label}
          </span>
          {stage && (
            <span className={clsx("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", stage.chip)}>
              {stage.label}
            </span>
          )}
          {conv.outcome && (
            <span className="rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-800">
              {OUTCOME_LABEL[conv.outcome] ?? conv.outcome}
            </span>
          )}
        </div>
        <dl className="mt-2 space-y-1 text-xs">
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Responsável</dt>
            <dd className="truncate">
              {conv.assignedTo
                ? conv.assignedTo === currentEmail
                  ? "você"
                  : personLabel(conv.assignedTo)
                : "—"}
            </dd>
          </div>
          {conv.status === "waiting_human" && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Aguardando</dt>
              <dd
                className={clsx(
                  conv.waitingSince &&
                    Date.now() - new Date(conv.waitingSince).getTime() > SLA_MINUTES * 60_000 &&
                    "font-semibold text-red-600",
                )}
              >
                {timeAgo(conv.waitingSince)}
              </dd>
            </div>
          )}
          {conv.transferReason && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Motivo</dt>
              <dd className="text-right">
                {TRANSFER_REASON_LABEL[conv.transferReason] ?? conv.transferReason}
              </dd>
            </div>
          )}
          {conv.campaign && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Campanha</dt>
              <dd className="truncate text-right">
                <Link href={`/dashboard/admin/whatsapp/campanhas/${conv.campaign.id}`} className="text-brand-700 hover:underline">
                  {conv.campaign.name}
                </Link>
              </dd>
            </div>
          )}
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Na etapa</dt>
            <dd>{timeAgo(conv.stageChangedAt)}</dd>
          </div>
        </dl>
        {detail.contact && (
          <Link
            href={`/dashboard/admin/whatsapp/contatos?q=${encodeURIComponent(detail.contact.phone)}`}
            className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:underline"
          >
            <UserRound size={11} /> Ficha do contato
          </Link>
        )}
        {detail.contact?.optOut && (
          <p className="mt-2 rounded-xl bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-600">
            Pediu para não receber mensagens.
          </p>
        )}
      </div>

      {/* ── Situação na CNV ─────────────────────────────────── */}
      {/* É a mesma verdade que a IA lê antes de responder: cadastro, teste de
          24h e assinatura vêm do banco da zerokm a cada mensagem. */}
      <div className="border-t border-line pt-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <BadgeCheck size={13} /> Situação na CNV
        </p>
        {!d?.registered ? (
          <p className="mt-1 text-xs text-muted">
            Ainda <b className="text-ink-900">sem cadastro</b> — o objetivo da conversa é criar a conta
            (o teste grátis de 24h liga sozinho no cadastro).
          </p>
        ) : (
          <div className="mt-1 space-y-1.5">
            <p className="font-semibold text-ink-900">{d.displayName ?? d.email}</p>
            {d.email && <p className="text-xs text-muted">{d.email}</p>}
            {d.subscriptionActive ? (
              <p className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                Assinatura ativa{d.planName ? ` · ${d.planName}` : ""}
              </p>
            ) : d.trialActive ? (
              <p className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                Teste grátis até {dateTime(d.trialExpiresAt)}
              </p>
            ) : (
              <p className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                Cadastrado, sem assinatura ativa
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Cobranças ───────────────────────────────────────── */}
      {(d?.payments.length ?? 0) > 0 && (
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            <CreditCard size={13} /> Últimas cobranças
          </p>
          <ul className="mt-1 space-y-1 text-xs">
            {d!.payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2">
                <span className="truncate text-muted">
                  {dateTime(p.createdAt)}
                  {p.method ? ` · ${p.method}` : ""}
                </span>
                <span
                  className={clsx(
                    "shrink-0 font-semibold",
                    p.status === "approved" ? "text-emerald-600" : "text-ink-900",
                  )}
                >
                  {money(p.amount)}
                  <span className="ml-1 font-normal text-muted">{p.status}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Empresa ─────────────────────────────────────────── */}
      {d?.company && (d.company.legalName || d.company.cnpj) && (
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            <Building2 size={13} /> Empresa
          </p>
          <p className="mt-1">{d.company.legalName ?? d.company.cnpj}</p>
          <p className="text-xs text-muted">
            {[d.company.cnpj, d.company.city && `${d.company.city}${d.company.state ? `/${d.company.state}` : ""}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      )}

      {(d?.campaigns.length ?? 0) > 0 && (
        <div className="border-t border-line pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Campanhas recebidas</p>
          <ul className="mt-1 space-y-0.5 text-xs text-muted">
            {d!.campaigns.map((c) => (
              <li key={`${c.campaignId}-${c.sentAt}`} className="flex justify-between gap-2">
                <Link href={`/dashboard/admin/whatsapp/campanhas/${c.campaignId}`} className="truncate hover:underline">
                  {c.sentAt ? dateTime(c.sentAt) : "não enviada"}
                </Link>
                <span className="shrink-0">{c.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
