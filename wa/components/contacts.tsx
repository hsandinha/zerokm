"use client";

// Contatos: quem já trocou mensagem (ou foi abordado) pelo número do CNV ou
// da loja, e quem a loja cadastrou à mão ou importou da planilha.
//
// A ficha à direita responde a pergunta que quem atende faz antes de ligar:
// essa pessoa já tem conta? está no teste grátis? já pagou alguma coisa? — e
// é a mesma verdade que a IA lê, porque sai do banco da zerokm. Cadastrar,
// editar e apagar abrem em modal, como os outros cadastros do atendimento.

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import {
  Ban,
  BadgeCheck,
  Building2,
  Cake,
  CreditCard,
  Download,
  FileSpreadsheet,
  Loader2,
  Mail,
  MapPin,
  Megaphone,
  MessageCircle,
  Pencil,
  StickyNote,
  Search,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { formatPhoneBr } from "@wa/lib/phone";
import { formatDocument } from "@wa/lib/documento";
import {
  stageByIdFor,
  corDaColuna,
  STATUS_LABEL,
  dateTime,
  formatNumber,
  initials,
  isStage,
  money,
  timeAgo,
  type ConversationStatus,
} from "@wa/lib/stages";
import { useWaPanel } from "@wa/components/wa-panel";
import {
  MESES,
  ROTULO_DO_TIPO,
  TIPOS_DE_CONTATO,
  formatarAniversario,
  type TipoDeContato,
} from "@wa/lib/contatos";
import { ImportarContatosModal } from "@wa/components/contatos-importar";

type Filtro = "todos" | "cadastrados" | "sem_cadastro" | "optout" | "aniversariantes";

const FILTROS: Array<{ id: Filtro; label: string }> = [
  { id: "todos", label: "Todos" },
  { id: "cadastrados", label: "Com cadastro" },
  { id: "sem_cadastro", label: "Sem cadastro" },
  { id: "optout", label: "Opt-out" },
  { id: "aniversariantes", label: "Aniversariantes do mês" },
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
  tipo: TipoDeContato;
  birthDate: string | null;
  source: string;
  optOut: boolean;
  registered: boolean;
  createdAt: string;
  conversation: {
    id: string;
    status: ConversationStatus;
    stage: string;
    coluna?: { name: string; color: string } | null;
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

type Endereco = {
  zip: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
};

type Detail = {
  contact: Row & { cnae: string | null; address: Endereco; notes: string | null };
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
  const { base, store } = useWaPanel();
  const STAGE_BY_ID = stageByIdFor(store);
  const params = useSearchParams();
  const router = useRouter();
  const [busca, setBusca] = useState(params?.get("q") ?? "");
  const [termo, setTermo] = useState(params?.get("q") ?? "");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [tipo, setTipo] = useState<TipoDeContato | "">("");
  const [mes, setMes] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [podeExportar, setPodeExportar] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<Detail | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [cadastro, setCadastro] = useState<{ mode: "novo" } | { mode: "editar"; detalhe: Detail } | null>(null);
  const [importando, setImportando] = useState(false);
  const [apagando, setApagando] = useState<Detail | null>(null);

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

  /** Os mesmos filtros da lista valem para a exportação. */
  const filtrosDaUrl = useCallback(() => {
    const sp = new URLSearchParams({ filtro });
    if (termo.trim()) sp.set("q", termo.trim());
    if (tipo) sp.set("tipo", tipo);
    if (filtro === "aniversariantes" && mes) sp.set("mes", String(mes));
    return sp;
  }, [filtro, termo, tipo, mes]);

  const load = useCallback(async () => {
    setCarregando(true);
    try {
      const sp = filtrosDaUrl();
      sp.set("page", String(page));
      const res = await fetch(`/api/wa/contacts?${sp.toString()}`);
      if (!res.ok) {
        setErro("Não foi possível carregar os contatos.");
        return;
      }
      const body = await res.json();
      setRows(body.contacts ?? []);
      setTotal(body.total ?? 0);
      setPageSize(body.pageSize ?? 50);
      setPodeExportar(Boolean(body.podeExportar));
      // O mês "de agora" é o do servidor (Brasília), não o do relógio da máquina.
      if (filtro === "aniversariantes" && !mes && body.mes) setMes(body.mes);
      setErro(null);
    } finally {
      setCarregando(false);
    }
  }, [filtrosDaUrl, page, filtro, mes]);

  useEffect(() => {
    load();
  }, [load]);

  const carregarDetalhe = useCallback((id: string) => {
    fetch(`/api/wa/contacts/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setDetalhe(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selecionado) {
      setDetalhe(null);
      return;
    }
    carregarDetalhe(selecionado);
  }, [selecionado, carregarDetalhe]);

  const paginas = Math.max(1, Math.ceil(total / pageSize));
  const aniversariantes = filtro === "aniversariantes";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="brand-kicker">Base</p>
          <h1 className="mt-1 text-2xl font-bold">Contatos</h1>
          <p className="mt-1 text-sm text-muted">
            {formatNumber(total)} contato{total === 1 ? "" : "s"}:{" "}
            {store
              ? "todo mundo que recebeu ou mandou mensagem pelos canais da loja, e quem foi cadastrado ou importado."
              : "todo mundo que recebeu ou mandou mensagem pelo número do CNV."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          <button className="btn-ghost px-3 py-2 text-xs" onClick={() => setImportando(true)}>
            <FileSpreadsheet size={14} /> Importar CSV
          </button>
          {podeExportar && (
            <a
              className="btn-ghost px-3 py-2 text-xs"
              href={`/api/wa/contacts/export?${filtrosDaUrl().toString()}`}
              title="Baixa os contatos deste filtro em CSV"
            >
              <Download size={14} /> Exportar CSV
            </a>
          )}
          <button className="btn-dark px-3 py-2 text-xs" onClick={() => setCadastro({ mode: "novo" })}>
            <UserPlus size={14} /> Novo contato
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {FILTROS.filter((f) => !store || (f.id !== "cadastrados" && f.id !== "sem_cadastro")).map((f) => (
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
        {aniversariantes && (
          <select
            className="input w-auto py-1 text-xs"
            value={mes ?? ""}
            onChange={(e) => {
              setMes(Number(e.target.value) || null);
              setPage(1);
            }}
            aria-label="Mês dos aniversariantes"
          >
            {MESES.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        )}
        <select
          className="input ml-auto w-auto py-1 text-xs"
          value={tipo}
          onChange={(e) => {
            setTipo(e.target.value as TipoDeContato | "");
            setPage(1);
          }}
          aria-label="Tipo de contato"
        >
          <option value="">Todos os tipos</option>
          {TIPOS_DE_CONTATO.map((t) => (
            <option key={t} value={t}>
              {ROTULO_DO_TIPO[t]}
            </option>
          ))}
        </select>
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
              {aniversariantes
                ? "Ninguém com aniversário neste mês. A data entra pela ficha do contato ou pela importação."
                : "Nenhum contato com esse filtro."}
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {rows.map((c) => {
                // A coluna do funil (com o nome que a loja deu); sem ela, o nome da etapa.
                const etapa = c.conversation && isStage(c.conversation.stage)
                  ? STAGE_BY_ID[c.conversation.stage]
                  : null;
                const stage = c.conversation?.coluna
                  ? { label: c.conversation.coluna.name, chip: corDaColuna(c.conversation.coluna.color).chip }
                  : etapa;
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
                          {!store && c.registered && (
                            <BadgeCheck size={13} className="shrink-0 text-violet-700" />
                          )}
                          {c.optOut && <Ban size={13} className="shrink-0 text-red-600" />}
                          {c.tipo !== "cliente" && (
                            <span className="shrink-0 rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold text-ink-800">
                              {ROTULO_DO_TIPO[c.tipo] ?? c.tipo}
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {[c.name ? formatPhoneBr(c.phone) : null, c.company, c.city]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </span>
                      </span>
                      <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
                        {aniversariantes && c.birthDate && (
                          <span className="flex items-center gap-1 rounded-full bg-pink-100 px-1.5 py-0.5 text-[10px] font-semibold text-pink-700">
                            <Cake size={11} /> {formatarAniversario(c.birthDate, false)}
                          </span>
                        )}
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
            if (selecionado) carregarDetalhe(selecionado);
          }}
          onEditar={(d) => setCadastro({ mode: "editar", detalhe: d })}
          onApagar={(d) => setApagando(d)}
          onAbrirConversa={(id) => router.push(`${base}/central?c=${id}`)}
        />
      </div>

      {cadastro && (
        <ContatoModal
          cadastro={cadastro}
          onClose={() => setCadastro(null)}
          onSalvo={(id) => {
            setCadastro(null);
            load();
            setSelecionado(id);
            carregarDetalhe(id);
          }}
          onAbrirExistente={(id) => {
            setCadastro(null);
            setSelecionado(id);
          }}
        />
      )}

      {importando && <ImportarContatosModal onClose={() => setImportando(false)} onImportado={load} />}

      {apagando && (
        <ApagarContatoModal
          detalhe={apagando}
          onClose={() => setApagando(null)}
          onApagado={() => {
            setApagando(null);
            setSelecionado(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function Ficha({
  detalhe,
  selecionado,
  onFechar,
  onSalvo,
  onEditar,
  onApagar,
  onAbrirConversa,
}: {
  detalhe: Detail | null;
  selecionado: string | null;
  onFechar: () => void;
  onSalvo: () => void;
  onEditar: (d: Detail) => void;
  onApagar: (d: Detail) => void;
  onAbrirConversa: (conversationId: string) => void;
}) {
  const { base, store } = useWaPanel();
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setErro(null);
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
      onSalvo();
    } finally {
      setSalvando(false);
    }
  }

  if (!selecionado) {
    return (
      <aside className="card hidden h-fit lg:block">
        <p className="text-sm text-muted">
          {store
            ? "Selecione um contato para ver os dados dele e abrir a conversa."
            : "Selecione um contato para ver a situação dele no CNV: cadastro, teste grátis, assinatura e cobranças."}
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
  const endereco = [
    [c.address?.street, c.address?.number].filter(Boolean).join(", "),
    c.address?.complement,
    c.address?.district,
    c.address?.zip ? `CEP ${c.address.zip.replace(/^(\d{5})(\d{3})$/, "$1-$2")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

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
        <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-800">
          {ROTULO_DO_TIPO[c.tipo] ?? c.tipo}
        </span>
        <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] text-ink-800">
          origem: {c.source}
        </span>
      </div>

      {erro && <p className="text-xs text-red-600">{erro}</p>}

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
        {c.birthDate && (
          <div className="flex items-center gap-2">
            <Cake size={12} className="text-muted" />
            <span>aniversário {formatarAniversario(c.birthDate)}</span>
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
        {endereco && (
          <div className="flex items-start gap-2">
            <MapPin size={12} className="mt-0.5 shrink-0 text-muted" />
            <span>{endereco}</span>
          </div>
        )}
        {c.notes && (
          <div className="flex items-start gap-2">
            <StickyNote size={12} className="mt-0.5 shrink-0 text-muted" />
            <span className="whitespace-pre-wrap">{c.notes}</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-muted">
          <span>na base desde {dateTime(c.createdAt)}</span>
        </div>
      </dl>

      {/* ── Situação no CNV (só no painel do CNV) ──────────── */}
      {!store && <div className="border-t border-line pt-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <BadgeCheck size={13} /> Situação no CNV
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
      </div>}

      {!store && (d?.payments.length ?? 0) > 0 && (
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
        <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => onEditar(detalhe)}>
          <Pencil size={14} /> Editar
        </button>
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
        <button
          className="btn-ghost px-3 py-1.5 text-xs text-red-600"
          onClick={() => onApagar(detalhe)}
          title="Apagar o contato, a conversa e as mensagens dele"
        >
          <Trash2 size={14} /> Apagar
        </button>
      </div>

      {detalhe.conversation && (
        <p className="text-[11px] text-muted">
          Última mensagem {timeAgo(detalhe.conversation.lastMessageAt)} ·{" "}
          <Link href={`${base}/pipeline`} className="text-brand-700 hover:underline">
            ver no pipeline
          </Link>
        </p>
      )}
    </aside>
  );
}

/** Moldura dos modais dos contatos, no mesmo padrão dos outros do atendimento. */
function Modal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-black/50" aria-label="Fechar" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-line bg-paper shadow-2xl sm:rounded-3xl">
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">{title}</p>
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          <button className="rounded-full p-1.5 text-muted hover:bg-canvas" onClick={onClose} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

type Formulario = {
  phone: string;
  name: string;
  email: string;
  document: string;
  company: string;
  tipo: TipoDeContato;
  birthDate: string;
  zip: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  notes: string;
};

function ContatoModal({
  cadastro,
  onClose,
  onSalvo,
  onAbrirExistente,
}: {
  cadastro: { mode: "novo" } | { mode: "editar"; detalhe: Detail };
  onClose: () => void;
  onSalvo: (id: string) => void;
  onAbrirExistente: (id: string) => void;
}) {
  const atual = cadastro.mode === "editar" ? cadastro.detalhe.contact : null;
  const [inicial] = useState<Formulario>(() => ({
    phone: atual ? formatPhoneBr(atual.phone) : "",
    name: atual?.name ?? "",
    email: atual?.email ?? "",
    document: atual?.document ? formatDocument(atual.document) : "",
    company: atual?.company ?? "",
    tipo: atual?.tipo ?? "cliente",
    birthDate: atual?.birthDate ?? "",
    zip: atual?.address?.zip ?? "",
    street: atual?.address?.street ?? "",
    number: atual?.address?.number ?? "",
    complement: atual?.address?.complement ?? "",
    district: atual?.address?.district ?? "",
    city: atual?.city ?? "",
    state: atual?.state ?? "",
    notes: atual?.notes ?? "",
  }));
  const [f, setF] = useState<Formulario>(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [existente, setExistente] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof Formulario) => (e: { target: { value: string } }) =>
    setF((x) => ({ ...x, [k]: e.target.value }));

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (salvando) return;
    setSalvando(true);
    setErro(null);
    setExistente(null);
    // Na edição vai só o que mudou: um dado antigo que não passaria na
    // conferência de hoje não trava a correção de outro campo.
    const mudou = (k: keyof Formulario) => !atual || f[k] !== inicial[k];
    const corpo: Record<string, unknown> = {};
    const endereco: Record<string, string> = {};
    for (const k of Object.keys(f) as Array<keyof Formulario>) {
      // O telefone não muda na edição: é a chave da conversa.
      if (k === "phone" ? atual : !mudou(k)) continue;
      if (["zip", "street", "number", "complement", "district"].includes(k)) endereco[k] = f[k];
      else corpo[k] = f[k];
    }
    if (Object.keys(endereco).length) corpo.address = endereco;
    if (atual && Object.keys(corpo).length === 0) {
      onSalvo(atual.id);
      setSalvando(false);
      return;
    }
    try {
      const res = await fetch(atual ? `/api/wa/contacts/${atual.id}` : "/api/wa/contacts", {
        method: atual ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(body.error ?? "Não foi possível salvar.");
        if (res.status === 409 && body.id) setExistente(String(body.id));
        return;
      }
      onSalvo(atual ? atual.id : String(body.id));
    } finally {
      setSalvando(false);
    }
  }

  const campo = (k: keyof Formulario, label: string, extra: Record<string, unknown> = {}) => (
    <label className="block text-xs font-semibold text-ink-800">
      {label}
      <input className="input mt-1 w-full" value={f[k]} onChange={set(k)} {...extra} />
    </label>
  );

  return (
    <Modal
      title={atual ? "Editar contato" : "Novo contato"}
      subtitle={
        atual
          ? "O telefone não muda: é ele que liga o contato à conversa."
          : "O telefone com DDD é obrigatório e não pode repetir: cada número é um contato."
      }
      onClose={onClose}
    >
      <form className="space-y-4" onSubmit={salvar}>
        <div className="grid gap-3 sm:grid-cols-2">
          {atual ? (
            <div>
              <p className="text-xs font-semibold text-ink-800">Telefone</p>
              <p className="mt-2 text-sm text-ink-900">{formatPhoneBr(atual.phone)}</p>
            </div>
          ) : (
            campo("phone", "Telefone (com DDD)", { required: true, autoFocus: true, placeholder: "(31) 99999-9999" })
          )}
          {campo("name", "Nome", atual ? { autoFocus: true } : {})}
          {campo("email", "E-mail", { type: "email" })}
          {campo("document", "CPF ou CNPJ")}
          {campo("company", "Empresa")}
          <label className="block text-xs font-semibold text-ink-800">
            Tipo
            <select className="input mt-1 w-full" value={f.tipo} onChange={set("tipo")}>
              {TIPOS_DE_CONTATO.map((t) => (
                <option key={t} value={t}>
                  {ROTULO_DO_TIPO[t]}
                </option>
              ))}
            </select>
          </label>
          {campo("birthDate", "Aniversário", { type: "date" })}
        </div>

        <div>
          <p className="text-xs font-semibold text-ink-800">Endereço</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-6">
            <div className="sm:col-span-2">{campo("zip", "CEP")}</div>
            <div className="sm:col-span-4">{campo("street", "Rua")}</div>
            <div className="sm:col-span-2">{campo("number", "Número")}</div>
            <div className="sm:col-span-4">{campo("complement", "Complemento")}</div>
            <div className="sm:col-span-3">{campo("district", "Bairro")}</div>
            <div className="sm:col-span-2">{campo("city", "Cidade")}</div>
            <div className="sm:col-span-1">{campo("state", "UF", { maxLength: 2 })}</div>
          </div>
        </div>

        <label className="block text-xs font-semibold text-ink-800">
          Observações
          <textarea className="input mt-1 min-h-[80px] w-full" maxLength={2000} value={f.notes} onChange={set("notes")} />
        </label>

        {erro && (
          <p className="text-xs text-red-600">
            {erro}{" "}
            {existente && (
              <button type="button" className="font-semibold underline" onClick={() => onAbrirExistente(existente)}>
                Abrir o contato
              </button>
            )}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost px-4 py-2 text-xs" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn-dark px-4 py-2 text-xs" disabled={salvando || (!atual && !f.phone.trim())}>
            {salvando ? "Salvando…" : atual ? "Salvar" : "Cadastrar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ApagarContatoModal({
  detalhe,
  onClose,
  onApagado,
}: {
  detalhe: Detail;
  onClose: () => void;
  onApagado: () => void;
}) {
  const [apagando, setApagando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const c = detalhe.contact;
  return (
    <Modal title={`Apagar ${c.name || formatPhoneBr(c.phone)}?`} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p className="text-ink-800">
          {detalhe.conversation
            ? "O contato sai da base junto com a conversa, as mensagens e as notas dele. Não dá para desfazer."
            : "O contato sai da base. Não dá para desfazer."}
        </p>
        <p className="text-xs text-muted">
          Se a pessoa escrever de novo, ela volta como um contato novo, sem o histórico. Para só parar de mandar
          mensagem, use o opt-out.
        </p>
        {erro && <p className="text-xs text-red-600">{erro}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-ghost px-4 py-2 text-xs" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="rounded-2xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            disabled={apagando}
            onClick={async () => {
              setApagando(true);
              setErro(null);
              const res = await fetch(`/api/wa/contacts/${c.id}`, { method: "DELETE" });
              setApagando(false);
              if (!res.ok) {
                const b = await res.json().catch(() => ({}));
                setErro(b.error ?? "Não foi possível apagar.");
                return;
              }
              onApagado();
            }}
          >
            {apagando ? "Apagando…" : "Apagar contato"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
