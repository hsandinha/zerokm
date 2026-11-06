"use client";

// Central: filtros à esquerda, fila, chat e o dossiê do cliente ao lado.
//
// O painel da direita é a diferença em relação a um inbox comum: quem assume a
// conversa vê na hora a situação do lojista no CNV — se já tem conta, se o
// teste de 24h está de pé, se a assinatura está ativa e o que já foi cobrado.
// Sem isso, o atendente promete o que já existe ou cobra quem já pagou.

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import clsx from "clsx";
import { metaErrorInfo } from "@wa/lib/meta-errors";
import { formatPhoneBr } from "@wa/lib/phone";
import { TemplateComposer, type ComposerTarget } from "@wa/components/template-composer";
import {
  AtribuirModal,
  MediaContent,
  MessageActions,
  NoteItem,
  QuotedBubble,
  WindowTimer,
  rotuloDoAutor,
  type Message,
  type Note,
} from "@wa/components/central-kit";
import { Composer } from "@wa/components/central-composer";
import { EtiquetaChip, GerenciarEtiquetas, SeletorDeEtiquetas } from "@wa/components/central-etiquetas";
import type { Etiqueta } from "@wa/lib/etiquetas";
import { BarraDeLote, type AcaoEmLote } from "@wa/components/central-lote";
import { CartaoDoAnuncio, SeloDeOrigem, type OrigemNaTela } from "@wa/components/central-anuncio";
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
  CheckSquare,
  ChevronLeft,
  Clock,
  Headset,
  Inbox,
  Hand,
  MessageCircle,
  MessageSquarePlus,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Search,
  Settings2,
  Tag,
  Undo2,
  UserRound,
  Users,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import {
  OUTCOME_LABEL,
  SLA_MINUTES,
  STATUS_LABEL,
  TRANSFER_REASON_LABEL,
  dateTime,
  formatNumber,
  initials,
  colunaDoCartao,
  corDaColuna,
  type FunilColuna,
  money,
  shortTime,
  timeAgo,
  type ConversationStatus,
} from "@wa/lib/stages";
import { usePodeUsar, useWaPanel } from "@wa/components/wa-panel";
import { TarefasDaConversa } from "@wa/components/tarefas-da-conversa";

const POLL_MS = 4000;
/** Conversas por página na fila. */
const PAGE_SIZE = 100;

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
  stageId?: string | null;
  assignedTo: string | null;
  waitingSince: string | null;
  slaViolated: boolean;
  campaignId: string | null;
  etiquetas?: string[];
  /** Chegou por anúncio (clique para WhatsApp/Messenger). */
  origem?: { canal: string; em: string; nome: string } | null;
  channelKind: ChannelKind;
  contact: {
    id: string | null;
    phone: string;
    name: string | null;
    igUsername: string | null;
    company: string | null;
  };
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
    stageId?: string | null;
    stageChangedAt: string;
    assignedTo: string | null;
    waitingSince: string | null;
    createdAt: string;
    campaign: { id: string; name: string } | null;
    channel: { kind: ChannelKind; label: string };
    etiquetas?: string[];
    /** Anúncio que abriu (ou reabriu) a conversa. */
    origem?: OrigemNaTela | null;
  };
  contact: {
    id: string;
    phone: string;
    name: string | null;
    igUsername: string | null;
    whatsappPhone: string | null;
    email: string | null;
    document: string | null;
    company: string | null;
    city: string | null;
    state: string | null;
    optOut: boolean;
    registered: boolean;
    /** Primeiro anúncio por onde o contato chegou. */
    origemPrimeira?: OrigemNaTela | null;
  } | null;
  /** Situação do lojista no CNV — o que o atendente precisa saber antes de falar. */
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
  /** Há mensagens mais antigas que as carregadas ("Ver anteriores"). */
  hasMore?: boolean;
  notes?: Note[];
  /** A IA responderia se a conversa voltasse para ela (e, se não, por quê). */
  ia?: { disponivel: boolean; motivo: string | null };
  mapsUrl?: string | null;
  me?: { email: string; role: "admin" | "operador" };
  /** Copiloto sob demanda disponível (IA liberada e chave da loja). */
  copiloto?: boolean;
};

/** Mensagens e notas internas na mesma linha do tempo. */
type TimelineItem = { kind: "msg"; at: number; m: Message } | { kind: "note"; at: number; n: Note };

const FILTERS: Array<{
  id: Filter;
  label: string;
  icon: LucideIcon;
  /** O que a API filtra: um status, "minhas" ou "sla". */
  status?: ConversationStatus | "minhas" | "sla";
  count: (c: Counts) => number;
}> = [
  { id: "todas", label: "Todas", icon: Inbox, count: (c) => c.total },
  { id: "aguardando", label: "Aguardando", icon: Clock, status: "waiting_human", count: (c) => c.waiting },
  { id: "ia", label: "Com a IA", icon: Bot, status: "ai_active", count: (c) => c.ai },
  { id: "atendimento", label: "Em atendimento", icon: Headset, status: "human_active", count: (c) => c.human },
  { id: "minhas", label: "Minhas", icon: UserRound, status: "minhas", count: (c) => c.mine },
  { id: "sla", label: "SLA violado", icon: AlertTriangle, status: "sla", count: (c) => c.sla },
  { id: "resolvidas", label: "Resolvidas", icon: CheckCircle2, status: "closed", count: (c) => c.closed },
];

function within24h(lastInboundAt: string | null | undefined): boolean {
  if (!lastInboundAt) return false;
  return Date.now() - new Date(lastInboundAt).getTime() < 24 * 3600_000;
}

/** No Direct a equipe ainda fala até 7 dias depois (tag HUMAN_AGENT). */
type ChannelKind = "whatsapp" | "instagram" | "messenger" | "sms";

/** Ícone e nome curto de cada canal na fila. */
const CHANNEL_BADGE: Partial<Record<ChannelKind, { label: string; cls: string }>> = {
  instagram: { label: "Instagram", cls: "text-pink-600" },
  messenger: { label: "Messenger", cls: "text-blue-600" },
  sms: { label: "SMS", cls: "text-amber-600" },
};

function within7d(lastInboundAt: string | null | undefined): boolean {
  if (!lastInboundAt) return false;
  return Date.now() - new Date(lastInboundAt).getTime() < 7 * 24 * 3600_000;
}

/** Telefone formatado; contato do Instagram mostra o @ (não tem telefone). */
function contactHandle(contact: { phone: string; igUsername?: string | null }): string {
  if (contact.phone.startsWith("ig:")) {
    return contact.igUsername ? `@${contact.igUsername}` : "Instagram";
  }
  if (contact.phone.startsWith("fb:")) return "Messenger";
  return formatPhoneBr(contact.phone);
}

function personLabel(email: string | null): string {
  if (!email) return "";
  return email.split("@")[0].replace(/[._-]/g, " ");
}

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
  const { base, store } = useWaPanel();
  const podeUsar = usePodeUsar();
  const params = useSearchParams();
  const [conversations, setConversations] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [channelPhone, setChannelPhone] = useState<string | null>(null);
  const [channelList, setChannelList] = useState<Array<{ kind: string; label: string }>>([]);
  const [selectedId, setSelectedId] = useState<string | null>(params?.get("c") ?? null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [filter, setFilter] = useState<Filter>("todas");
  // Coluna do funil filtrada na barra lateral ("sem" = cartões sem coluna).
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [funil, setFunil] = useState<{ colunas: FunilColuna[]; contagem: Record<string, number> } | null>(null);
  const [search, setSearch] = useState("");
  const [dossierOpen, setDossierOpen] = useState(false);
  const [composer, setComposer] = useState<ComposerTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Fila: a busca vai para o servidor (com folga de digitação) e a página
  // cresce de 100 em 100 no "Carregar mais".
  const [busca, setBusca] = useState("");
  const [listLimit, setListLimit] = useState(PAGE_SIZE);
  const [listMeta, setListMeta] = useState<{ hasMore: boolean; matching: number }>({ hasMore: false, matching: 0 });
  // Meta de 1ª resposta da loja (Configuração); o padrão vale até a lista chegar.
  const [slaMinutes, setSlaMinutes] = useState(SLA_MINUTES);
  const [loadingMore, setLoadingMore] = useState(false);
  // Histórico: páginas anteriores às 200 mais novas que o poll mantém.
  const [older, setOlder] = useState<Message[]>([]);
  const [olderHasMore, setOlderHasMore] = useState<boolean | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [atribuirOpen, setAtribuirOpen] = useState(false);
  // Etiquetas da loja (vêm com a fila), a filtrada na barra lateral, o
  // seletor da conversa e o cadastro da gestão.
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([]);
  const [labelFilter, setLabelFilter] = useState<string | null>(null);
  const [seletorEtiquetas, setSeletorEtiquetas] = useState(false);
  const [gerenciarEtiquetas, setGerenciarEtiquetas] = useState(false);
  const [gestor, setGestor] = useState(false);
  /** A IA responderia se a conversa voltasse para ela (ações em lote). */
  const [iaDaLoja, setIaDaLoja] = useState(false);
  // Seleção de várias conversas para as ações em lote.
  const [selecionando, setSelecionando] = useState(false);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  /** Distância do fim antes de pôr as anteriores no topo (fica onde estava lendo). */
  const keepScroll = useRef<number | null>(null);
  const listSeq = useRef(0);
  const selectedRef = useRef<string | null>(selectedId);
  /** Última página do poll, para guardar o que sai dela quando chega mensagem nova. */
  const paginaRef = useRef<{ id: string; messages: Message[] } | null>(null);
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
    // Resposta de uma busca/filtro antigo que chega depois da nova não vale.
    const seq = ++listSeq.current;
    try {
      const sp = new URLSearchParams();
      if (statusParam) sp.set("status", statusParam);
      if (busca) sp.set("q", busca);
      // Coluna do funil filtrada no servidor: a contagem da barra é do total.
      if (stageFilter) sp.set("coluna", stageFilter);
      if (labelFilter) sp.set("etiqueta", labelFilter);
      sp.set("limit", String(listLimit));
      const res = await fetch(`/api/wa/conversations?${sp.toString()}`);
      if (!res.ok || seq !== listSeq.current) return;
      const body = await res.json();
      if (seq !== listSeq.current) return;
      setConversations(body.conversations ?? []);
      setCounts(body.counts ?? null);
      setFunil(body.funil ?? null);
      setListMeta({ hasMore: Boolean(body.hasMore), matching: Number(body.matching ?? 0) });
      if (typeof body.slaMinutes === "number") setSlaMinutes(body.slaMinutes);
      setChannelPhone(body.channel?.phone ?? null);
      setChannelList(body.channels ?? []);
      setEtiquetas(body.etiquetas ?? []);
      setGestor(body.role === "admin");
      setIaDaLoja(Boolean(body.ia?.disponivel));
    } catch {
      /* rede oscilou — o próximo poll resolve */
    }
  }, [statusParam, busca, listLimit, stageFilter, labelFilter]);

  // Folga de digitação antes de buscar no servidor; trocar a busca ou o
  // filtro volta para a primeira página.
  useEffect(() => {
    const t = setTimeout(() => setBusca(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setListLimit(PAGE_SIZE), [busca, statusParam, stageFilter, labelFilter]);
  // Etiqueta apagada some do filtro.
  useEffect(() => {
    if (labelFilter && etiquetas.length && !etiquetas.some((e) => e.id === labelFilter)) setLabelFilter(null);
  }, [etiquetas, labelFilter]);

  function loadMore() {
    setLoadingMore(true);
    setListLimit((n) => Math.min(n + PAGE_SIZE, 1000));
  }
  useEffect(() => setLoadingMore(false), [conversations]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/wa/conversations/${id}`);
      if (!res.ok) {
        if (res.status === 404) setError("Conversa não encontrada.");
        return;
      }
      const body = (await res.json()) as Detail;
      // O poll da conversa anterior pode chegar depois da troca.
      if (id !== selectedRef.current) return;
      // O poll traz sempre as 200 mais novas: com mensagem nova, as mais
      // antigas da página anterior saem dela. Elas vão para `older`, senão
      // sumiriam entre as carregadas por "Ver anteriores" e esta página.
      const antes = paginaRef.current;
      if (antes?.id === id && body.messages.length > 0) {
        const novas = new Set(body.messages.map((m) => m.id));
        const primeira = new Date(body.messages[0].createdAt).getTime();
        const sairam = antes.messages.filter(
          (m) => !novas.has(m.id) && new Date(m.createdAt).getTime() <= primeira,
        );
        if (sairam.length > 0) {
          setOlder((prev) => {
            const ja = new Set(prev.map((m) => m.id));
            return [...prev, ...sairam.filter((m) => !ja.has(m.id))].sort(
              (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
            );
          });
        }
      }
      paginaRef.current = { id, messages: body.messages };
      setDetail(body);
    } catch {
      /* idem */
    }
  }, []);

  useEffect(() => {
    loadList();
    const t = setInterval(loadList, POLL_MS);
    return () => clearInterval(t);
  }, [loadList]);

  // Trocou de conversa: as páginas antigas e a citação eram da outra.
  useEffect(() => {
    selectedRef.current = selectedId;
    setOlder([]);
    setOlderHasMore(null);
    setReplyingTo(null);
    setSeletorEtiquetas(false);
  }, [selectedId]);

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

  // A página tem sempre as 200 mais novas: o tamanho não muda quando chega
  // mensagem numa conversa longa, então quem decide é a última mensagem.
  const lastMessageId = detail?.messages[detail.messages.length - 1]?.id;
  useEffect(() => {
    if (stickToBottom.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [lastMessageId, detail?.notes?.length, selectedId]);

  // As anteriores entraram no topo: a tela fica onde a pessoa estava lendo.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && keepScroll.current !== null) {
      el.scrollTop = el.scrollHeight - keepScroll.current;
      keepScroll.current = null;
    }
  }, [older]);

  async function loadOlder() {
    if (!selectedId || loadingOlder) return;
    const first = older[0] ?? detail?.messages[0];
    if (!first) return;
    const el = scrollRef.current;
    keepScroll.current = el ? el.scrollHeight - el.scrollTop : null;
    stickToBottom.current = false;
    setLoadingOlder(true);
    const id = selectedId;
    try {
      const res = await fetch(`/api/wa/conversations/${id}?before=${encodeURIComponent(first.id)}`);
      if (!res.ok) return;
      const body = (await res.json()) as { messages: Message[]; hasMore: boolean };
      if (id !== selectedRef.current) return;
      setOlder((prev) => [...body.messages, ...prev]);
      setOlderHasMore(body.hasMore);
    } finally {
      setLoadingOlder(false);
    }
  }

  /** Mensagens (antigas + a página do poll, sem repetir) e notas, por data. */
  const timeline = useMemo<TimelineItem[]>(() => {
    if (!detail) return [];
    const seen = new Set<string>();
    const msgs: Message[] = [];
    for (const m of [...older, ...detail.messages]) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      msgs.push(m);
    }
    const moreBefore = olderHasMore ?? detail.hasMore ?? false;
    const oldestAt = msgs.length ? new Date(msgs[0].createdAt).getTime() : 0;
    const items: TimelineItem[] = msgs.map((m) => ({ kind: "msg", at: new Date(m.createdAt).getTime(), m }));
    for (const n of detail.notes ?? []) {
      const at = new Date(n.createdAt).getTime();
      // Nota de antes da primeira mensagem carregada aparece com a página dela.
      if (moreBefore && at < oldestAt) continue;
      items.push({ kind: "note", at, n });
    }
    return items.sort((a, b) => a.at - b.at);
  }, [detail, older, olderHasMore]);
  const hasOlder = olderHasMore ?? detail?.hasMore ?? false;

  async function react(m: Message, emoji: string) {
    if (!selectedId) return;
    setError(null);
    const res = await fetch(`/api/wa/conversations/${selectedId}/reagir`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId: m.id, emoji: m.reaction === emoji ? "" : emoji }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Falha ao reagir");
    }
    await loadDetail(selectedId);
  }

  async function deleteNote(n: Note) {
    if (!selectedId || !confirm("Apagar esta nota interna?")) return;
    const res = await fetch(`/api/wa/conversations/${selectedId}/notas?nota=${encodeURIComponent(n.id)}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Falha ao apagar a nota");
    }
    await loadDetail(selectedId);
  }

  /** Rola até a mensagem citada (quando ela está carregada). */
  function goToMessage(id: string | null) {
    if (!id) return;
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-brand-300");
    setTimeout(() => el.classList.remove("ring-2", "ring-brand-300"), 1500);
  }

  async function patch(
    action: "assumir" | "devolver" | "encerrar" | "etapa" | "coluna" | "atribuir",
    extra?: Record<string, unknown>,
  ): Promise<boolean> {
    if (!selectedId) return false;
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
    return res.ok;
  }

  async function alternarEtiqueta(e: Etiqueta, aplicar: boolean) {
    if (!selectedId) return;
    setError(null);
    const res = await fetch(`/api/wa/conversations/${selectedId}/etiquetas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ etiquetaId: e.id, aplicar }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Falha ao mudar a etiqueta");
    }
    await Promise.all([loadDetail(selectedId), loadList()]);
  }

  function alternarMarcada(id: string) {
    setMarcadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function sairDaSelecao() {
    setSelecionando(false);
    setMarcadas(new Set());
  }

  async function emLote(a: AcaoEmLote): Promise<string> {
    const ids = [...marcadas];
    const res = await fetch("/api/wa/conversations/lote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, ...a }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? "Não deu para fazer isso agora. Tente de novo.");
    const n = Number(body.afetadas ?? ids.length);
    const s = n === 1 ? "" : "s";
    setMarcadas(new Set());
    await loadList();
    if (selectedId) await loadDetail(selectedId);
    if (a.acao === "encerrar") return `${n} conversa${s} encerrada${s}.`;
    if (a.acao === "devolver") return `${n} conversa${s} devolvida${s} para a IA.`;
    if (a.acao === "etiqueta") return `Etiqueta "${etiquetaPorId.get(a.etiquetaId)?.nome ?? ""}" em ${n} conversa${s}.`;
    return a.email ? `${n} conversa${s} atribuída${s} a ${personLabel(a.email)}.` : `${n} conversa${s} de volta para a fila.`;
  }

  /** Depois de mandar mensagem ou salvar nota: desce e recarrega. */
  async function afterSend() {
    if (!selectedId) return;
    stickToBottom.current = true;
    await Promise.all([loadDetail(selectedId), loadList()]);
  }

  // Colunas do funil do dono: a coluna de cada conversa sai da regra
  // compartilhada com o quadro (wa/lib/stages.ts).
  const colunas = funil?.colunas ?? [];
  const colunaDe = (c: { stage: string; stageId?: string | null }) => colunaDoCartao(c, colunas);
  const semColuna = funil?.contagem?.sem ?? 0;

  // Status, busca e coluna já vêm filtrados do servidor (sobre todas as
  // conversas, não só as carregadas). Aqui só se corrige o que mudou entre
  // um poll e outro, sem refazer a busca: o servidor casa telefone pelos
  // dígitos e o @ do Instagram, e um filtro de texto local esconderia isso.
  const filtered = useMemo(
    () =>
      conversations.filter((c) => {
        if (filter === "minhas" && (c.assignedTo !== currentEmail || c.status === "closed")) return false;
        if (filter === "sla" && !c.slaViolated) return false;
        if (stageFilter && (colunaDe(c)?.id ?? "sem") !== stageFilter) return false;
        if (labelFilter && !(c.etiquetas ?? []).includes(labelFilter)) return false;
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conversations, filter, stageFilter, labelFilter, currentEmail, funil],
  );
  const etiquetaPorId = useMemo(() => new Map(etiquetas.map((e) => [e.id, e])), [etiquetas]);

  const conv = detail?.conversation;
  const channelKind = conv?.channel?.kind ?? "whatsapp";
  const iaOn = detail?.ia?.disponivel ?? false;
  const canReact = channelKind === "whatsapp";
  // Com filtro e busca no servidor, a página vazia não quer dizer caixa vazia.
  const noConversations = counts ? counts.total === 0 : conversations.length === 0;
  // Direct e Messenger: a equipe fala até 7 dias depois (tag HUMAN_AGENT), e
  // lá não existe template. SMS não tem janela nenhuma.
  const isInstagram = channelKind === "instagram" || channelKind === "messenger";
  const canText =
    channelKind === "sms" ? true : isInstagram ? within7d(conv?.lastInboundAt) : within24h(conv?.lastInboundAt);

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

        {podeUsar("funil") && colunas.length > 0 && (
          <>
            <p className="px-4 pb-1 pt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-muted">Etapa</p>
            <nav className="px-2">
              {[
                ...colunas.map((col) => ({ id: col.id, name: col.name, dot: corDaColuna(col.color).dot })),
                ...(semColuna > 0 ? [{ id: "sem", name: "Sem etapa", dot: "bg-ink-200" }] : []),
              ].map((col) => {
                const n = funil?.contagem?.[col.id] ?? 0;
                const active = stageFilter === col.id;
                return (
                  <button
                    key={col.id}
                    onClick={() => setStageFilter(active ? null : col.id)}
                    className={clsx(
                      "flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[13px]",
                      active ? "bg-paper font-semibold text-ink-900 shadow-[0_1px_2px_rgba(11,18,21,0.06)]" : "text-ink-700 hover:bg-paper/70",
                    )}
                  >
                    <span className={clsx("h-2 w-2 shrink-0 rounded-full", col.dot)} />
                    <span className="flex-1 truncate">{col.name}</span>
                    <span className="text-[11px] tabular-nums text-muted">{formatNumber(n)}</span>
                  </button>
                );
              })}
            </nav>
          </>
        )}

        {(etiquetas.length > 0 || gestor) && (
          <>
            <p className="flex items-center justify-between px-4 pb-1 pt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
              Etiquetas
              {gestor && (
                <button
                  type="button"
                  onClick={() => setGerenciarEtiquetas(true)}
                  className="rounded p-0.5 text-muted hover:text-brand-700"
                  title="Gerenciar etiquetas"
                  aria-label="Gerenciar etiquetas"
                >
                  <Settings2 size={12} />
                </button>
              )}
            </p>
            <nav className="px-2">
              {etiquetas.length === 0 && (
                <button
                  type="button"
                  onClick={() => setGerenciarEtiquetas(true)}
                  className="w-full rounded-xl px-2 py-1.5 text-left text-[12px] text-brand-700 hover:bg-paper/70"
                >
                  + Criar etiqueta
                </button>
              )}
              {etiquetas.map((et) => {
                const active = labelFilter === et.id;
                return (
                  <button
                    key={et.id}
                    onClick={() => setLabelFilter(active ? null : et.id)}
                    className={clsx(
                      "flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[13px]",
                      active ? "bg-paper font-semibold text-ink-900 shadow-[0_1px_2px_rgba(11,18,21,0.06)]" : "text-ink-700 hover:bg-paper/70",
                    )}
                  >
                    <span className={clsx("h-2 w-2 shrink-0 rounded-full", corDaColuna(et.cor).dot)} />
                    <span className="flex-1 truncate">{et.nome}</span>
                    <span className="text-[11px] tabular-nums text-muted">{formatNumber(et.conversas ?? 0)}</span>
                  </button>
                );
              })}
            </nav>
          </>
        )}

        <div className="mt-auto px-4 pt-4">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-700">
            <MessageCircle size={12} className="text-emerald-600" /> WhatsApp
          </p>
          <p className="truncate text-[10px] text-muted">{channelPhone ?? (store ? "nenhum número conectado" : "número do CNV")}</p>
          {channelList
            .filter((ch) => ch.kind !== "whatsapp")
            .map((ch) => (
              <p key={`${ch.kind}-${ch.label}`} className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-ink-700">
                <MessageCircle size={12} className={CHANNEL_BADGE[ch.kind as ChannelKind]?.cls ?? "text-muted"} />{" "}
                {CHANNEL_BADGE[ch.kind as ChannelKind]?.label ?? ch.kind} · {ch.label}
              </p>
            ))}
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
              className={clsx("shrink-0 px-2.5 py-2 text-xs", selecionando ? "btn-dark" : "btn-ghost")}
              onClick={() => (selecionando ? sairDaSelecao() : setSelecionando(true))}
              title="Selecionar várias conversas (atribuir, etiqueta, encerrar)"
              aria-pressed={selecionando}
            >
              <CheckSquare size={15} />
            </button>
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
                  · {colunas.find((c) => c.id === stageFilter)?.name ?? "Sem etapa"} <X size={10} className="inline" />
                </button>
              )}
              {labelFilter && (
                <button className="ml-1 text-brand-700 hover:underline" onClick={() => setLabelFilter(null)}>
                  · {etiquetaPorId.get(labelFilter)?.nome ?? "Etiqueta"} <X size={10} className="inline" />
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
              {noConversations
                ? "Nenhuma conversa ainda. Elas aparecem aqui quando uma campanha dispara ou alguém escreve para o número."
                : "Nenhuma conversa com esse filtro."}
            </div>
          )}
          {filtered.map((c) => {
            const coluna = colunaDe(c);
            const active = selectedId === c.id;
            // Chips só quando dizem algo além do padrão (IA em conversa).
            const showStatus = c.status !== "ai_active";
            const showStage =
              coluna && coluna.systemKey !== "conversa" && coluna.systemKey !== "abordado";
            const etiquetasDaLinha = (c.etiquetas ?? [])
              .map((id) => etiquetaPorId.get(id))
              .filter((x): x is Etiqueta => Boolean(x));
            const marcada = marcadas.has(c.id);
            return (
              <button
                key={c.id}
                onClick={() => (selecionando ? alternarMarcada(c.id) : select(c.id))}
                aria-pressed={selecionando ? marcada : undefined}
                className={clsx(
                  "flex w-full items-start gap-3 border-b border-line px-3 py-2.5 text-left transition hover:bg-canvas",
                  (selecionando ? marcada : active) && "bg-canvas",
                )}
              >
                {selecionando && (
                  <span
                    className={clsx(
                      "mt-2.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                      marcada ? "border-brand-500 bg-brand-500 text-ink-950" : "border-line bg-paper",
                    )}
                    aria-hidden
                  >
                    {marcada && <Check size={11} />}
                  </span>
                )}
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
                      {CHANNEL_BADGE[c.channelKind] && (
                        <span className={clsx("mr-1 text-[10px] font-bold uppercase", CHANNEL_BADGE[c.channelKind]!.cls)}>
                          {CHANNEL_BADGE[c.channelKind]!.label}
                        </span>
                      )}
                      {c.contact.name || contactHandle(c.contact)}
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
                  {(showStatus || showStage || c.slaViolated || c.assignedTo || etiquetasDaLinha.length > 0 || c.origem) && (
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
                        <span className={clsx("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", corDaColuna(coluna.color).chip)}>
                          {coluna.name}
                        </span>
                      )}
                      {c.origem && <SeloDeOrigem nome={c.origem.nome} />}
                      {etiquetasDaLinha.slice(0, 2).map((et) => (
                        <EtiquetaChip key={et.id} etiqueta={et} />
                      ))}
                      {etiquetasDaLinha.length > 2 && (
                        <span className="text-[10px] font-semibold text-muted">+{etiquetasDaLinha.length - 2}</span>
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
          {listMeta.hasMore && (
            <div className="flex flex-col items-center gap-1 px-3 py-3">
              <button className="btn-ghost px-4 py-1.5 text-xs" onClick={loadMore} disabled={loadingMore}>
                {loadingMore && <Loader2 size={13} className="animate-spin" />} Carregar mais
              </button>
              <span className="text-[11px] text-muted">
                {formatNumber(conversations.length)} de {formatNumber(listMeta.matching)}
              </span>
            </div>
          )}
        </div>
        {selecionando && (
          <BarraDeLote
            marcadas={marcadas.size}
            visiveis={filtered.length}
            currentEmail={currentEmail}
            etiquetas={etiquetas}
            iaDisponivel={iaDaLoja}
            onTodas={() => setMarcadas(new Set(filtered.map((c) => c.id)))}
            onCancelar={sairDaSelecao}
            onAcao={emLote}
          />
        )}
      </section>

      {/* ── Chat ────────────────────────────────────────────── */}
      <section className={clsx("flex min-h-0 min-w-0 flex-1 flex-col", !selectedId && "hidden lg:flex")}>
        {!conv ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-canvas">
              <Inbox size={24} className="opacity-50" />
            </span>
            <p className="mt-2 font-semibold text-ink-900">
              {error ?? (noConversations ? "Nenhuma conversa ainda" : "Selecione uma conversa")}
            </p>
            <p className="max-w-xs">
              {noConversations
                ? store
                  ? "Conecte o WhatsApp da loja em Configuração. As conversas aparecem aqui quando um cliente escreve ou uma campanha dispara."
                  : "Conecte o número em IA & WABA e dispare uma campanha para começar a receber mensagens aqui."
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
                  {detail?.contact?.name || (detail?.contact ? contactHandle(detail.contact) : "")}
                </p>
                <p className="truncate text-xs text-muted">
                  {CHANNEL_BADGE[channelKind] ? `${CHANNEL_BADGE[channelKind]!.label} · ` : ""}
                  {detail?.contact?.name ? contactHandle(detail.contact) : ""}
                  {isInstagram && detail?.contact?.whatsappPhone
                    ? ` · ${formatPhoneBr(detail.contact.whatsappPhone)}`
                    : ""}
                  {detail?.contact?.company ? ` · ${detail.contact.company}` : ""}
                  {conv.transferReason
                    ? ` · ${TRANSFER_REASON_LABEL[conv.transferReason] ?? conv.transferReason}`
                    : ""}
                  {conv.status === "waiting_human" && conv.waitingSince ? ` · aguardando ${timeAgo(conv.waitingSince)}` : ""}
                </p>
                {(conv.etiquetas?.length ?? 0) > 0 && (
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {conv.etiquetas!.map((id) => {
                      const et = etiquetaPorId.get(id);
                      return et ? <EtiquetaChip key={id} etiqueta={et} /> : null;
                    })}
                  </div>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                {podeUsar("funil") && colunas.length > 0 && (
                  <select
                    className={clsx(
                      "hidden rounded-full border border-line px-2.5 py-1 text-xs font-semibold sm:block",
                      colunaDe(conv) ? corDaColuna(colunaDe(conv)!.color).chip : "bg-paper",
                    )}
                    value={colunaDe(conv)?.id ?? ""}
                    onChange={(e) => e.target.value && patch("coluna", { colunaId: e.target.value })}
                    title="Coluna no funil"
                  >
                    {!colunaDe(conv) && <option value="">Sem etapa</option>}
                    {colunas.map((col) => (
                      <option key={col.id} value={col.id}>
                        {col.name}
                      </option>
                    ))}
                  </select>
                )}
                {conv.status !== "human_active" && conv.status !== "closed" && (
                  <button className="btn-dark px-3 py-1.5 text-xs" onClick={() => patch("assumir")} title="Assumir a conversa (a IA para de responder)">
                    <Hand size={14} /> <span className="hidden sm:inline">Assumir</span>
                  </button>
                )}
                {/* Sem IA que responda (recurso desligado, IA pausada, sem chave
                    ou assinatura inativa), devolver deixaria o cliente falando
                    sozinho: o botão some, e o servidor também recusa. */}
                {iaOn && conv.status !== "ai_active" && conv.status !== "closed" && (
                  <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => patch("devolver")} title="Devolver à IA">
                    <Bot size={14} /> <span className="hidden md:inline">Devolver à IA</span>
                  </button>
                )}
                {conv.status === "human_active" && conv.assignedTo && conv.assignedTo !== currentEmail && (
                  <button
                    className="btn-dark px-3 py-1.5 text-xs"
                    onClick={() => patch("atribuir", { email: currentEmail })}
                    title={`Está com ${personLabel(conv.assignedTo)}. Assumir para você.`}
                  >
                    <Hand size={14} /> <span className="hidden sm:inline">Assumir</span>
                  </button>
                )}
                {conv.status !== "closed" ? (
                  <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => patch("encerrar")} title="Encerrar">
                    <XCircle size={14} /> <span className="hidden md:inline">Encerrar</span>
                  </button>
                ) : (
                  iaOn && (
                    <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => patch("devolver")} title="Reabrir com IA">
                      <Undo2 size={14} /> <span className="hidden md:inline">Reabrir com IA</span>
                    </button>
                  )
                )}
                <button
                  className="btn-ghost px-3 py-1.5 text-xs"
                  onClick={() => setAtribuirOpen(true)}
                  title="Transferir para alguém da equipe"
                >
                  <Users size={14} /> <span className="hidden xl:inline">Transferir</span>
                </button>
                {(etiquetas.length > 0 || gestor) && (
                  <div className="relative">
                    <button
                      className={clsx(
                        "btn-ghost px-3 py-1.5 text-xs",
                        (conv.etiquetas?.length ?? 0) > 0 && "text-brand-700",
                      )}
                      onClick={() => setSeletorEtiquetas((v) => !v)}
                      title="Etiquetas da conversa"
                    >
                      <Tag size={14} />
                      {(conv.etiquetas?.length ?? 0) > 0 && (
                        <span className="text-[11px] tabular-nums">{conv.etiquetas!.length}</span>
                      )}
                    </button>
                    {seletorEtiquetas && (
                      <SeletorDeEtiquetas
                        etiquetas={etiquetas}
                        aplicadas={conv.etiquetas ?? []}
                        podeEditar={gestor}
                        onToggle={alternarEtiqueta}
                        onGerenciar={() => {
                          setSeletorEtiquetas(false);
                          setGerenciarEtiquetas(true);
                        }}
                        onClose={() => setSeletorEtiquetas(false)}
                      />
                    )}
                  </div>
                )}
                <WindowTimer lastInboundAt={conv.lastInboundAt} kind={channelKind} />
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
                  {conv.origem && !hasOlder && (
                    <CartaoDoAnuncio
                      origem={conv.origem}
                      podeNomear={detail?.me?.role === "admin"}
                      onNomeado={() => selectedId && loadDetail(selectedId)}
                    />
                  )}
                  {hasOlder && (
                    <div className="flex justify-center pb-2">
                      <button
                        className="flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1 text-[11px] font-semibold text-ink-700 hover:bg-canvas"
                        onClick={loadOlder}
                        disabled={loadingOlder}
                      >
                        {loadingOlder && <Loader2 size={12} className="animate-spin" />} Ver anteriores
                      </button>
                    </div>
                  )}
                  {timeline.map((item) => {
                    if (item.kind === "note") {
                      const n = item.n;
                      return (
                        <NoteItem
                          key={`n-${n.id}`}
                          note={n}
                          canDelete={n.authorEmail === currentEmail || detail?.me?.role === "admin"}
                          onDelete={() => deleteNote(n)}
                        />
                      );
                    }
                    const m = item.m;
                    // Linha do tempo: passagem para a equipe, transferência…
                    if (m.sender === "system" && (m.mediaType === "evento" || m.content?.startsWith("—"))) {
                      return (
                        <p key={m.id} className="py-1 text-center text-[11px] italic text-muted">
                          {m.content}
                        </p>
                      );
                    }
                    const mine = m.direction === "outbound";
                    const info = mine && m.status === "failed" ? metaErrorInfo(m.error) : null;
                    // Citar e reagir precisam do wamid; o Direct e o Messenger
                    // daqui não mostram citação.
                    const actionable = channelKind === "whatsapp" && Boolean(m.externalId) && m.sender !== "system";
                    return (
                      <div key={m.id} className={clsx("flex", mine ? "justify-end" : "justify-start")}>
                        <div
                          id={`msg-${m.id}`}
                          className={clsx(
                            "group relative max-w-[70%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed transition",
                            mine ? "bg-brand-100" : "border border-line bg-paper",
                          )}
                        >
                          {actionable && canText && (
                            <MessageActions
                              mine={mine}
                              canReact={canReact && !mine}
                              onReply={() => setReplyingTo(m)}
                              onReact={(emoji) => react(m, emoji)}
                            />
                          )}
                          {mine && (
                            <p
                              className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted"
                              title={m.authorEmail ?? undefined}
                            >
                              {rotuloDoAutor(m, currentEmail)}
                            </p>
                          )}
                          {m.quoted && (
                            <QuotedBubble
                              q={m.quoted}
                              contactName={detail?.contact?.name ?? null}
                              onClick={() => goToMessage(m.quoted?.id ?? null)}
                            />
                          )}
                          <MediaContent m={m} />
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

                <Composer
                  conversationId={conv.id}
                  channelKind={channelKind}
                  contactName={detail?.contact?.name ?? null}
                  canText={canText}
                  bloqueio={
                    isInstagram ? (
                      <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-700">
                        <Clock size={13} className="mt-0.5 shrink-0" />
                        Passaram 7 dias desde a última mensagem: o {CHANNEL_BADGE[channelKind]?.label ?? "canal"} não
                        deixa escrever até a pessoa mandar de novo (e lá não existe template).
                      </p>
                    ) : (
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
                    )
                  }
                  placeholder={
                    conv.status === "ai_active"
                      ? "Responder assume a conversa (a IA para de responder)…"
                      : "Mensagem… (/ para respostas rápidas)"
                  }
                  replyingTo={replyingTo}
                  onCancelReply={() => setReplyingTo(null)}
                  onSent={afterSend}
                  onError={setError}
                  podeEstoque={store}
                  mapsUrl={detail?.mapsUrl ?? null}
                  lastInboundAt={conv.lastInboundAt}
                  copiloto={detail?.copiloto ?? false}
                />
              </div>

              {/* Dossiê como coluna, só no xl+ */}
              {isXl && dossierOpen && (
                <aside className="w-80 shrink-0 overflow-y-auto border-l border-line p-4">
                  <DossierPanel detail={detail} currentEmail={currentEmail} colunas={colunas} slaMinutes={slaMinutes} />
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

      {gerenciarEtiquetas && (
        <GerenciarEtiquetas
          etiquetas={etiquetas}
          onClose={() => setGerenciarEtiquetas(false)}
          onChanged={async () => {
            await loadList();
            if (selectedId) await loadDetail(selectedId);
          }}
        />
      )}

      {atribuirOpen && conv && (
        <AtribuirModal
          assignedTo={conv.assignedTo}
          currentEmail={currentEmail}
          onClose={() => setAtribuirOpen(false)}
          onConfirm={(email, motivo) => patch("atribuir", { email, motivo })}
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
            <DossierPanel detail={detail} currentEmail={currentEmail} colunas={colunas} slaMinutes={slaMinutes} hideTitle />
          </aside>
        </div>
      )}
    </div>
  );
}

function DossierPanel({
  detail,
  currentEmail,
  colunas,
  slaMinutes,
  hideTitle,
}: {
  detail: Detail | null;
  currentEmail: string;
  colunas: FunilColuna[];
  slaMinutes: number;
  hideTitle?: boolean;
}) {
  const { base, store } = useWaPanel();
  const podeUsar = usePodeUsar();
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
  const coluna = colunaDoCartao(conv, colunas);
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
          {coluna && (
            <span className={clsx("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", corDaColuna(coluna.color).chip)}>
              {coluna.name}
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
                    Date.now() - new Date(conv.waitingSince).getTime() > slaMinutes * 60_000 &&
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
                <Link href={`${base}/campanhas/${conv.campaign.id}`} className="text-brand-700 hover:underline">
                  {conv.campaign.name}
                </Link>
              </dd>
            </div>
          )}
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Na etapa</dt>
            <dd>{timeAgo(conv.stageChangedAt)}</dd>
          </div>
          {conv.origem && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Origem</dt>
              <dd className="truncate text-right" title={conv.origem.nome}>
                Anúncio · {conv.origem.nome}
              </dd>
            </div>
          )}
          {detail.contact?.origemPrimeira &&
            detail.contact.origemPrimeira.em !== conv.origem?.em && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Primeiro contato</dt>
                <dd className="truncate text-right" title={detail.contact.origemPrimeira.nome}>
                  {detail.contact.origemPrimeira.nome} · {dateTime(detail.contact.origemPrimeira.em)}
                </dd>
              </div>
            )}
        </dl>
        {detail.contact && (
          <Link
            href={`${base}/contatos?q=${encodeURIComponent(detail.contact.phone)}`}
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

      {podeUsar("agenda") && <TarefasDaConversa conversationId={conv.id} />}

      {/* ── Situação no CNV ─────────────────────────────────── */}
      {/* É a mesma verdade que a IA lê antes de responder: cadastro, teste de
          24h e assinatura vêm do banco da zerokm a cada mensagem. */}
      {!store && (
      <div className="border-t border-line pt-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <BadgeCheck size={13} /> Situação no CNV
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

      )}

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
                <Link href={`${base}/campanhas/${c.campaignId}`} className="truncate hover:underline">
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
