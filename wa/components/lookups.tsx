"use client";

// Pesquisas: tudo que já foi consultado na Procob — por CNPJ (quadro
// societário) ou por CPF (telefones e e-mails) — com busca por nome, telefone
// ou e-mail. É também a garantia visível de que nada é consultado duas vezes:
// o que está aqui sai do cache, sem custo.

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import clsx from "clsx";
import {
  AlertTriangle,
  Building2,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  Loader2,
  Mail,
  MessageCircle,
  Network,
  Phone,
  RefreshCw,
  Search,
  Star,
  UserCheck,
  Users,
  UserX,
  Wallet,
  X,
} from "lucide-react";
import { formatCnpj, formatCpf } from "@wa/lib/documento";
import { formatPhoneBr } from "@wa/lib/phone";
import { dateTime, formatNumber, initials, timeAgo } from "@wa/lib/stages";
import type { CnpjState, CpfState, PartnerContactRow } from "@wa/lib/enrichment";

type Row = {
  id: string;
  document: string;
  code: string;
  found: boolean;
  message: string | null;
  name: string | null;
  phones: string[];
  emails: string[];
  summary: Record<string, unknown> | null;
  sandbox: boolean;
  refreshedAt: string;
  requestedBy: string | null;
};

/** Sócio que a Procob acusou como falecido. Sai da lista de sócios e das
 *  campanhas; esta aba é onde ele continua visível. */
type DeceasedRow = {
  id: string;
  document: string;
  name: string;
  enrichedAt: string | null;
  companies: Array<{ cnpj: string; legalName: string | null; role: string | null; active: boolean }>;
};

type Kind = "cnpj" | "cpf" | "obito";
type Counts = { cnpj: number; cpf: number; obito: number };

type Data =
  | { kind: "cnpj" | "cpf"; total: number; counts: Counts; indexed: number; rows: Row[] }
  | { kind: "obito"; total: number; counts: Counts; indexed: number; rows: DeceasedRow[] };

function summaryText(kind: Kind, s: Record<string, unknown> | null): string {
  if (!s) return "";
  const n = (k: string) => (typeof s[k] === "number" ? (s[k] as number) : null);
  if (kind === "cnpj") {
    const socios = n("socios");
    const part = n("participacoes");
    return [
      socios != null ? `${socios} sócio${socios === 1 ? "" : "s"}` : null,
      part ? `${part} participação${part === 1 ? "" : "ões"}` : null,
      typeof s.situacao === "string" ? (s.situacao as string).toLowerCase() : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  const cel = n("celulares");
  const mails = n("emails");
  const part = n("participacoes");
  return [
    cel != null ? `${cel} celular${cel === 1 ? "" : "es"}` : null,
    mails != null ? `${mails} e-mail${mails === 1 ? "" : "s"}` : null,
    part ? `${part} empresa${part === 1 ? "" : "s"}` : null,
    typeof s.uf === "string" ? (s.uf as string) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function Lookups() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Carregando…</p>}>
      <LookupsInner />
    </Suspense>
  );
}

function LookupsInner() {
  const params = useSearchParams();
  const tipo = params?.get("tipo");
  const [kind, setKind] = useState<Kind>(tipo === "cpf" ? "cpf" : tipo === "obito" ? "obito" : "cnpj");
  const [q, setQ] = useState(params?.get("q") ?? "");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [openDoc, setOpenDoc] = useState<string | null>(params?.get("doc") ?? null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({ kind });
      if (q.trim()) sp.set("q", q.trim());
      const res = await fetch(`/api/wa/enrichment/history?${sp.toString()}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Falha ao carregar as pesquisas");
        return;
      }
      setData(body);
      setError(null);
    } finally {
      setLoading(false);
    }
  }, [kind, q]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      setTimeout(() => setCopied(null), 1200);
    } catch {
      /* sem clipboard */
    }
  }

  const rows = data && data.kind !== "obito" ? data.rows : [];
  const deceased = data && data.kind === "obito" ? data.rows : [];
  const shown = data?.rows.length ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="brand-kicker">Base</p>
          <h1 className="mt-1 text-2xl font-bold">Pesquisas</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Tudo que já foi consultado na Procob fica guardado aqui — e é isso que impede pagar duas vezes pelo mesmo
            documento. Reabrir qualquer linha sai do cache, sem custo.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/admin/whatsapp/contatos/enriquecer" className="btn-ghost px-3 py-1.5 text-xs">
            <Search size={14} /> Enriquecer
          </Link>
          <Link href="/dashboard/admin/whatsapp/contatos" className="btn-ghost px-3 py-1.5 text-xs">
            <Users size={14} /> Contatos
          </Link>
        </div>
      </div>

      <section className="card p-0">
        <div className="flex flex-col gap-3 border-b border-line p-3 sm:flex-row sm:items-center">
          <div className="inline-flex shrink-0 rounded-full border border-line bg-paper p-0.5">
            {(
              [
                ["cnpj", "Por CNPJ", Building2],
                ["cpf", "Por CPF", UserCheck],
                ["obito", "Óbito", UserX],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => setKind(id)}
                className={clsx(
                  "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition",
                  kind === id ? "pill-active" : "text-muted hover:text-ink-900",
                )}
                title={id === "obito" ? "Sócios que a Receita marcou como titular falecido" : undefined}
              >
                <Icon size={13} /> {label}
                {data && <span className="opacity-70">{formatNumber(data.counts[id])}</span>}
              </button>
            ))}
          </div>
          <label className="relative min-w-0 flex-1">
            <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              className="input py-2 pl-9"
              placeholder={
                kind === "cpf"
                  ? "Nome, CPF, telefone ou e-mail…"
                  : kind === "obito"
                    ? "Nome ou CPF do falecido…"
                    : "Razão social, CNPJ ou telefone…"
              }
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <button className="btn-ghost shrink-0 px-3 py-2 text-xs" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={clsx(loading && "animate-spin")} /> Atualizar
          </button>
        </div>

        {error && <p className="px-4 py-3 text-sm text-red-600">{error}</p>}

        {loading && shown === 0 ? (
          <p className="p-6 text-sm text-muted">Carregando…</p>
        ) : shown === 0 ? (
          <div className="px-6 py-12 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-canvas text-muted">
              <Wallet size={24} />
            </span>
            <p className="mt-4 font-semibold">
              {q
                ? `Nada encontrado para “${q}”`
                : kind === "obito"
                  ? "Nenhum titular falecido até agora"
                  : "Nenhuma pesquisa ainda"}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
              {q
                ? "Tente outro trecho do nome, o telefone só com números ou o e-mail inteiro."
                : kind === "obito"
                  ? "Quando o quadro societário trouxer um sócio com “titular falecido”, ele sai da lista de sócios e passa a aparecer aqui."
                  : "Consultas feitas em Enriquecer (por CNPJ ou por CPF) aparecem aqui, com o que cada uma trouxe."}
            </p>
          </div>
        ) : data?.kind === "obito" ? (
          <>
            <p className="flex items-start gap-2 border-b border-line bg-canvas/60 px-4 py-2.5 text-[11px] text-muted">
              <AlertTriangle size={13} className="mt-0.5 shrink-0 text-red-600" />
              Titular falecido segundo a Receita (o CPF fica inabilitado e o quadro societário devolve isso). Estes sócios
              não entram na lista de sócios nem em campanha — o telefone costuma ser de um familiar.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Pessoa</th>
                    <th className="px-3 py-2 font-semibold">No quadro societário de</th>
                    <th className="px-3 py-2 font-semibold">Contatos</th>
                  </tr>
                </thead>
                <tbody>
                  {deceased.map((r) => (
                    <tr key={r.id} className="border-t border-line align-top">
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-2">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-[10px] font-bold text-red-600">
                            {initials(r.name, "#")}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">{r.name}</span>
                            <span className="block text-xs text-muted">{r.document ? formatCpf(r.document) : "sem CPF"}</span>
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        {r.companies.length === 0 ? (
                          <span className="text-muted">—</span>
                        ) : (
                          <ul className="space-y-0.5">
                            {r.companies.map((c) => (
                              <li key={c.cnpj} className={clsx(!c.active && "opacity-60")}>
                                <button
                                  className="text-left hover:underline"
                                  onClick={() => setOpenDoc(c.cnpj)}
                                  title={formatCnpj(c.cnpj)}
                                >
                                  {c.legalName ?? formatCnpj(c.cnpj)}
                                </button>
                                {c.role && <span className="text-muted"> · {c.role.toLowerCase()}</span>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted">
                        {r.enrichedAt ? `consultado ${timeAgo(r.enrichedAt)}` : "contatos não consultados"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">{kind === "cpf" ? "Pessoa" : "Empresa"}</th>
                  <th className="px-3 py-2 font-semibold">O que trouxe</th>
                  {kind === "cpf" && <th className="px-3 py-2 font-semibold">Contatos</th>}
                  <th className="px-3 py-2 font-semibold">Consultada</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setOpenDoc(r.document)}
                    className="cursor-pointer border-t border-line align-top hover:bg-canvas"
                  >
                    <td className="px-4 py-2.5">
                      <span className="block font-semibold">
                        {r.name ?? (r.found ? "—" : "sem registro")}
                        {r.sandbox && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">sandbox</span>}
                      </span>
                      <span className="block text-xs text-muted">
                        {r.document.length === 14 ? formatCnpj(r.document) : formatCpf(r.document)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {r.found ? (
                        <span className="text-ink-800">{summaryText(kind, r.summary) || "—"}</span>
                      ) : (
                        <span className="flex items-start gap-1 text-muted">
                          <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-700" />
                          {r.message ?? "sem registro"}
                        </span>
                      )}
                    </td>
                    {kind === "cpf" && (
                      <td className="px-3 py-2.5 text-xs">
                        {r.phones.length === 0 && r.emails.length === 0 ? (
                          <span className="text-muted">—</span>
                        ) : (
                          <span className="space-y-0.5">
                            {r.phones.slice(0, 2).map((p) => (
                              <span key={p} className="flex items-center gap-1">
                                <Phone size={11} className="shrink-0 text-muted" />
                                {formatPhoneBr(`+55${p}`)}
                              </span>
                            ))}
                            {r.emails.slice(0, 1).map((e) => (
                              <button key={e} className="flex items-center gap-1 hover:underline" onClick={() => copy(e)} title="Copiar">
                                <Mail size={11} className="shrink-0 text-muted" />
                                <span className="max-w-[14rem] truncate">{e}</span>
                                {copied === e ? <Check size={10} className="text-emerald-700" /> : <Copy size={10} className="text-muted" />}
                              </button>
                            ))}
                            {r.phones.length + r.emails.length > 3 && (
                              <span className="text-[11px] text-muted">+{r.phones.length + r.emails.length - 3} outros</span>
                            )}
                          </span>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2.5 text-xs text-muted" title={dateTime(r.refreshedAt)}>
                      {timeAgo(r.refreshedAt)}
                      {r.requestedBy && <span className="block">por {r.requestedBy.split("@")[0]}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right text-muted">
                      <ChevronRight size={16} className="inline" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {openDoc && (
          <LookupDetail
            document={openDoc}
            kind={openDoc.length === 14 ? "cnpj" : "cpf"}
            copied={copied}
            onCopy={copy}
            onClose={() => setOpenDoc(null)}
          />
        )}

        {rows.length > 0 && (
          <p className="border-t border-line px-4 py-2.5 text-[11px] text-muted">
            {formatNumber(rows.length)} de {formatNumber(data?.total ?? rows.length)} pesquisa
            {(data?.total ?? rows.length) === 1 ? "" : "s"}
            {data?.indexed ? ` · ${data.indexed} consultas antigas indexadas agora` : ""} · nenhuma consulta foi feita para
            montar esta lista.
          </p>
        )}
      </section>
    </div>
  );
}

// ── Detalhe: tudo que a consulta trouxe, sem sair da tela ────

/** A Procob às vezes põe celular em "outros"; o nono dígito é quem decide. */
function isMobile(e164: string | null): boolean {
  return Boolean(e164 && /^\+55\d{2}9\d{8}$/.test(e164));
}

const KIND_LABEL: Record<string, string> = {
  celular: "celular",
  comercial: "comercial",
  fixo: "fixo",
  outros: "outro",
  email: "e-mail",
};

function ContactLines({
  contacts,
  copied,
  onCopy,
  onSave,
  saving,
}: {
  contacts: PartnerContactRow[];
  copied: string | null;
  onCopy: (v: string) => void;
  onSave?: (c: PartnerContactRow) => void;
  saving?: string | null;
}) {
  const phones = contacts.filter((c) => c.kind !== "email");
  const emails = contacts.filter((c) => c.kind === "email");
  if (contacts.length === 0) {
    return <p className="text-xs text-muted">Esta consulta não trouxe telefones nem e-mails.</p>;
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">Telefones</p>
        {phones.length === 0 ? (
          <p className="mt-1 text-xs text-muted">—</p>
        ) : (
          <ul className="mt-1.5 space-y-1.5">
            {phones.map((c) => (
              <li key={c.id} className="flex items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2 text-xs">
                <span className={clsx("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", isMobile(c.e164) ? "bg-brand-100 text-brand-700" : "bg-ink-100 text-ink-800")}>
                  {isMobile(c.e164) ? "celular" : (KIND_LABEL[c.kind] ?? c.kind)}
                </span>
                <button className="font-semibold hover:underline" onClick={() => onCopy(c.e164 ? formatPhoneBr(c.e164) : c.value)} title="Copiar">
                  {c.e164 ? formatPhoneBr(c.e164) : c.value}
                </button>
                {c.preferred && <Star size={12} className="text-amber-700" fill="currentColor" aria-label="preferencial" />}
                <span className="min-w-0 flex-1 truncate text-muted">
                  {c.operator ?? ""}
                  {c.score != null ? ` · pont. ${c.score}` : ""}
                </span>
                {c.contactId ? (
                  <Link href={`/dashboard/admin/whatsapp/contatos?c=${c.contactId}`} className="flex shrink-0 items-center gap-1 font-semibold text-brand-700 hover:underline">
                    <Check size={12} /> contato
                  </Link>
                ) : isMobile(c.e164) && onSave ? (
                  <button className="btn-dark shrink-0 px-2.5 py-1 text-[11px]" onClick={() => onSave(c)} disabled={saving === c.id}>
                    {saving === c.id ? <Loader2 size={11} className="animate-spin" /> : <MessageCircle size={11} />} Salvar
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">E-mails</p>
        {emails.length === 0 ? (
          <p className="mt-1 text-xs text-muted">—</p>
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
    </div>
  );
}

function LookupDetail({
  document,
  kind,
  copied,
  onCopy,
  onClose,
}: {
  document: string;
  kind: "cnpj" | "cpf";
  copied: string | null;
  onCopy: (v: string) => void;
  onClose: () => void;
}) {
  const [cpf, setCpf] = useState<CpfState | null>(null);
  const [cnpj, setCnpj] = useState<CnpjState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = kind === "cpf" ? `/api/wa/enrichment/person?document=${document}` : `/api/wa/enrichment?cnpj=${document}`;
      const res = await fetch(url);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Falha ao carregar a consulta");
        return;
      }
      if (kind === "cpf") setCpf(body.state ?? null);
      else setCnpj(body.state ?? null);
    } finally {
      setLoading(false);
    }
  }, [document, kind]);

  useEffect(() => {
    load();
  }, [load]);

  // Esc fecha, como em qualquer modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function saveContact(partnerId: string | null, c: PartnerContactRow, targetId: string | null) {
    if (!partnerId || !c.e164) return;
    setSaving(c.id);
    setNotice(null);
    const res = await fetch("/api/wa/enrichment/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partnerId, targetId, phone: c.e164 }),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(null);
    if (!res.ok) {
      setError(body.error ?? "Falha ao salvar o contato");
      return;
    }
    setNotice("Contato salvo — já aparece em Contatos.");
    await load();
  }

  const subjectName = kind === "cpf" ? (cpf?.person?.name ?? cpf?.partnerName ?? null) : (cnpj?.subject?.name ?? cnpj?.target?.legalName ?? null);
  const refreshedAt = kind === "cpf" ? cpf?.lookup.refreshedAt : cnpj?.lookup.refreshedAt;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-black/50" aria-label="Fechar" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-line bg-paper shadow-2xl sm:rounded-3xl">
        <div className="flex items-start gap-3 border-b border-line p-5">
          <span
            className={clsx(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xs font-bold",
              kind === "cpf" ? "rounded-full bg-sky-100 text-sky-700" : "bg-brand-100 text-brand-700",
            )}
          >
            {kind === "cpf" ? initials(subjectName, "#") : <Building2 size={18} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold">{subjectName ?? (kind === "cpf" ? formatCpf(document) : formatCnpj(document))}</p>
            <p className="text-xs text-muted">
              {kind === "cpf" ? formatCpf(document) : formatCnpj(document)}
              {kind === "cpf" && cpf?.person?.age ? ` · ${cpf.person.age} anos` : ""}
              {kind === "cpf" && cpf?.person?.uf ? ` · ${cpf.person.uf}` : ""}
              {kind === "cnpj" && cnpj?.subject?.status ? ` · ${cnpj.subject.status}` : ""}
              {refreshedAt ? ` · consultado ${timeAgo(refreshedAt)}` : ""}
            </p>
          </div>
          <Link
            href={`/dashboard/admin/whatsapp/contatos/enriquecer?${kind === "cpf" ? "cpf" : "cnpj"}=${document}`}
            className="btn-ghost shrink-0 px-3 py-1.5 text-xs"
            title="Abrir na tela de enriquecimento"
          >
            <ExternalLink size={13} /> Enriquecer
          </Link>
          <button onClick={onClose} className="shrink-0 rounded-full p-2 text-muted hover:bg-canvas" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {loading && <p className="text-sm text-muted">Carregando o que já foi consultado…</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {notice && <p className="text-sm text-emerald-700">{notice}</p>}

          {/* ── CPF ─────────────────────────────────────────── */}
          {!loading && kind === "cpf" && cpf && (
            <>
              {cpf.person?.deceased && (
                <p className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
                  <AlertTriangle size={13} /> Óbito registrado.
                </p>
              )}
              <ContactLines
                contacts={cpf.contacts}
                copied={copied}
                onCopy={onCopy}
                saving={saving}
                onSave={(c) => saveContact(cpf.partnerId, c, null)}
              />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">Empresas do sócio</p>
                {cpf.participations == null ? (
                  <p className="mt-1 text-xs text-muted">
                    Ainda não consultadas.{" "}
                    <Link href={`/dashboard/admin/whatsapp/contatos/enriquecer?cpf=${document}`} className="text-brand-700 hover:underline">
                      Buscar no enriquecimento
                    </Link>{" "}
                    (1 consulta).
                  </p>
                ) : cpf.participations.length === 0 ? (
                  <p className="mt-1 text-xs text-muted">Nenhuma empresa encontrada.</p>
                ) : (
                  <ul className="mt-1.5 space-y-1.5">
                    {cpf.participations.map((part) => (
                      <li key={part.cnpj} className={clsx("flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-xs", !part.active && "opacity-60")}>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{part.name}</span>
                          <span className="block text-[10px] text-muted">
                            {formatCnpj(part.cnpj)}
                            {part.condition ? ` · ${part.condition.toLowerCase()}` : ""}
                          </span>
                        </span>
                        {part.isClient && <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">já é cliente</span>}
                        {part.targetId && !part.isClient && <span className="rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-800">alvo</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          {/* ── CNPJ ────────────────────────────────────────── */}
          {!loading && kind === "cnpj" && cnpj && (
            <>
              {cnpj.target?.isClient && (
                <p className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
                  <AlertTriangle size={13} /> Já é cliente — não abordar.
                </p>
              )}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">Sócios · {cnpj.partners.length}</p>
                {cnpj.partners.length === 0 ? (
                  <p className="mt-1 text-xs text-muted">A Procob não trouxe sócios para este CNPJ.</p>
                ) : (
                  <ul className="mt-2 space-y-3">
                    {cnpj.partners.map((p) => (
                      <li key={p.document} className={clsx("rounded-2xl border border-line p-3", !p.active && "opacity-70")}>
                        <div className="flex items-start gap-2">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[11px] font-bold text-sky-700">
                            {p.kind === "PJ" ? <Building2 size={13} /> : initials(p.person?.name ?? p.name, "#")}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{p.person?.name ?? p.name}</p>
                            <p className="text-[11px] text-muted">
                              {p.document.length === 11 ? formatCpf(p.document) : formatCnpj(p.document)}
                              {p.condition ? ` · ${p.condition.toLowerCase()}` : ""}
                              {!p.active ? " · saiu da sociedade" : ""}
                            </p>
                          </div>
                          {p.kind === "PF" && (
                            <Link
                              href={`/dashboard/admin/whatsapp/contatos/pesquisas?tipo=cpf&doc=${p.document}`}
                              className="shrink-0 text-[11px] font-semibold text-brand-700 hover:underline"
                              title="Ver a consulta deste CPF"
                            >
                              ver CPF
                            </Link>
                          )}
                        </div>
                        <div className="mt-2">
                          {p.personLookup ? (
                            <ContactLines
                              contacts={p.contacts}
                              copied={copied}
                              onCopy={onCopy}
                              saving={saving}
                              onSave={(c) => saveContact(p.partnerId, c, cnpj.target?.id ?? null)}
                            />
                          ) : (
                            <p className="text-xs text-muted">
                              Contatos deste sócio ainda não consultados.{" "}
                              <Link href={`/dashboard/admin/whatsapp/contatos/enriquecer?cnpj=${document}`} className="text-brand-700 hover:underline">
                                Buscar no enriquecimento
                              </Link>{" "}
                              (1 consulta).
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {cnpj.deceasedPartners.length > 0 && (
                <div>
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
                    <UserX size={11} className="text-red-600" /> Titulares falecidos · {cnpj.deceasedPartners.length}
                  </p>
                  <ul className="mt-1.5 space-y-1.5">
                    {cnpj.deceasedPartners.map((p) => (
                      <li key={p.document} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-xs">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-100 text-[10px] font-bold text-red-600">
                          {initials(p.person?.name ?? p.name, "#")}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{p.person?.name ?? p.name}</span>
                          <span className="block text-[10px] text-muted">
                            {formatCpf(p.document)}
                            {p.condition ? ` · ${p.condition.toLowerCase()}` : ""}
                            {p.status ? ` · ${p.status.toLowerCase()}` : ""}
                          </span>
                        </span>
                        <span className="shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">óbito</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {cnpj.participations.length > 0 && (
                <div>
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
                    <Network size={11} /> Este CNPJ participa de
                  </p>
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {cnpj.participations.map((part) => (
                      <li key={part.cnpj} className="rounded-full border border-line px-2 py-0.5 text-[11px]" title={formatCnpj(part.cnpj)}>
                        {part.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {!loading && !error && !cpf && !cnpj && (
            <p className="text-sm text-muted">Nada guardado para este documento.</p>
          )}
        </div>

        <p className="flex items-start gap-2 border-t border-line px-5 py-3 text-[11px] text-muted">
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-700" />
          Dado de bureau: use só para a abordagem comercial prevista na base legal da CNV e respeite opt-out.
          {refreshedAt ? ` Consulta da Procob em ${dateTime(refreshedAt)}.` : ""} Abrir esta ficha não custa nada.
        </p>
      </div>
    </div>
  );
}
