"use client";

// Contatos: quem já trocou mensagem (ou foi abordado) pelo número da CNV.
//
// A ficha à direita responde a pergunta que quem atende faz antes de ligar:
// essa pessoa já tem conta? está no teste grátis? já pagou alguma coisa? — e
// é a mesma verdade que a IA lê, porque sai do banco da zerokm.

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import {
  Ban,
  BadgeCheck,
  Building2,
  CreditCard,
  Loader2,
  Mail,
  Megaphone,
  MessageCircle,
  Pencil,
  Save,
  Search,
  X,
} from "lucide-react";
import { formatPhoneBr } from "@wa/lib/phone";
import { formatDocument } from "@wa/lib/documento";
import {
  STAGE_BY_ID,
  STATUS_LABEL,
  dateTime,
  formatNumber,
  initials,
  isStage,
  money,
  timeAgo,
  type ConversationStatus,
} from "@wa/lib/stages";

type Filtro = "todos" | "cadastrados" | "sem_cadastro" | "optout";

const FILTROS: Array<{ id: Filtro; label: string }> = [
  { id: "todos", label: "Todos" },
  { id: "cadastrados", label: "Com cadastro" },
  { id: "sem_cadastro", label: "Sem cadastro" },
  { id: "optout", label: "Opt-out" },
];

type Row = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  document: string | null;
  company: string | null;
  city: string | null;
  state: string | null;
  source: string;
  optOut: boolean;
  registered: boolean;
  createdAt: string;
  conversation: {
    id: string;
    status: ConversationStatus;
    stage: string;
    lastMessageAt: string | null;
    unread: number;
  } | null;
  campaigns: number;
};

type Dossier = {
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
};

type Detail = {
  contact: Row & { cnae: string | null };
  conversation: {
    id: string;
    status: ConversationStatus;
    stage: string;
    lastMessageAt: string | null;
  } | null;
  dossier: Dossier | null;
};

export function Contacts() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Carregando…</p>}>
      <ContactsInner />
    </Suspense>
  );
}

function ContactsInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [busca, setBusca] = useState(params?.get("q") ?? "");
  const [termo, setTermo] = useState(params?.get("q") ?? "");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [carregando, setCarregando] = useState(true);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<Detail | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // A busca do topo do painel manda pelo `?q=` — respeita o que veio na URL.
  useEffect(() => {
    const q = params?.get("q") ?? "";
    setBusca(q);
    setTermo(q);
  }, [params]);

  // Digitar não pode virar uma requisição por tecla.
  useEffect(() => {
    const t = setTimeout(() => {
      setTermo(busca);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [busca]);

  const load = useCallback(async () => {
    setCarregando(true);
    try {
      const sp = new URLSearchParams({ filtro, page: String(page) });
      if (termo.trim()) sp.set("q", termo.trim());
      const res = await fetch(`/api/wa/contacts?${sp.toString()}`);
      if (!res.ok) {
        setErro("Não foi possível carregar os contatos.");
        return;
      }
      const body = await res.json();
      setRows(body.contacts ?? []);
      setTotal(body.total ?? 0);
      setPageSize(body.pageSize ?? 50);
      setErro(null);
    } finally {
      setCarregando(false);
    }
  }, [filtro, page, termo]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selecionado) {
      setDetalhe(null);
      return;
    }
    fetch(`/api/wa/contacts/${selecionado}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setDetalhe(d))
      .catch(() => {});
  }, [selecionado]);

  const paginas = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="brand-kicker">Base</p>
          <h1 className="mt-1 text-2xl font-bold">Contatos</h1>
          <p className="mt-1 text-sm text-muted">
            {formatNumber(total)} contato{total === 1 ? "" : "s"} — todo mundo que recebeu ou mandou
            mensagem pelo número da CNV.
          </p>
        </div>
        <label className="relative">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            className="input w-72 py-2 pl-9"
            placeholder="Nome, telefone, e-mail, CNPJ…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            onClick={() => {
              setFiltro(f.id);
              setPage(1);
            }}
            className={clsx(
              "rounded-full px-3 py-1.5 text-xs font-semibold transition",
              filtro === f.id ? "pill-active" : "border border-line bg-paper text-muted",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {erro && (
        <p className="rounded-2xl border border-red-300 bg-red-50 px-4 py-2.5 text-xs text-red-600">
          {erro}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="card overflow-hidden p-0">
          {carregando && rows.length === 0 ? (
            <p className="flex items-center gap-2 px-4 py-8 text-sm text-muted">
              <Loader2 size={15} className="animate-spin" /> Carregando…
            </p>
          ) : rows.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted">
              Nenhum contato com esse filtro.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {rows.map((c) => {
                const stage = c.conversation && isStage(c.conversation.stage)
                  ? STAGE_BY_ID[c.conversation.stage]
                  : null;
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => setSelecionado(c.id)}
                      className={clsx(
                        "flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-canvas",
                        selecionado === c.id && "bg-canvas",
                      )}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-100 text-xs font-bold text-ink-800">
                        {initials(c.name, "#")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold">
                            {c.name || formatPhoneBr(c.phone)}
                          </span>
                          {c.registered && (
                            <BadgeCheck size={13} className="shrink-0 text-violet-700" />
                          )}
                          {c.optOut && <Ban size={13} className="shrink-0 text-red-600" />}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {[c.name ? formatPhoneBr(c.phone) : null, c.company, c.city]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </span>
                      </span>
                      <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
                        {stage && (
                          <span
                            className={clsx(
                              "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                              stage.chip,
                            )}
                          >
                            {stage.label}
                          </span>
                        )}
                        {c.campaigns > 0 && (
                          <span
                            className="flex items-center gap-0.5 text-[11px] text-muted"
                            title={`${c.campaigns} disparo(s) recebido(s)`}
                          >
                            <Megaphone size={11} /> {c.campaigns}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted">
                        {timeAgo(c.conversation?.lastMessageAt ?? c.createdAt)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {paginas > 1 && (
            <div className="flex items-center justify-between border-t border-line px-4 py-2 text-xs">
              <button
                className="btn-ghost px-3 py-1 text-xs"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                anterior
              </button>
              <span className="text-muted">
                página {page} de {paginas}
              </span>
              <button
                className="btn-ghost px-3 py-1 text-xs"
                disabled={page >= paginas}
                onClick={() => setPage((p) => p + 1)}
              >
                próxima
              </button>
            </div>
          )}
        </div>

        <Ficha
          detalhe={detalhe}
          selecionado={selecionado}
          onFechar={() => setSelecionado(null)}
          onSalvo={() => {
            load();
            if (selecionado) {
              fetch(`/api/wa/contacts/${selecionado}`)
                .then((r) => (r.ok ? r.json() : null))
                .then((d) => setDetalhe(d))
                .catch(() => {});
            }
          }}
          onAbrirConversa={(id) => router.push(`/dashboard/admin/whatsapp/central?c=${id}`)}
        />
      </div>
    </div>
  );
}

function Ficha({
  detalhe,
  selecionado,
  onFechar,
  onSalvo,
  onAbrirConversa,
}: {
  detalhe: Detail | null;
  selecionado: string | null;
  onFechar: () => void;
  onSalvo: () => void;
  onAbrirConversa: (conversationId: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [email, setEmail] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setEditando(false);
    setErro(null);
    if (detalhe) {
      setNome(detalhe.contact.name ?? "");
      setEmpresa(detalhe.contact.company ?? "");
      setEmail(detalhe.contact.email ?? "");
    }
  }, [detalhe]);

  async function patch(body: Record<string, unknown>) {
    if (!selecionado) return;
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/wa/contacts/${selecionado}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setErro(b.error ?? "Falha ao salvar");
        return;
      }
      setEditando(false);
      onSalvo();
    } finally {
      setSalvando(false);
    }
  }

  if (!selecionado) {
    return (
      <aside className="card hidden h-fit lg:block">
        <p className="text-sm text-muted">
          Selecione um contato para ver a situação dele na CNV: cadastro, teste grátis, assinatura e
          cobranças.
        </p>
      </aside>
    );
  }

  if (!detalhe) {
    return (
      <aside className="card h-fit">
        <p className="flex items-center gap-2 text-sm text-muted">
          <Loader2 size={15} className="animate-spin" /> Carregando ficha…
        </p>
      </aside>
    );
  }

  const c = detalhe.contact;
  const d = detalhe.dossier;

  return (
    <aside className="card h-fit space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-base font-bold">{c.name || formatPhoneBr(c.phone)}</p>
          <p className="truncate text-xs text-muted">{formatPhoneBr(c.phone)}</p>
        </div>
        <button onClick={onFechar} className="rounded-full p-1.5 text-muted hover:bg-canvas">
          <X size={16} />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {detalhe.conversation && (
          <span
            className={clsx(
              "rounded-full px-2 py-0.5 text-[11px] font-semibold",
              STATUS_LABEL[detalhe.conversation.status].cls,
            )}
          >
            {STATUS_LABEL[detalhe.conversation.status].label}
          </span>
        )}
        {c.optOut && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-600">
            opt-out
          </span>
        )}
        <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] text-ink-800">
          origem: {c.source}
        </span>
      </div>

      {erro && <p className="text-xs text-red-600">{erro}</p>}

      {editando ? (
        <div className="space-y-2">
          <div>
            <label className="label">Nome</label>
            <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div>
            <label className="label">Empresa</label>
            <input className="input" value={empresa} onChange={(e) => setEmpresa(e.target.value)} />
          </div>
          <div>
            <label className="label">E-mail</label>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button
              className="btn-primary px-3 py-1.5 text-xs"
              disabled={salvando}
              onClick={() => patch({ name: nome, company: empresa, email })}
            >
              <Save size={14} /> Salvar
            </button>
            <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setEditando(false)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <dl className="space-y-1 text-xs">
          {c.email && (
            <div className="flex items-center gap-2">
              <Mail size={12} className="text-muted" />
              <span className="truncate">{c.email}</span>
            </div>
          )}
          {c.document && (
            <div className="flex items-center gap-2">
              <span className="text-muted">doc</span>
              <span>{formatDocument(c.document)}</span>
            </div>
          )}
          {(c.company || c.city) && (
            <div className="flex items-center gap-2">
              <Building2 size={12} className="text-muted" />
              <span className="truncate">
                {[c.company, c.city && `${c.city}${c.state ? `/${c.state}` : ""}`]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2 text-muted">
            <span>na base desde {dateTime(c.createdAt)}</span>
          </div>
        </dl>
      )}

      {/* ── Situação na CNV ─────────────────────────────────── */}
      <div className="border-t border-line pt-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <BadgeCheck size={13} /> Situação na CNV
        </p>
        {!d?.registered ? (
          <p className="mt-1 text-xs text-muted">Ainda sem cadastro na plataforma.</p>
        ) : (
          <div className="mt-1 space-y-1.5 text-xs">
            <p className="font-semibold text-ink-900">{d.displayName ?? d.email}</p>
            {d.subscriptionActive ? (
              <p className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">
                Assinatura ativa{d.planName ? ` · ${d.planName}` : ""}
              </p>
            ) : d.trialActive ? (
              <p className="inline-block rounded-full bg-violet-100 px-2 py-0.5 font-semibold text-violet-700">
                Teste grátis até {dateTime(d.trialExpiresAt)}
              </p>
            ) : (
              <p className="inline-block rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">
                Cadastrado, sem assinatura
              </p>
            )}
          </div>
        )}
      </div>

      {(d?.payments.length ?? 0) > 0 && (
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            <CreditCard size={13} /> Cobranças
          </p>
          <ul className="mt-1 space-y-1 text-xs">
            {d!.payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2">
                <span className="truncate text-muted">{dateTime(p.createdAt)}</span>
                <span
                  className={clsx(
                    "shrink-0 font-semibold",
                    p.status === "approved" ? "text-emerald-600" : "text-ink-900",
                  )}
                >
                  {money(p.amount)} <span className="font-normal text-muted">{p.status}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        {detalhe.conversation && (
          <button
            className="btn-dark px-3 py-1.5 text-xs"
            onClick={() => onAbrirConversa(detalhe.conversation!.id)}
          >
            <MessageCircle size={14} /> Abrir conversa
          </button>
        )}
        {!editando && (
          <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setEditando(true)}>
            <Pencil size={14} /> Editar
          </button>
        )}
        <button
          className="btn-ghost px-3 py-1.5 text-xs"
          disabled={salvando}
          onClick={() => patch({ optOut: !c.optOut })}
          title={
            c.optOut
              ? "Voltar a permitir mensagens para este número"
              : "Marcar que a pessoa pediu para não receber mensagens"
          }
        >
          <Ban size={14} /> {c.optOut ? "Remover opt-out" : "Marcar opt-out"}
        </button>
      </div>

      {detalhe.conversation && (
        <p className="text-[11px] text-muted">
          Última mensagem {timeAgo(detalhe.conversation.lastMessageAt)} ·{" "}
          <Link href={`/dashboard/admin/whatsapp/pipeline`} className="text-brand-700 hover:underline">
            ver no pipeline
          </Link>
        </p>
      )}
    </aside>
  );
}
