"use client";

// Enriquecimento pela Procob, em dois caminhos:
//
//   por CNPJ — a Procob devolve os sócios (com CPF completo) e, para cada
//              sócio escolhido, os celulares e e-mails;
//   por CPF  — quando o CPF já é conhecido, pula o CNPJ e vai direto aos
//              contatos; as empresas do sócio saem do mesmo grafo.
//
// O que vira contato de WhatsApp é decisão de quem está na tela — cada
// telefone tem um botão "Salvar como contato".
//
// Toda consulta é paga: o contador no topo mostra quantas foram à API e
// quantas saíram do cache, e a tela avisa quando está no sandbox.

import { useCallback, useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import Link from "next/link";
import clsx from "clsx";
import {
  AlertTriangle,
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  FileUp,
  FlaskConical,
  Loader2,
  Mail,
  MessageCircle,
  Network,
  Phone,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Square,
  Star,
  Target,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import { formatCnpj, formatCpf, formatDocument, isValidCnpj, isValidCpf, matchesPartialCpf, namesLookAlike, onlyDigits } from "@wa/lib/documento";
import { formatPhoneBr } from "@wa/lib/phone";
import { dateTime, initials, timeAgo } from "@wa/lib/stages";
import type { CnpjState, CpfState, LookupMeta, PartnerContactRow, PartnerState } from "@wa/lib/enrichment";

type Participation = {
  cnpj: string;
  name: string;
  condition: string | null;
  since: string | null;
  active: boolean;
  status: string | null;
  isClient: boolean;
  targetId: string | null;
  targetStatus: string | null;
};

type PartnerUi = PartnerState & {
  selected: boolean;
  expanded: boolean;
  loading: boolean;
  error: string | null;
  notice?: string | null;
  participationsList: Participation[] | null;
  participationsLoading: boolean;
};

type ResultUi = Omit<CnpjState, "partners" | "deceasedPartners"> & {
  partners: PartnerUi[];
  deceasedPartners: PartnerUi[];
  error?: string | null;
  loading?: boolean;
};

type Known = { known: boolean; name: string | null; refreshedAt: string | null; found: boolean } | null;

type CpfEntry = { cpf: string; name: string | null; known?: Known };

type CpfUi = CpfState & { loading?: boolean; error?: string | null; notice?: string | null; participationsLoading?: boolean };

type RecentPerson = {
  cpf: string;
  name: string | null;
  phones: number;
  emails: number;
  found: boolean;
  sandbox: boolean;
  refreshedAt: string;
};

type Recent = {
  cnpj: string;
  name: string | null;
  partners: number;
  found: boolean;
  sandbox: boolean;
  refreshedAt: string;
};

type Session = { paid: number; cached: number; saldo: string | null; sandbox: boolean };

const KIND_LABEL: Record<PartnerContactRow["kind"], string> = {
  celular: "celular",
  comercial: "comercial",
  fixo: "fixo",
  outros: "outro",
  email: "e-mail",
};

/** A Procob às vezes põe celular em "outros"; o nono dígito é quem decide. */
function isMobile(e164: string | null): boolean {
  return Boolean(e164 && /^\+55\d{2}9\d{8}$/.test(e164));
}

const TARGET_STATUS: Record<string, string> = {
  new: "sem telefone",
  ready: "pronto para campanha",
  on_hold: "em espera",
  queued: "em campanha",
  sent: "abordado",
  replied: "respondeu",
  won: "ganho",
  lost: "perdido",
  suppressed: "suprimido",
};

function toUi(state: CnpjState, prev?: ResultUi): ResultUi {
  const prevBy = new Map(
    [...(prev?.partners ?? []), ...(prev?.deceasedPartners ?? [])].map((p) => [p.document, p]),
  );
  const ui = (p: PartnerState, selectable: boolean): PartnerUi => {
    const old = prevBy.get(p.document);
    return {
      ...p,
      selected: selectable ? (old?.selected ?? (p.kind === "PF" && p.active && !p.personLookup)) : false,
      expanded: old?.expanded ?? false,
      loading: false,
      error: null,
      participationsList: old?.participationsList ?? null,
      participationsLoading: false,
    };
  };
  return {
    ...state,
    partners: state.partners.map((p) => ui(p, true)),
    deceasedPartners: state.deceasedPartners.map((p) => ui(p, false)),
  };
}

type Entry = {
  cnpj: string;
  ownerName: string | null;
  ownerCpf: string | null;
  origin: "texto" | "csv" | "alvos";
  /** Preenchido ao entrar na fila: já foi pesquisado antes? (sem custo) */
  known?: Known;
};

type CsvDraft = {
  file: string;
  headers: string[];
  rows: Record<string, string>[];
  cnpjCol: string;
  nameCol: string;
  cpfCol: string;
};

/** Coluna com mais CNPJs válidos — para planilha sem cabeçalho reconhecível. */
function guessCnpjColumn(headers: string[], rows: Record<string, string>[]): string {
  const byName = headers.find((h) => /cnpj/i.test(h));
  if (byName) return byName;
  let best = "";
  let bestHits = 0;
  for (const h of headers) {
    const hits = rows.slice(0, 200).filter((r) => isValidCnpj(onlyDigits(r[h]))).length;
    if (hits > bestHits) {
      best = h;
      bestHits = hits;
    }
  }
  return best;
}

function guessColumn(headers: string[], preferred: RegExp, fallback?: RegExp, exclude?: RegExp): string {
  const pick = (re: RegExp) => headers.find((h) => re.test(h) && !(exclude && exclude.test(h)));
  return pick(preferred) ?? (fallback ? pick(fallback) : undefined) ?? "";
}

/** "12.345.678/0001-90; João da Silva; ***.123.456-**" → uma entrada. */
function parseLine(line: string): Entry | null {
  const tokens = line.split(/[;\t,|]+/).map((t) => t.trim()).filter(Boolean);
  const cnpjToken = tokens.find((t) => isValidCnpj(onlyDigits(t)));
  if (!cnpjToken) return null;
  const rest = tokens.filter((t) => t !== cnpjToken);
  const cpf = rest.find((t) => /\d{3}/.test(t) && onlyDigits(t).length >= 3 && onlyDigits(t).length <= 11 && !/[a-zA-Z]{3,}/.test(t));
  const name = rest.find((t) => /[a-zA-ZÀ-ÿ]{3,}/.test(t) && t !== cpf);
  return { cnpj: onlyDigits(cnpjToken), ownerName: name ?? null, ownerCpf: cpf ? onlyDigits(cpf) : null, origin: "texto" };
}

/** "060.242.406-27; Hebert Sandinha" → uma entrada de CPF. */
function parseCpfLine(line: string): CpfEntry | null {
  const tokens = line.split(/[;\t,|]+/).map((t) => t.trim()).filter(Boolean);
  const cpfToken = tokens.find((t) => isValidCpf(onlyDigits(t)));
  if (!cpfToken) return null;
  const name = tokens.find((t) => t !== cpfToken && /[a-zA-ZÀ-ÿ]{3,}/.test(t));
  return { cpf: onlyDigits(cpfToken), name: name ?? null };
}

export function Enrichment() {
  const [mode, setMode] = useState<"cnpj" | "cpf">("cnpj");
  const [input, setInput] = useState("");
  const [cpfInput, setCpfInput] = useState("");
  const [cpfQueue, setCpfQueue] = useState<CpfEntry[]>([]);
  const [cpfResults, setCpfResults] = useState<CpfUi[]>([]);
  const [cpfRunning, setCpfRunning] = useState<{ done: number; total: number } | null>(null);
  const [recentPeople, setRecentPeople] = useState<RecentPerson[]>([]);
  const [ownerName, setOwnerName] = useState("");
  const [ownerCpf, setOwnerCpf] = useState("");
  const [queue, setQueue] = useState<Entry[]>([]);
  const [csv, setCsv] = useState<CsvDraft | null>(null);
  const [pending, setPending] = useState<{ total: number; loading: boolean } | null>(null);
  const [results, setResults] = useState<ResultUi[]>([]);
  const [running, setRunning] = useState<{ done: number; total: number } | null>(null);
  const stopRef = useRef(false);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [session, setSession] = useState<Session>({ paid: 0, cached: 0, saldo: null, sandbox: false });
  const [credentials, setCredentials] = useState<{ sandbox: boolean; user: string | null; proxy?: string | null } | null>(null);
  const [test, setTest] = useState<{ loading: boolean; ok?: boolean; message?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const loadRecent = useCallback(async () => {
    const res = await fetch("/api/wa/enrichment");
    if (!res.ok) return;
    const body = await res.json();
    setRecent(body.recent ?? []);
    setRecentPeople(body.recentPeople ?? []);
    setCredentials(body.credentials ?? null);
    if (body.credentials?.sandbox) setSession((s) => ({ ...s, sandbox: true }));
  }, []);

  useEffect(() => {
    loadRecent();
    fetch("/api/wa/enrichment?pending=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => b && setPending({ total: b.total ?? 0, loading: false }))
      .catch(() => {});
  }, [loadRecent]);

  function account(meta: LookupMeta | null | undefined) {
    if (!meta) return;
    setSession((s) => ({
      paid: s.paid + (meta.cached ? 0 : 1),
      cached: s.cached + (meta.cached ? 1 : 0),
      saldo: meta.saldo ?? s.saldo,
      sandbox: s.sandbox || meta.sandbox,
    }));
  }

  function upsertResult(cnpj: string, patch: (r: ResultUi | undefined) => ResultUi) {
    setResults((list) => {
      const idx = list.findIndex((r) => r.cnpj === cnpj);
      const next = patch(idx >= 0 ? list[idx] : undefined);
      if (idx >= 0) return list.map((r, i) => (i === idx ? next : r));
      return [next, ...list];
    });
  }

  /** Tira o sócio da lista abordável e põe na de falecidos. */
  function moveToDeceased(cnpj: string, document: string) {
    setResults((list) =>
      list.map((r) => {
        if (r.cnpj !== cnpj) return r;
        const p = r.partners.find((x) => x.document === document);
        if (!p) return r;
        return {
          ...r,
          partners: r.partners.filter((x) => x.document !== document),
          deceasedPartners: [...r.deceasedPartners, { ...p, deceased: true, selected: false }],
        };
      }),
    );
  }

  function patchPartner(cnpj: string, document: string, patch: Partial<PartnerUi>) {
    setResults((list) =>
      list.map((r) =>
        r.cnpj === cnpj
          ? { ...r, partners: r.partners.map((p) => (p.document === document ? { ...p, ...patch } : p)) }
          : r,
      ),
    );
  }

  const placeholder = (cnpj: string): ResultUi => ({
    cnpj,
    found: false,
    lookup: { code: "", kind: "error", message: null, note: null, cached: false, sandbox: false, saldo: null, refreshedAt: "" },
    subject: null,
    target: null,
    partners: [],
    deceasedPartners: [],
    participations: [],
    loading: true,
  });

  /** Pergunta ao banco quais documentos já foram pesquisados. Não custa nada. */
  const checkKnown = useCallback(async (documents: string[], product: "L0006" | "L0001") => {
    if (documents.length === 0) return new Map<string, Known>();
    const res = await fetch("/api/wa/enrichment/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documents, product }),
    });
    const body = await res.json().catch(() => ({}));
    const map = new Map<string, Known>();
    for (const r of (body.rows ?? []) as Array<{ document: string; known: boolean; name: string | null; refreshedAt: string | null; found: boolean }>) {
      map.set(r.document, r.known ? { known: true, name: r.name, refreshedAt: r.refreshedAt, found: r.found } : null);
    }
    return map;
  }, []);

  // ── Fila ──────────────────────────────────────────────────
  function addEntries(entries: Entry[]) {
    setQueue((q) => {
      const byCnpj = new Map(q.map((e) => [e.cnpj, e]));
      for (const e of entries) {
        const cur = byCnpj.get(e.cnpj);
        byCnpj.set(e.cnpj, {
          cnpj: e.cnpj,
          ownerName: e.ownerName ?? cur?.ownerName ?? null,
          ownerCpf: e.ownerCpf ?? cur?.ownerCpf ?? null,
          origin: cur?.origin ?? e.origin,
        });
      }
      return [...byCnpj.values()];
    });
    // Marca o que já foi pesquisado — a fila mostra antes de gastar.
    void checkKnown(entries.map((e) => e.cnpj), "L0006").then((map) => {
      setQueue((q) => q.map((e) => (map.has(e.cnpj) ? { ...e, known: map.get(e.cnpj) ?? null } : e)));
    });
  }

  function addFromText() {
    setError(null);
    const lines = input.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const entries: Entry[] = [];
    let invalid = 0;
    for (const line of lines) {
      const e = parseLine(line);
      if (e) entries.push(e);
      else invalid++;
    }
    // Nome/CPF do dono digitados ao lado valem para quem não trouxe na linha.
    for (const e of entries) {
      if (!e.ownerName && ownerName.trim()) e.ownerName = ownerName.trim();
      if (!e.ownerCpf && ownerCpf.trim()) e.ownerCpf = onlyDigits(ownerCpf);
    }
    if (entries.length === 0) {
      setError(invalid ? `Nenhum CNPJ válido (${invalid} linha${invalid === 1 ? "" : "s"} ignorada${invalid === 1 ? "" : "s"}).` : "Cole ao menos um CNPJ.");
      return 0;
    }
    if (invalid) setError(`${invalid} linha${invalid === 1 ? " ignorada" : "s ignoradas"} sem CNPJ válido.`);
    addEntries(entries);
    setInput("");
    return entries.length;
  }

  function importCsv(file: File) {
    setError(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const headers = (res.meta.fields ?? []).filter(Boolean);
        const rows = res.data;
        if (headers.length === 0 || rows.length === 0) {
          setError("Não consegui ler o arquivo — precisa ter cabeçalho e ao menos uma linha.");
          return;
        }
        setCsv({
          file: file.name,
          headers,
          rows,
          cnpjCol: guessCnpjColumn(headers, rows),
          nameCol: guessColumn(headers, /s[óo]cio|propriet|dono|respons|contato|administrador/i, /nome/i, /raz[ãa]o|empresa|fantasia/i),
          cpfCol: guessColumn(headers, /cpf/i),
        });
      },
      error: () => setError("Não consegui ler o arquivo CSV."),
    });
  }

  const csvEntries = (draft: CsvDraft): Entry[] => {
    const out: Entry[] = [];
    for (const r of draft.rows) {
      const cnpj = onlyDigits(r[draft.cnpjCol]);
      if (!isValidCnpj(cnpj)) continue;
      out.push({
        cnpj,
        ownerName: draft.nameCol ? r[draft.nameCol]?.trim() || null : null,
        ownerCpf: draft.cpfCol ? onlyDigits(r[draft.cpfCol]) || null : null,
        origin: "csv",
      });
    }
    return out;
  };

  async function loadPending() {
    setPending((p) => ({ total: p?.total ?? 0, loading: true }));
    const res = await fetch("/api/wa/enrichment?pending=1");
    const body = await res.json().catch(() => ({}));
    setPending({ total: body.total ?? 0, loading: false });
    if (!res.ok) {
      setError(body.error ?? "Falha ao carregar os alvos");
      return;
    }
    addEntries(
      (body.targets ?? []).map((t: { cnpj: string; ownerName: string | null; ownerCpf: string | null }) => ({
        cnpj: t.cnpj,
        ownerName: t.ownerName,
        ownerCpf: t.ownerCpf,
        origin: "alvos" as const,
      })),
    );
  }

  // ── Consultas ─────────────────────────────────────────────
  async function runQsa(cnpj: string, refresh = false): Promise<{ message: string; kind: string } | null> {
    upsertResult(cnpj, (r) => ({ ...(r ?? placeholder(cnpj)), loading: true, error: null }));
    const res = await fetch("/api/wa/enrichment/qsa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document: cnpj, refresh }),
    });
    const body = await res.json().catch(() => ({}));
    // Consultado há pouco: só segue se a pessoa confirmar o gasto.
    if (res.status === 409 && body.kind === "repeat") {
      const ok = window.confirm(
        `Este CNPJ já foi pesquisado ${body.refreshedAt ? `em ${new Date(body.refreshedAt).toLocaleString("pt-BR")}` : "há pouco"}.\n\nConsultar de novo gasta uma nova consulta na Procob. Continuar?`,
      );
      upsertResult(cnpj, (r) => ({ ...(r ?? placeholder(cnpj)), loading: false }));
      if (!ok) {
        await loadCached(cnpj);
        return null;
      }
      return runQsaForce(cnpj);
    }
    if (!res.ok || !body.state) {
      const message = body.error ?? "Falha na consulta";
      upsertResult(cnpj, (r) => ({ ...(r ?? placeholder(cnpj)), loading: false, error: message }));
      return { message, kind: body.kind ?? "error" };
    }
    account(body.state.lookup);
    upsertResult(cnpj, (r) => toUi(body.state, r));
    return null;
  }

  /** Reconsulta confirmada pela pessoa — aí sim ignora a guarda. */
  async function runQsaForce(cnpj: string): Promise<{ message: string; kind: string } | null> {
    upsertResult(cnpj, (r) => ({ ...(r ?? placeholder(cnpj)), loading: true, error: null }));
    const res = await fetch("/api/wa/enrichment/qsa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document: cnpj, refresh: true, force: true }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.state) {
      const message = body.error ?? "Falha na consulta";
      upsertResult(cnpj, (r) => ({ ...(r ?? placeholder(cnpj)), loading: false, error: message }));
      return { message, kind: body.kind ?? "error" };
    }
    account(body.state.lookup);
    upsertResult(cnpj, (r) => toUi(body.state, r));
    return null;
  }

  async function loadCached(cnpj: string) {
    upsertResult(cnpj, (r) => ({ ...(r ?? placeholder(cnpj)), loading: true, error: null }));
    const res = await fetch(`/api/wa/enrichment?cnpj=${cnpj}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.state) {
      upsertResult(cnpj, (r) => ({ ...(r ?? placeholder(cnpj)), loading: false, error: body.error ?? "Nada guardado para este CNPJ" }));
      return;
    }
    setSession((s) => ({ ...s, sandbox: s.sandbox || body.state.lookup.sandbox }));
    upsertResult(cnpj, (r) => toUi(body.state, r));
  }

  async function runQueue() {
    // O que está no texto entra na fila antes de rodar.
    if (input.trim()) addFromText();
    setError(null);
    stopRef.current = false;
    // A fila atualizada só chega no próximo render; lê direto do estado via callback.
    const snapshot = await new Promise<Entry[]>((resolve) => setQueue((q) => (resolve(q), q)));
    const done = new Set(results.filter((r) => !r.error && !r.loading && r.lookup.refreshedAt).map((r) => r.cnpj));
    const todo = snapshot.filter((e) => !done.has(e.cnpj));
    if (todo.length === 0) {
      setError(snapshot.length ? "Todos os CNPJs da fila já foram consultados nesta sessão." : "A fila está vazia.");
      return;
    }
    setRunning({ done: 0, total: todo.length });
    for (let i = 0; i < todo.length; i++) {
      if (stopRef.current) break;
      // Já pesquisado antes: lê do banco em vez de chamar a Procob.
      if (todo[i].known?.known) {
        await loadCached(todo[i].cnpj);
        setRunning({ done: i + 1, total: todo.length });
        continue;
      }
      const failure = await runQsa(todo[i].cnpj);
      setRunning({ done: i + 1, total: todo.length });
      // Acesso, saldo ou erro de configuração: parar em vez de repetir o erro
      // N vezes. Manutenção e erro pontual seguem para o próximo documento.
      if (failure && ["auth", "credit", "config"].includes(failure.kind)) {
        setError(`Consulta interrompida: ${failure.message}`);
        break;
      }
    }
    setRunning(null);
    loadRecent();
  }

  async function fetchPerson(cnpj: string, p: PartnerUi, refresh = false) {
    patchPartner(cnpj, p.document, { loading: true, error: null, expanded: true });
    const res = await fetch("/api/wa/enrichment/person", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document: p.document, refresh }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      patchPartner(cnpj, p.document, { loading: false, error: body.error ?? "Falha na consulta" });
      return;
    }
    account(body.lookup);
    patchPartner(cnpj, p.document, {
      loading: false,
      personLookup: body.lookup,
      person: body.person,
      partnerId: body.partnerId ?? p.partnerId,
      contacts: body.contacts ?? [],
      selected: false,
      deceased: p.deceased || body.person?.deceased === true,
    });
    // O QSA não acusou, mas a L0001 acusou o óbito: sai da lista de sócios e
    // vai para a de falecidos, como se já tivesse vindo marcado.
    if (body.person?.deceased === true && !p.deceased) moveToDeceased(cnpj, p.document);
  }

  async function fetchSelected(r: ResultUi) {
    const todo = r.partners.filter((p) => p.selected && !p.loading);
    for (const p of todo) await fetchPerson(r.cnpj, p);
  }

  async function fetchParticipations(cnpj: string, p: PartnerUi) {
    patchPartner(cnpj, p.document, { participationsLoading: true, error: null });
    const res = await fetch("/api/wa/enrichment/qsa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document: p.document }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      patchPartner(cnpj, p.document, { participationsLoading: false, error: body.error ?? "Falha na consulta" });
      return;
    }
    account(body.lookup);
    patchPartner(cnpj, p.document, { participationsLoading: false, participationsList: body.participations ?? [] });
  }

  async function saveContact(r: ResultUi, p: PartnerUi, c: PartnerContactRow) {
    if (!p.partnerId || !c.e164) return;
    const email = p.contacts.find((x) => x.kind === "email" && x.preferred)?.value ?? p.contacts.find((x) => x.kind === "email")?.value ?? null;
    const res = await fetch("/api/wa/enrichment/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        partnerId: p.partnerId,
        targetId: r.target?.id ?? null,
        phone: c.e164,
        email,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      patchPartner(r.cnpj, p.document, { error: body.error ?? "Falha ao salvar o contato" });
      return;
    }
    patchPartner(r.cnpj, p.document, {
      contacts: p.contacts.map((x) => (x.id === c.id ? { ...x, contactId: body.contactId, contactTargetId: r.target?.id ?? null } : x)),
    });
    if (body.targetUpdated) loadCached(r.cnpj);
  }

  async function addTarget(r: ResultUi, p: PartnerUi, part: Participation) {
    const res = await fetch("/api/wa/enrichment/target", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cnpj: part.cnpj, name: part.name, partnerId: p.partnerId, condition: part.condition }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      patchPartner(r.cnpj, p.document, { error: body.error ?? "Falha ao criar o alvo" });
      return;
    }
    patchPartner(r.cnpj, p.document, {
      participationsList: (p.participationsList ?? []).map((x) =>
        x.cnpj === part.cnpj ? { ...x, targetId: body.targetId, targetStatus: body.status, isClient: body.isClient } : x,
      ),
    });
  }

  // ── Modo CPF ──────────────────────────────────────────────
  function upsertCpf(cpf: string, patch: (r: CpfUi | undefined) => CpfUi) {
    setCpfResults((list) => {
      const i = list.findIndex((r) => r.cpf === cpf);
      const next = patch(i >= 0 ? list[i] : undefined);
      return i >= 0 ? list.map((r, j) => (j === i ? next : r)) : [next, ...list];
    });
  }

  function patchCpf(cpf: string, patch: Partial<CpfUi>) {
    setCpfResults((list) => list.map((r) => (r.cpf === cpf ? { ...r, ...patch } : r)));
  }

  const cpfPlaceholder = (cpf: string): CpfUi => ({
    cpf,
    found: false,
    lookup: { code: "", kind: "ok", message: null, note: null, cached: false, sandbox: false, saldo: null, refreshedAt: "" },
    partnerId: null,
    partnerName: null,
    person: null,
    contacts: [],
    participations: null,
    participationsLookup: null,
    loading: true,
  });

  function addCpfEntries(entries: CpfEntry[]) {
    setCpfQueue((q) => {
      const by = new Map(q.map((e) => [e.cpf, e]));
      for (const e of entries) by.set(e.cpf, { cpf: e.cpf, name: e.name ?? by.get(e.cpf)?.name ?? null });
      return [...by.values()];
    });
    void checkKnown(entries.map((e) => e.cpf), "L0001").then((map) => {
      setCpfQueue((q) => q.map((e) => (map.has(e.cpf) ? { ...e, known: map.get(e.cpf) ?? null } : e)));
    });
  }

  function addCpfFromText(): number {
    setError(null);
    const lines = cpfInput.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const entries: CpfEntry[] = [];
    let invalid = 0;
    for (const line of lines) {
      const e = parseCpfLine(line);
      if (e) entries.push(e);
      else invalid++;
    }
    if (entries.length === 0) {
      setError(invalid ? `Nenhum CPF válido (${invalid} linha${invalid === 1 ? "" : "s"} ignorada${invalid === 1 ? "" : "s"}).` : "Cole ao menos um CPF.");
      return 0;
    }
    if (invalid) setError(`${invalid} linha${invalid === 1 ? " ignorada" : "s ignoradas"} sem CPF válido.`);
    addCpfEntries(entries);
    setCpfInput("");
    return entries.length;
  }

  async function runPerson(cpf: string, refresh = false): Promise<{ message: string; kind: string } | null> {
    upsertCpf(cpf, (r) => ({ ...(r ?? cpfPlaceholder(cpf)), loading: true, error: null }));
    const res = await fetch("/api/wa/enrichment/person", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document: cpf, refresh }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 409 && body.kind === "repeat") {
      const ok = window.confirm(
        `Este CPF já foi pesquisado ${body.refreshedAt ? `em ${new Date(body.refreshedAt).toLocaleString("pt-BR")}` : "há pouco"}.\n\nConsultar de novo gasta uma nova consulta na Procob. Continuar?`,
      );
      upsertCpf(cpf, (r) => ({ ...(r ?? cpfPlaceholder(cpf)), loading: false }));
      if (!ok) {
        await loadCachedCpf(cpf);
        return null;
      }
      const forced = await fetch("/api/wa/enrichment/person", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: cpf, refresh: true, force: true }),
      });
      const fb = await forced.json().catch(() => ({}));
      if (!forced.ok || !fb.state) {
        const message = fb.error ?? "Falha na consulta";
        upsertCpf(cpf, (r) => ({ ...(r ?? cpfPlaceholder(cpf)), loading: false, error: message }));
        return { message, kind: fb.kind ?? "error" };
      }
      account(fb.lookup);
      upsertCpf(cpf, () => ({ ...fb.state, loading: false, error: null }));
      return null;
    }
    if (!res.ok || !body.state) {
      const message = body.error ?? "Falha na consulta";
      upsertCpf(cpf, (r) => ({ ...(r ?? cpfPlaceholder(cpf)), loading: false, error: message }));
      return { message, kind: body.kind ?? "error" };
    }
    account(body.lookup);
    upsertCpf(cpf, (r) => ({ ...body.state, loading: false, error: null, notice: r?.notice ?? null }));
    return null;
  }

  async function loadCachedCpf(cpf: string) {
    upsertCpf(cpf, (r) => ({ ...(r ?? cpfPlaceholder(cpf)), loading: true, error: null }));
    const res = await fetch(`/api/wa/enrichment/person?document=${cpf}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.state) {
      upsertCpf(cpf, (r) => ({ ...(r ?? cpfPlaceholder(cpf)), loading: false, error: body.error ?? "Nada guardado para este CPF" }));
      return;
    }
    setSession((x) => ({ ...x, sandbox: x.sandbox || body.state.lookup.sandbox }));
    upsertCpf(cpf, () => ({ ...body.state, loading: false, error: null }));
  }

  async function runCpfQueue() {
    if (cpfInput.trim()) addCpfFromText();
    setError(null);
    stopRef.current = false;
    const snapshot = await new Promise<CpfEntry[]>((resolve) => setCpfQueue((q) => (resolve(q), q)));
    const done = new Set(cpfResults.filter((r) => !r.error && !r.loading && r.lookup.refreshedAt).map((r) => r.cpf));
    const todo = snapshot.filter((e) => !done.has(e.cpf));
    if (todo.length === 0) {
      setError(snapshot.length ? "Todos os CPFs da fila já foram consultados nesta sessão." : "A fila está vazia.");
      return;
    }
    setCpfRunning({ done: 0, total: todo.length });
    for (let i = 0; i < todo.length; i++) {
      if (stopRef.current) break;
      if (todo[i].known?.known) {
        await loadCachedCpf(todo[i].cpf);
        setCpfRunning({ done: i + 1, total: todo.length });
        continue;
      }
      const failure = await runPerson(todo[i].cpf);
      setCpfRunning({ done: i + 1, total: todo.length });
      if (failure && ["auth", "credit", "config"].includes(failure.kind)) {
        setError(`Consulta interrompida: ${failure.message}`);
        break;
      }
    }
    setCpfRunning(null);
    loadRecent();
  }

  async function fetchCpfParticipations(cpf: string) {
    patchCpf(cpf, { participationsLoading: true, error: null });
    const res = await fetch("/api/wa/enrichment/qsa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document: cpf }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      patchCpf(cpf, { participationsLoading: false, error: body.error ?? "Falha na consulta" });
      return;
    }
    account(body.lookup);
    patchCpf(cpf, {
      participationsLoading: false,
      participations: body.participations ?? [],
      participationsLookup: body.lookup ?? null,
    });
  }

  async function saveCpfContact(r: CpfUi, c: PartnerContactRow) {
    if (!r.partnerId || !c.e164) return;
    const email = r.contacts.find((x) => x.kind === "email" && x.preferred)?.value ?? r.contacts.find((x) => x.kind === "email")?.value ?? null;
    const res = await fetch("/api/wa/enrichment/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partnerId: r.partnerId, targetId: null, phone: c.e164, email }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      patchCpf(r.cpf, { error: body.error ?? "Falha ao salvar o contato" });
      return;
    }
    patchCpf(r.cpf, {
      error: null,
      notice: "Contato salvo. Ligue a uma empresa abaixo para ele entrar na fila de campanha.",
      contacts: r.contacts.map((x) => (x.id === c.id ? { ...x, contactId: body.contactId } : x)),
    });
  }

  async function addCpfTarget(r: CpfUi, part: NonNullable<CpfState["participations"]>[number]) {
    const res = await fetch("/api/wa/enrichment/target", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cnpj: part.cnpj, name: part.name, partnerId: r.partnerId, condition: part.condition }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      patchCpf(r.cpf, { error: body.error ?? "Falha ao criar o alvo" });
      return;
    }
    patchCpf(r.cpf, {
      error: null,
      participations: (r.participations ?? []).map((x) =>
        x.cnpj === part.cnpj ? { ...x, targetId: body.targetId, targetStatus: body.status, isClient: body.isClient } : x,
      ),
    });
  }

  async function testCredentials() {
    setTest({ loading: true });
    const res = await fetch("/api/wa/enrichment/test");
    const body = await res.json().catch(() => ({}));
    setTest({ loading: false, ok: Boolean(body.ok), message: body.message ?? (res.ok ? "" : "Falha") });
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      setTimeout(() => setCopied(null), 1200);
    } catch {
      /* sem clipboard */
    }
  }

  const ownerOf = (cnpj: string) => {
    const e = queue.find((q) => q.cnpj === cnpj);
    return { name: e?.ownerName ?? ownerName, cpf: e?.ownerCpf ?? ownerCpf };
  };

  const doneSet = new Set(results.filter((r) => !r.error && !r.loading && r.lookup.refreshedAt).map((r) => r.cnpj));
  const textCount = input.split(/\n+/).filter((l) => parseLine(l.trim())).length;
  const queuePending = queue.filter((e) => !doneSet.has(e.cnpj));
  const queueKnown = queuePending.filter((e) => e.known?.known).length;
  const pendingInQueue = queuePending.length + textCount;
  const queueToPay = pendingInQueue - queueKnown;
  const originCount = (o: Entry["origin"]) => queue.filter((e) => e.origin === o).length;
  const cpfDone = new Set(cpfResults.filter((r) => !r.error && !r.loading && r.lookup.refreshedAt).map((r) => r.cpf));
  const cpfTextCount = cpfInput.split(/\n+/).filter((l) => parseCpfLine(l.trim())).length;
  const cpfQueuePending = cpfQueue.filter((e) => !cpfDone.has(e.cpf));
  const cpfKnown = cpfQueuePending.filter((e) => e.known?.known).length;
  const cpfPending = cpfQueuePending.length + cpfTextCount;
  const cpfToPay = cpfPending - cpfKnown;
  const testIpBlocked = test?.message && /ip/i.test(test.message);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="brand-kicker">Base</p>
          <h1 className="mt-1 text-2xl font-bold">Enriquecer {mode === "cnpj" ? "por CNPJ" : "por CPF"}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            {mode === "cnpj"
              ? "A Procob devolve os sócios da empresa com CPF completo; para cada sócio você busca celulares e e-mails e escolhe qual vira contato de WhatsApp. Se o CNPJá trouxe nome e dígitos do CPF do dono, a tela marca quem confere."
              : "Quando o CPF já é conhecido, pule o CNPJ: vá direto aos celulares e e-mails do sócio. As empresas dele saem do mesmo grafo, com um clique."}
          </p>
          <div className="mt-3 inline-flex rounded-full border border-line bg-paper p-0.5">
            {(
              [
                ["cnpj", "Por CNPJ", Building2],
                ["cpf", "Por CPF", UserCheck],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => {
                  setMode(id);
                  setError(null);
                }}
                className={clsx(
                  "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition",
                  mode === id ? "pill-active" : "text-muted hover:text-ink-900",
                )}
              >
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/admin/whatsapp/contatos/pesquisas" className="btn-ghost px-3 py-1.5 text-xs">
            <Wallet size={14} /> Pesquisas
          </Link>
          <Link href="/dashboard/admin/whatsapp/contatos" className="btn-ghost px-3 py-1.5 text-xs">
            <Users size={14} /> Voltar aos contatos
          </Link>
        </div>
      </div>

      {/* ── Sessão: custo, saldo, sandbox ─────────────────────── */}
      <div className="rounded-2xl border border-line bg-paper px-4 py-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5 font-semibold">
            <Wallet size={14} className="text-brand-700" /> {session.paid} consulta{session.paid === 1 ? "" : "s"} paga{session.paid === 1 ? "" : "s"} nesta sessão
          </span>
          <span className="text-muted">· {session.cached} do cache (sem custo)</span>
          {session.saldo && <span className="text-muted">· saldo informado pela Procob: <b className="text-ink-900">{session.saldo}</b></span>}
          {(session.sandbox || credentials?.sandbox) && (
            <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">
              <FlaskConical size={12} /> Sandbox — dados fictícios. Defina PROCOB_API_USER/PWD para usar a conta real.
            </span>
          )}
          {credentials && !credentials.sandbox && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">conta {credentials.user}</span>
          )}
          {credentials?.proxy && (
            <span className="rounded-full bg-sky-100 px-2 py-0.5 font-semibold text-sky-700" title={credentials.proxy}>
              via proxy de IP fixo
            </span>
          )}
          <button className="btn-ghost ml-auto px-3 py-1 text-[11px]" onClick={testCredentials} disabled={test?.loading}>
            {test?.loading ? <Loader2 size={12} className="animate-spin" /> : <Plug size={12} />} Testar conexão
          </button>
          {test && !test.loading && (
            <span className={clsx("font-semibold", test.ok ? "text-emerald-700" : "text-red-600")}>
              {test.ok ? "OK" : "Falhou"}
              {test.message ? ` — ${test.message}` : ""}
            </span>
          )}
        </div>
        {testIpBlocked && (
          <p className="mt-2 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-700">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            A conta da Procob é liberada por IP, e o servidor sai por um IP que não está cadastrado (a Vercel troca de IP a cada execução).
            {credentials?.proxy
              ? " O proxy está ativo — confira se os IPs fixos dele já foram cadastrados na Procob."
              : " Instale o Fixie pelo Marketplace da Vercel (ou defina PROCOB_PROXY_URL) e cadastre os IPs fixos do proxy na Procob."}
          </p>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[24rem_1fr]">
        {/* ── Entrada ───────────────────────────────────────── */}
        <div className="space-y-4">
          {mode === "cpf" && (
            <section className="card space-y-3">
              <div>
                <label className="label">CPFs (um por linha — pode vir com o nome)</label>
                <textarea
                  className="input min-h-24 font-mono text-xs"
                  placeholder={"060.242.406-27\n529.982.247-25; Maria da Silva"}
                  value={cpfInput}
                  onChange={(e) => setCpfInput(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn-ghost px-3 py-1.5 text-xs" onClick={addCpfFromText} disabled={!cpfInput.trim()}>
                  <Plus size={13} /> Adicionar à fila
                </button>
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="rounded-2xl border border-line p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">
                    Fila: {cpfQueue.length} CPF{cpfQueue.length === 1 ? "" : "s"}
                    {cpfDone.size > 0 && <span className="font-normal text-muted"> · {cpfDone.size} consultado{cpfDone.size === 1 ? "" : "s"}</span>}
                  </span>
                  {cpfQueue.length > 0 && !cpfRunning && (
                    <button className="text-[11px] font-semibold text-muted hover:text-red-600" onClick={() => setCpfQueue([])}>
                      Limpar
                    </button>
                  )}
                </div>
                <div className="mt-2 flex gap-2">
                  <button className="btn-primary flex-1" onClick={runCpfQueue} disabled={cpfRunning != null || cpfPending === 0}>
                    {cpfRunning ? <Loader2 size={16} className="animate-spin" /> : <Phone size={16} />}
                    {cpfRunning
                      ? `Consultando ${cpfRunning.done}/${cpfRunning.total}…`
                      : `Buscar contatos${cpfPending ? ` (${cpfToPay} consulta${cpfToPay === 1 ? "" : "s"}${cpfKnown ? `, ${cpfKnown} do cache` : ""})` : ""}`}
                  </button>
                  {cpfRunning && (
                    <button className="btn-ghost px-3" onClick={() => (stopRef.current = true)} title="Para depois da consulta atual">
                      <Square size={14} /> Parar
                    </button>
                  )}
                </div>
                <p className="mt-2 text-[11px] text-muted">
                  {cpfKnown > 0 ? (
                    <span className="font-semibold text-emerald-700">
                      {cpfKnown} já pesquisado{cpfKnown === 1 ? "" : "s"} antes — {cpfKnown === 1 ? "sai" : "saem"} do cache, sem custo.{" "}
                    </span>
                  ) : null}
                  As empresas do sócio são outra consulta, sob demanda.{" "}
                  <Link href="/dashboard/admin/whatsapp/contatos/pesquisas" className="text-brand-700 hover:underline">
                    Ver todas as pesquisas
                  </Link>
                </p>
              </div>
            </section>
          )}

          {mode === "cnpj" && (
          <section className="card space-y-3">
            <div>
              <label className="label">CNPJs (um por linha — pode vir com nome e CPF do dono)</label>
              <textarea
                className="input min-h-24 font-mono text-xs"
                placeholder={"12.345.678/0001-90\n98.765.432/0001-10; João da Silva; ***.123.456-**"}
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Nome do dono (CNPJá)</label>
                <input className="input" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="opcional" />
              </div>
              <div>
                <label className="label">Dígitos do CPF (CNPJá)</label>
                <input className="input" value={ownerCpf} onChange={(e) => setOwnerCpf(e.target.value)} placeholder="***.123.456-**" />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button className="btn-ghost px-3 py-1.5 text-xs" onClick={addFromText} disabled={!input.trim()}>
                <Plus size={13} /> Adicionar à fila
              </button>
              <label className="btn-ghost cursor-pointer px-3 py-1.5 text-xs">
                <FileUp size={13} /> Importar CSV
                <input
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) importCsv(f);
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                className="btn-ghost px-3 py-1.5 text-xs"
                onClick={loadPending}
                disabled={!pending || pending.loading || pending.total === 0}
                title="Alvos importados que ainda não têm telefone"
              >
                {pending?.loading ? <Loader2 size={13} className="animate-spin" /> : <Target size={13} />}
                Alvos sem telefone{pending ? ` (${pending.total})` : ""}
              </button>
            </div>

            {csv && (
              <div className="space-y-2 rounded-2xl border border-line bg-canvas p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold">
                  <FileUp size={13} className="text-brand-700" /> {csv.file}
                  <span className="font-normal text-muted">· {csv.rows.length} linha{csv.rows.length === 1 ? "" : "s"}</span>
                </p>
                {(
                  [
                    ["cnpjCol", "Coluna do CNPJ"],
                    ["nameCol", "Nome do sócio/dono"],
                    ["cpfCol", "CPF do sócio (pode ser mascarado)"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="grid grid-cols-[9rem_1fr] items-center gap-2 text-xs">
                    <span className="text-muted">{label}</span>
                    <select className="input py-1.5 text-xs" value={csv[key]} onChange={(e) => setCsv({ ...csv, [key]: e.target.value })}>
                      {key !== "cnpjCol" && <option value="">— não tem —</option>}
                      {csv.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
                {(() => {
                  const n = csvEntries(csv).length;
                  return (
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-[11px] text-muted">
                        {n} CNPJ{n === 1 ? "" : "s"} válido{n === 1 ? "" : "s"}
                        {n < csv.rows.length ? ` · ${csv.rows.length - n} linha${csv.rows.length - n === 1 ? "" : "s"} sem CNPJ válido` : ""}
                      </span>
                      <span className="flex gap-1.5">
                        <button className="btn-ghost px-2.5 py-1 text-[11px]" onClick={() => setCsv(null)}>
                          Cancelar
                        </button>
                        <button
                          className="btn-dark px-2.5 py-1 text-[11px]"
                          disabled={n === 0}
                          onClick={() => {
                            addEntries(csvEntries(csv));
                            setCsv(null);
                          }}
                        >
                          <Plus size={11} /> Adicionar {n} à fila
                        </button>
                      </span>
                    </div>
                  );
                })()}
              </div>
            )}

            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="rounded-2xl border border-line p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">
                  Fila: {queue.length} CNPJ{queue.length === 1 ? "" : "s"}
                  {queue.length > 0 && (
                    <span className="font-normal text-muted">
                      {" "}· {doneSet.size > 0 ? `${queue.filter((e) => doneSet.has(e.cnpj)).length} consultados · ` : ""}
                      {[
                        originCount("texto") ? `${originCount("texto")} colados` : null,
                        originCount("csv") ? `${originCount("csv")} do CSV` : null,
                        originCount("alvos") ? `${originCount("alvos")} da base` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                </span>
                {queue.length > 0 && !running && (
                  <button className="text-[11px] font-semibold text-muted hover:text-red-600" onClick={() => setQueue([])}>
                    Limpar
                  </button>
                )}
              </div>
              <div className="mt-2 flex gap-2">
                <button className="btn-primary flex-1" onClick={runQueue} disabled={running != null || pendingInQueue === 0}>
                  {running ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                  {running
                    ? `Consultando ${running.done}/${running.total}…`
                    : `Buscar sócios${pendingInQueue ? ` (${queueToPay} consulta${queueToPay === 1 ? "" : "s"}${queueKnown ? `, ${queueKnown} do cache` : ""})` : ""}`}
                </button>
                {running && (
                  <button className="btn-ghost px-3" onClick={() => (stopRef.current = true)} title="Para depois da consulta atual">
                    <Square size={14} /> Parar
                  </button>
                )}
              </div>
              <p className="mt-2 text-[11px] text-muted">
                {queueKnown > 0 ? (
                  <span className="font-semibold text-emerald-700">
                    {queueKnown} já pesquisado{queueKnown === 1 ? "" : "s"} antes — {queueKnown === 1 ? "sai" : "saem"} do cache, sem custo.{" "}
                  </span>
                ) : null}
                Cada sócio consultado depois é mais uma consulta.{" "}
                <Link href="/dashboard/admin/whatsapp/contatos/pesquisas" className="text-brand-700 hover:underline">
                  Ver todas as pesquisas
                </Link>
              </p>
            </div>
          </section>
          )}

          <section className="card p-0">
            <div className="flex items-center justify-between px-4 py-3">
              <h2 className="text-sm font-bold">Consultados recentemente</h2>
              <button className="rounded-full p-1.5 text-muted hover:bg-canvas" onClick={loadRecent} title="Atualizar">
                <RefreshCw size={13} />
              </button>
            </div>
            {mode === "cpf" ? (
              recentPeople.length === 0 ? (
                <p className="border-t border-line px-4 py-4 text-xs text-muted">Nenhum CPF consultado ainda.</p>
              ) : (
                <ul className="max-h-96 divide-y divide-line overflow-y-auto border-t border-line">
                  {recentPeople.map((r) => (
                    <li key={r.cpf}>
                      <button className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-canvas" onClick={() => loadCachedCpf(r.cpf)}>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{r.name ?? formatCpf(r.cpf)}</span>
                          <span className="block text-[11px] text-muted">
                            {formatCpf(r.cpf)} ·{" "}
                            {r.found ? `${r.phones} celular${r.phones === 1 ? "" : "es"} · ${r.emails} e-mail${r.emails === 1 ? "" : "s"}` : "sem registro"} ·{" "}
                            {timeAgo(r.refreshedAt)}
                            {r.sandbox ? " · sandbox" : ""}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : recent.length === 0 ? (
              <p className="border-t border-line px-4 py-4 text-xs text-muted">Nenhum CNPJ consultado ainda.</p>
            ) : (
              <ul className="max-h-96 divide-y divide-line overflow-y-auto border-t border-line">
                {recent.map((r) => (
                  <li key={r.cnpj}>
                    <button className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-canvas" onClick={() => loadCached(r.cnpj)}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{r.name ?? formatCnpj(r.cnpj)}</span>
                        <span className="block text-[11px] text-muted">
                          {formatCnpj(r.cnpj)} · {r.found ? `${r.partners} sócio${r.partners === 1 ? "" : "s"}` : "sem registro"} · {timeAgo(r.refreshedAt)}
                          {r.sandbox ? " · sandbox" : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* ── Resultados ────────────────────────────────────── */}
        <div className="space-y-4">
          {mode === "cpf" && cpfResults.length === 0 && (
            <div className="card flex flex-col items-center justify-center py-16 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-canvas text-muted">
                <UserCheck size={24} />
              </span>
              <p className="mt-4 font-semibold">Nenhum CPF consultado nesta sessão</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
                Cole os CPFs ao lado e busque os contatos. Se o CPF já foi consultado antes — aqui ou pelo caminho do
                CNPJ — a resposta sai do cache, sem custo.
              </p>
            </div>
          )}

          {mode === "cpf" &&
            cpfResults.map((r) => (
              <PersonCard
                key={r.cpf}
                r={r}
                queueName={cpfQueue.find((q) => q.cpf === r.cpf)?.name ?? null}
                copied={copied}
                onCopy={copy}
                onRefresh={() => runPerson(r.cpf, true)}
                onFetchParticipations={() => fetchCpfParticipations(r.cpf)}
                onSaveContact={(c) => saveCpfContact(r, c)}
                onAddTarget={(part) => addCpfTarget(r, part)}
              />
            ))}

          {mode === "cnpj" && results.length === 0 && (
            <div className="card flex flex-col items-center justify-center py-16 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-canvas text-muted">
                <Network size={24} />
              </span>
              <p className="mt-4 font-semibold">Nenhum CNPJ consultado nesta sessão</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
                Cole CNPJs, importe o CSV do CNPJá ou puxe os alvos sem telefone — e busque os sócios. Reabrir um
                CNPJ recente não custa nada.
              </p>
            </div>
          )}

          {mode === "cnpj" && results.map((r) => {
            const owner = ownerOf(r.cnpj);
            return (
              <ResultCard
                key={r.cnpj}
                r={r}
                ownerName={owner.name}
                ownerCpf={owner.cpf}
                copied={copied}
                onCopy={copy}
                onRefresh={() => runQsa(r.cnpj, true)}
                onToggle={(p) => patchPartner(r.cnpj, p.document, { expanded: !p.expanded })}
                onSelect={(p, v) => patchPartner(r.cnpj, p.document, { selected: v })}
                onFetchPerson={(p, refresh) => fetchPerson(r.cnpj, p, refresh)}
                onFetchSelected={() => fetchSelected(r)}
                onFetchParticipations={(p) => fetchParticipations(r.cnpj, p)}
                onSaveContact={(p, c) => saveContact(r, p, c)}
                onAddTarget={(p, part) => addTarget(r, p, part)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Cartão do modo "por CPF": a pessoa, seus contatos e as empresas dela.
function PersonCard({
  r,
  queueName,
  copied,
  onCopy,
  onRefresh,
  onFetchParticipations,
  onSaveContact,
  onAddTarget,
}: {
  r: CpfUi;
  queueName: string | null;
  copied: string | null;
  onCopy: (v: string) => void;
  onRefresh: () => void;
  onFetchParticipations: () => void;
  onSaveContact: (c: PartnerContactRow) => void;
  onAddTarget: (part: NonNullable<CpfState["participations"]>[number]) => void;
}) {
  const phones = r.contacts.filter((c) => c.kind !== "email");
  const emails = r.contacts.filter((c) => c.kind === "email");
  const saved = phones.filter((c) => c.contactId).length;
  const name = r.person?.name ?? r.partnerName ?? queueName;

  return (
    <section className="card p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-700">
            {initials(name, "#")}
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-bold">{name ?? formatCpf(r.cpf)}</p>
            <p className="text-xs text-muted">
              {formatCpf(r.cpf)}
              {r.person?.age ? ` · ${r.person.age} anos` : ""}
              {r.person?.uf ? ` · ${r.person.uf}` : ""}
              {r.person?.status ? ` · ${r.person.status.toLowerCase()}` : ""}
              {r.lookup.refreshedAt ? ` · consultado ${timeAgo(r.lookup.refreshedAt)}${r.lookup.cached ? " (cache)" : ""}` : ""}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {r.found && (
                <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-semibold text-ink-800">
                  {phones.filter((c) => isMobile(c.e164)).length} celular{phones.filter((c) => isMobile(c.e164)).length === 1 ? "" : "es"} · {emails.length} e-mail
                  {emails.length === 1 ? "" : "s"}
                  {saved > 0 ? ` · ${saved} salvo${saved === 1 ? "" : "s"}` : ""}
                </span>
              )}
              {r.person?.deceased && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-600">óbito</span>}
              {r.lookup.sandbox && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">sandbox</span>}
            </div>
          </div>
        </div>
        {r.lookup.refreshedAt && (
          <button className="btn-ghost px-3 py-1.5 text-xs" onClick={onRefresh} disabled={r.loading} title="Consultar de novo na Procob (1 consulta)">
            <RefreshCw size={13} className={clsx(r.loading && "animate-spin")} /> Reconsultar
          </button>
        )}
      </div>

      {r.found && r.lookup.note && (
        <p className="flex items-start gap-2 border-t border-line bg-amber-50 px-5 py-2 text-[11px] text-amber-700">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {r.lookup.note}
        </p>
      )}
      {r.loading && !r.found && <p className="border-t border-line px-5 py-4 text-sm text-muted">Consultando telefones e e-mails…</p>}
      {r.error && <p className="border-t border-line px-5 py-3 text-sm text-red-600">{r.error}</p>}
      {r.notice && <p className="border-t border-line px-5 py-2 text-xs text-emerald-700">{r.notice}</p>}
      {!r.loading && !r.error && !r.found && (
        <p className="border-t border-line px-5 py-4 text-sm text-muted">
          {r.lookup.note ?? r.lookup.message ?? "A Procob não encontrou registros para este CPF."}
        </p>
      )}

      {r.found && (
        <>
          <div className="grid gap-4 border-t border-line px-5 py-4 md:grid-cols-[1fr_1fr]">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">Telefones</p>
              {phones.length === 0 ? (
                <p className="mt-1 text-xs text-muted">Nenhum telefone encontrado.</p>
              ) : (
                <ul className="mt-1.5 space-y-1.5">
                  {phones.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2 text-xs">
                      <span className={clsx("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", isMobile(c.e164) ? "bg-brand-100 text-brand-700" : "bg-ink-100 text-ink-800")}>
                        {isMobile(c.e164) ? "celular" : KIND_LABEL[c.kind]}
                      </span>
                      <span className="font-semibold">{c.e164 ? formatPhoneBr(c.e164) : c.value}</span>
                      {c.preferred && <Star size={12} className="text-amber-700" fill="currentColor" aria-label="preferencial" />}
                      <span className="min-w-0 flex-1 truncate text-muted">
                        {c.operator ?? ""}
                        {c.score != null ? ` · pont. ${c.score}` : ""}
                        {c.infoAge ? ` · ${c.infoAge}` : ""}
                      </span>
                      {c.contactId ? (
                        <Link href={`/dashboard/admin/whatsapp/contatos?c=${c.contactId}`} className="flex items-center gap-1 font-semibold text-brand-700 hover:underline">
                          <Check size={12} /> contato
                        </Link>
                      ) : isMobile(c.e164) ? (
                        <button className="btn-dark px-2.5 py-1 text-[11px]" onClick={() => onSaveContact(c)}>
                          <MessageCircle size={11} /> Salvar como contato
                        </button>
                      ) : (
                        <span className="text-[10px] text-muted">{c.e164 ? "fixo — sem WhatsApp" : "número inválido"}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">E-mails</p>
                {emails.length === 0 ? (
                  <p className="mt-1 text-xs text-muted">Nenhum e-mail encontrado.</p>
                ) : (
                  <ul className="mt-1.5 space-y-1.5">
                    {emails.map((c) => (
                      <li key={c.id} className="flex items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2 text-xs">
                        <Mail size={12} className="shrink-0 text-muted" />
                        <span className="min-w-0 flex-1 truncate font-medium">{c.value}</span>
                        {c.preferred && <Star size={12} className="text-amber-700" fill="currentColor" />}
                        {c.score != null && <span className="text-muted">pont. {c.score}</span>}
                        <button className="rounded-full p-1 text-muted hover:bg-canvas" onClick={() => onCopy(c.value)} title="Copiar">
                          {copied === c.value ? <Check size={12} className="text-emerald-700" /> : <Copy size={12} />}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <p className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
                  Empresas do sócio
                  <button className="btn-ghost px-2 py-0.5 text-[10px] normal-case tracking-normal" onClick={onFetchParticipations} disabled={r.participationsLoading}>
                    {r.participationsLoading ? <Loader2 size={11} className="animate-spin" /> : <Network size={11} />}
                    {r.participations ? "Atualizar" : `Buscar${r.person?.participations != null ? ` (${r.person.participations})` : ""}`}
                  </button>
                </p>
                {r.participations == null ? (
                  <p className="mt-1 text-xs text-muted">
                    {r.person?.participations != null
                      ? `A Procob aponta ${r.person.participations} participação${r.person.participations === 1 ? "" : "ões"}. Buscar custa 1 consulta.`
                      : "Buscar custa 1 consulta."}
                  </p>
                ) : r.participations.length === 0 ? (
                  <p className="mt-1 text-xs text-muted">Nenhuma empresa encontrada para este CPF.</p>
                ) : (
                  <ul className="mt-1.5 space-y-1.5">
                    {r.participations.map((part) => (
                      <li key={part.cnpj} className={clsx("flex items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2 text-xs", !part.active && "opacity-60")}>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{part.name}</span>
                          <span className="block text-[10px] text-muted">
                            {formatCnpj(part.cnpj)}
                            {part.condition ? ` · ${part.condition.toLowerCase()}` : ""}
                            {part.status ? ` · ${part.status.toLowerCase()}` : ""}
                          </span>
                        </span>
                        {part.isClient ? (
                          <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">já é cliente</span>
                        ) : part.targetId ? (
                          <span className="rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-800">
                            alvo · {TARGET_STATUS[part.targetStatus ?? ""] ?? part.targetStatus}
                          </span>
                        ) : part.active ? (
                          <button className="btn-ghost px-2 py-0.5 text-[10px]" onClick={() => onAddTarget(part)} disabled={!r.partnerId}>
                            <Plus size={10} /> Virar alvo
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          <p className="flex items-start gap-2 border-t border-line px-5 py-3 text-[11px] text-muted">
            <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-700" />
            Dado pessoal obtido de bureau: use só para a abordagem comercial prevista na base legal da CNV e respeite opt-out.
            {r.lookup.refreshedAt ? ` Consulta da Procob em ${dateTime(r.lookup.refreshedAt)}.` : ""}
          </p>
        </>
      )}
    </section>
  );
}

function ResultCard({
  r,
  ownerName,
  ownerCpf,
  copied,
  onCopy,
  onRefresh,
  onToggle,
  onSelect,
  onFetchPerson,
  onFetchSelected,
  onFetchParticipations,
  onSaveContact,
  onAddTarget,
}: {
  r: ResultUi;
  ownerName: string;
  ownerCpf: string;
  copied: string | null;
  onCopy: (v: string) => void;
  onRefresh: () => void;
  onToggle: (p: PartnerUi) => void;
  onSelect: (p: PartnerUi, v: boolean) => void;
  onFetchPerson: (p: PartnerUi, refresh?: boolean) => void;
  onFetchSelected: () => void;
  onFetchParticipations: (p: PartnerUi) => void;
  onSaveContact: (p: PartnerUi, c: PartnerContactRow) => void;
  onAddTarget: (p: PartnerUi, part: Participation) => void;
}) {
  const selectedCount = r.partners.filter((p) => p.selected).length;
  const toPay = r.partners.filter((p) => p.selected && !p.personLookup).length;

  return (
    <section className="card p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
            <Building2 size={18} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-bold">
              {r.subject?.name ?? r.target?.legalName ?? formatCnpj(r.cnpj)}
            </p>
            <p className="text-xs text-muted">
              {formatCnpj(r.cnpj)}
              {r.subject?.status ? ` · ${r.subject.status}` : ""}
              {r.lookup.refreshedAt ? ` · consultado ${timeAgo(r.lookup.refreshedAt)}${r.lookup.cached ? " (cache)" : ""}` : ""}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {r.target?.isClient && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-600">já é cliente da CNV — não abordar</span>
              )}
              {r.target && !r.target.isClient && (
                <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-semibold text-ink-800">
                  alvo · {TARGET_STATUS[r.target.status] ?? r.target.status}
                  {r.target.phone ? ` · ${formatPhoneBr(r.target.phone)}` : ""}
                </span>
              )}
              {r.lookup.sandbox && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">sandbox</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {r.found && (
            <button className="btn-ghost px-3 py-1.5 text-xs" onClick={onRefresh} disabled={r.loading} title="Consultar de novo na Procob (1 consulta)">
              <RefreshCw size={13} className={clsx(r.loading && "animate-spin")} /> Reconsultar
            </button>
          )}
        </div>
      </div>

      {r.found && r.lookup.note && (
        <p className="flex items-start gap-2 border-t border-line bg-amber-50 px-5 py-2 text-[11px] text-amber-700">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {r.lookup.note}
        </p>
      )}
      {r.loading && !r.found && <p className="border-t border-line px-5 py-4 text-sm text-muted">Consultando quadro societário…</p>}
      {r.error && <p className="border-t border-line px-5 py-3 text-sm text-red-600">{r.error}</p>}
      {!r.loading && !r.error && !r.found && (
        <p className="border-t border-line px-5 py-4 text-sm text-muted">
          {r.lookup.message || "A Procob não encontrou registros para este CNPJ."}
        </p>
      )}

      {r.found && (
        <>
          <div className="border-t border-line">
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Sócios · {r.partners.length}
              </p>
              <button className="btn-dark px-3 py-1.5 text-xs" onClick={onFetchSelected} disabled={selectedCount === 0 || r.partners.some((p) => p.loading)}>
                <Phone size={13} /> Buscar contatos dos selecionados
                {selectedCount > 0 ? ` (${toPay} consulta${toPay === 1 ? "" : "s"}${toPay < selectedCount ? `, ${selectedCount - toPay} em cache` : ""})` : ""}
              </button>
            </div>

            {r.partners.length === 0 && <p className="px-5 pb-4 text-sm text-muted">A Procob não trouxe sócios para este CNPJ.</p>}

            <ul className="divide-y divide-line border-t border-line">
              {r.partners.map((p) => {
                const cpfOk = p.kind === "PF" && matchesPartialCpf(p.document, ownerCpf);
                const nameOk = namesLookAlike(p.name, ownerName) || namesLookAlike(p.person?.name, ownerName);
                const phones = p.contacts.filter((c) => c.kind !== "email");
                const emails = p.contacts.filter((c) => c.kind === "email");
                const saved = phones.filter((c) => c.contactId).length;
                return (
                  <li key={p.document} className={clsx(!p.active && "opacity-70")}>
                    <div className="flex items-start gap-3 px-5 py-3">
                      <input
                        type="checkbox"
                        className="mt-1.5"
                        checked={p.selected}
                        disabled={p.kind !== "PF"}
                        onChange={(e) => onSelect(p, e.target.checked)}
                        title={p.kind !== "PF" ? "Sócio pessoa jurídica — consulte o CNPJ dele separadamente" : "Incluir na busca de contatos"}
                      />
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-700">
                        {p.kind === "PJ" ? <Building2 size={14} /> : initials(p.name, "#")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <button className="flex w-full items-center gap-2 text-left" onClick={() => onToggle(p)}>
                          <span className="truncate text-sm font-semibold">{p.person?.name ?? p.name}</span>
                          {cpfOk && (
                            <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700" title="Os dígitos do CPF batem com o CNPJá">
                              <UserCheck size={10} /> CPF confere
                            </span>
                          )}
                          {!cpfOk && nameOk && (
                            <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">nome confere</span>
                          )}
                          {!p.active && <span className="shrink-0 rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-800">saiu da sociedade</span>}
                          {p.person?.deceased && <span className="shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">óbito</span>}
                          {p.expanded ? <ChevronUp size={14} className="ml-auto shrink-0 text-muted" /> : <ChevronDown size={14} className="ml-auto shrink-0 text-muted" />}
                        </button>
                        <p className="text-[11px] text-muted">
                          {formatDocument(p.document)}
                          {p.condition ? ` · ${p.condition.toLowerCase()}` : ""}
                          {p.since ? ` · desde ${p.since.slice(0, 4)}` : ""}
                          {p.person?.age ? ` · ${p.person.age} anos` : ""}
                          {p.person?.uf ? ` · ${p.person.uf}` : ""}
                        </p>
                        <p className="mt-1 text-[11px]">
                          {p.personLookup ? (
                            p.personLookup.kind === "ok" ? (
                              <span className="text-ink-800">
                                {phones.filter((c) => isMobile(c.e164)).length} celular{phones.filter((c) => isMobile(c.e164)).length === 1 ? "" : "es"} · {emails.length} e-mail{emails.length === 1 ? "" : "s"}
                                {saved > 0 ? ` · ${saved} salvo${saved === 1 ? "" : "s"} como contato` : ""}
                                <span className="text-muted"> · {timeAgo(p.personLookup.refreshedAt)}</span>
                              </span>
                            ) : (
                              <span className={p.personLookup.kind === "blocked" ? "text-amber-700" : "text-muted"}>
                                {p.personLookup.note ?? p.personLookup.message ?? "Procob sem registro de contatos para este CPF"}
                              </span>
                            )
                          ) : (
                            <span className="text-muted">contatos ainda não consultados</span>
                          )}
                        </p>
                        {p.personLookup?.kind === "ok" && p.personLookup.note && (
                          <p className="mt-1 text-[11px] text-amber-700">{p.personLookup.note}</p>
                        )}
                        {p.notice && <p className="mt-1 text-[11px] text-emerald-700">{p.notice}</p>}
                        {p.error && <p className="mt-1 text-[11px] text-red-600">{p.error}</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {p.kind === "PF" && (
                          <button
                            className={clsx("px-3 py-1.5 text-xs", p.personLookup ? "btn-ghost" : "btn-primary")}
                            onClick={() => onFetchPerson(p, Boolean(p.personLookup))}
                            disabled={p.loading}
                            title={p.personLookup ? "Consultar de novo (1 consulta)" : "Buscar celulares e e-mails (1 consulta)"}
                          >
                            {p.loading ? <Loader2 size={13} className="animate-spin" /> : <Phone size={13} />}
                            {p.personLookup ? "Reconsultar" : "Buscar contatos"}
                          </button>
                        )}
                      </div>
                    </div>

                    {p.expanded && (
                      <div className="grid gap-4 border-t border-line bg-canvas/60 px-5 py-4 md:grid-cols-[1fr_1fr] md:pl-[4.75rem]">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">Telefones</p>
                          {phones.length === 0 ? (
                            <p className="mt-1 text-xs text-muted">{p.personLookup ? "Nenhum telefone encontrado." : "Busque os contatos para ver."}</p>
                          ) : (
                            <ul className="mt-1.5 space-y-1.5">
                              {phones.map((c) => (
                                <li key={c.id} className="flex items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2 text-xs">
                                  <span className={clsx("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", isMobile(c.e164) ? "bg-brand-100 text-brand-700" : "bg-ink-100 text-ink-800")}>
                                    {isMobile(c.e164) ? "celular" : KIND_LABEL[c.kind]}
                                  </span>
                                  <span className="font-semibold">{c.e164 ? formatPhoneBr(c.e164) : c.value}</span>
                                  {c.preferred && <Star size={12} className="text-amber-700" fill="currentColor" aria-label="preferencial" />}
                                  <span className="min-w-0 flex-1 truncate text-muted">
                                    {c.operator ?? ""}
                                    {c.score != null ? ` · pont. ${c.score}` : ""}
                                    {c.infoAge ? ` · ${c.infoAge}` : ""}
                                  </span>
                                  {c.contactId ? (
                                    <Link href={`/dashboard/admin/whatsapp/contatos?c=${c.contactId}`} className="flex items-center gap-1 font-semibold text-brand-700 hover:underline">
                                      <Check size={12} /> contato
                                    </Link>
                                  ) : isMobile(c.e164) ? (
                                    <button className="btn-dark px-2.5 py-1 text-[11px]" onClick={() => onSaveContact(p, c)}>
                                      <MessageCircle size={11} /> Salvar como contato
                                    </button>
                                  ) : (
                                    <span className="text-[10px] text-muted">{c.e164 ? "fixo — sem WhatsApp" : "número inválido"}</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div className="space-y-4">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">E-mails</p>
                            {emails.length === 0 ? (
                              <p className="mt-1 text-xs text-muted">{p.personLookup ? "Nenhum e-mail encontrado." : "—"}</p>
                            ) : (
                              <ul className="mt-1.5 space-y-1.5">
                                {emails.map((c) => (
                                  <li key={c.id} className="flex items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2 text-xs">
                                    <Mail size={12} className="shrink-0 text-muted" />
                                    <span className="min-w-0 flex-1 truncate font-medium">{c.value}</span>
                                    {c.preferred && <Star size={12} className="text-amber-700" fill="currentColor" />}
                                    {c.score != null && <span className="text-muted">pont. {c.score}</span>}
                                    <button className="rounded-full p-1 text-muted hover:bg-canvas" onClick={() => onCopy(c.value)} title="Copiar">
                                      {copied === c.value ? <Check size={12} className="text-emerald-700" /> : <Copy size={12} />}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <div>
                            <p className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
                              Outras empresas do sócio
                              {p.kind === "PF" && (
                                <button className="btn-ghost px-2 py-0.5 text-[10px] normal-case tracking-normal" onClick={() => onFetchParticipations(p)} disabled={p.participationsLoading}>
                                  {p.participationsLoading ? <Loader2 size={11} className="animate-spin" /> : <Network size={11} />}
                                  {p.participationsList ? "Atualizar" : `Buscar${p.person?.participations != null ? ` (${p.person.participations})` : ""}`}
                                </button>
                              )}
                            </p>
                            {p.participationsList == null ? (
                              <p className="mt-1 text-xs text-muted">
                                {p.person?.participations != null
                                  ? `A Procob aponta ${p.person.participations} participação${p.person.participations === 1 ? "" : "ões"}. Buscar custa 1 consulta.`
                                  : "Buscar custa 1 consulta."}
                              </p>
                            ) : p.participationsList.length === 0 ? (
                              <p className="mt-1 text-xs text-muted">Nenhuma outra empresa.</p>
                            ) : (
                              <ul className="mt-1.5 space-y-1.5">
                                {p.participationsList.map((part) => (
                                  <li key={part.cnpj} className={clsx("flex items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2 text-xs", !part.active && "opacity-60")}>
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate font-medium">{part.name}</span>
                                      <span className="block text-[10px] text-muted">
                                        {formatCnpj(part.cnpj)}
                                        {part.condition ? ` · ${part.condition.toLowerCase()}` : ""}
                                        {part.status ? ` · ${part.status.toLowerCase()}` : ""}
                                      </span>
                                    </span>
                                    {part.cnpj === r.cnpj ? (
                                      <span className="text-[10px] text-muted">esta empresa</span>
                                    ) : part.isClient ? (
                                      <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">já é cliente</span>
                                    ) : part.targetId ? (
                                      <span className="rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-800">alvo · {TARGET_STATUS[part.targetStatus ?? ""] ?? part.targetStatus}</span>
                                    ) : part.active ? (
                                      <button className="btn-ghost px-2 py-0.5 text-[10px]" onClick={() => onAddTarget(p, part)} disabled={!p.partnerId}>
                                        <Plus size={10} /> Virar alvo
                                      </button>
                                    ) : null}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {r.deceasedPartners.length > 0 && (
            <div className="border-t border-line bg-canvas/60">
              <div className="flex items-center gap-2 px-5 py-2.5">
                <AlertTriangle size={13} className="shrink-0 text-red-600" />
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Titulares falecidos · {r.deceasedPartners.length}
                </p>
                <span className="text-[11px] text-muted">fora da lista de sócios e das campanhas</span>
              </div>
              <ul className="divide-y divide-line border-t border-line">
                {r.deceasedPartners.map((p) => (
                  <li key={p.document} className="flex items-start gap-3 px-5 py-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-[10px] font-bold text-red-600">
                      {initials(p.person?.name ?? p.name, "#")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink-800">{p.person?.name ?? p.name}</p>
                      <p className="text-[11px] text-muted">
                        {formatDocument(p.document)}
                        {p.condition ? ` · ${p.condition.toLowerCase()}` : ""}
                        {p.since ? ` · desde ${p.since.slice(0, 4)}` : ""}
                        {p.status ? ` · ${p.status.toLowerCase()}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-600">óbito</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {r.participations.length > 0 && (
            <div className="border-t border-line px-5 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">Este CNPJ participa de</p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {r.participations.map((p) => (
                  <li key={p.cnpj} className={clsx("rounded-full border border-line px-2 py-0.5 text-[11px]", !p.active && "opacity-60")} title={formatCnpj(p.cnpj)}>
                    {p.name}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="flex items-start gap-2 border-t border-line px-5 py-3 text-[11px] text-muted">
            <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-700" />
            Dado pessoal obtido de bureau: use só para a abordagem comercial prevista na base legal da CNV e respeite opt-out.
            {r.lookup.refreshedAt ? ` Consulta da Procob em ${dateTime(r.lookup.refreshedAt)}.` : ""}
          </p>
        </>
      )}
    </section>
  );
}
