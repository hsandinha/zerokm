"use client";

// Agenda de visita e test drive da loja.
//
// Três leituras: o DIA (com os horários livres da configuração, clicáveis
// para marcar), a SEMANA (segunda a domingo) e a LISTA dos próximos 30 dias.
// O agendamento entra pela IA (agendar_visita, sempre "a confirmar") ou pelo
// botão "Novo agendamento", o caminho de quem ligou ou passou na loja.
//
// Vaga não é bloqueada: a tela mostra o que está livre e quem decide se cabe
// mais um é a equipe. Criar, editar e configurar abrem em modal. As datas
// chegam já em Brasília (data e hora prontas do servidor): a tela não
// converte fuso.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  MessageCircle,
  Pencil,
  Plus,
  Settings2,
  UserX,
  X,
} from "lucide-react";
import { useWaPanel } from "@wa/components/wa-panel";
import { BuscaConversa, type ConversaEscolhida } from "@wa/components/busca-conversa";
import { formatPhoneBr } from "@wa/lib/phone";
import {
  CONFIG_PADRAO,
  DIAS_CURTOS,
  DIAS_DA_SEMANA,
  STATUS_AGENDAMENTO,
  TIPOS_AGENDAMENTO,
  diaDaSemana,
  hojeEmSaoPaulo,
  horaDe,
  inicioDaSemana,
  minutosDe,
  rotuloDoDia,
  rotuloDoStatus,
  rotuloDoTipo,
  somarDias,
  type ConfigAgenda,
  type StatusAgendamento,
  type TipoAgendamento,
} from "@wa/lib/agenda";
import type { AgendamentoDaTela } from "@wa/lib/agenda-server";

type Vista = "dia" | "semana" | "lista";
type Membro = { email: string; name: string | null };

const TOM: Record<StatusAgendamento, string> = {
  a_confirmar: "bg-amber-100 text-amber-800",
  confirmado: "bg-emerald-100 text-emerald-700",
  realizado: "bg-sky-100 text-sky-700",
  faltou: "bg-red-100 text-red-700",
  cancelado: "bg-canvas text-muted line-through",
};

const BORDA: Record<StatusAgendamento, string> = {
  a_confirmar: "border-l-amber-400",
  confirmado: "border-l-emerald-500",
  realizado: "border-l-sky-500",
  faltou: "border-l-red-500",
  cancelado: "border-l-line",
};

const nomeDe = (equipe: Membro[], email: string | null) => {
  if (!email) return null;
  const m = equipe.find((x) => x.email === email);
  return m?.name || email.split("@")[0];
};

const fimDe = (a: AgendamentoDaTela) => horaDe(Math.min(24 * 60 - 1, minutosDe(a.hora) + a.duracaoMin));

type Edicao = { modo: "novo"; data: string; hora: string } | { modo: "editar"; ag: AgendamentoDaTela };

export function Agenda({ gestor }: { gestor: boolean }) {
  const { base } = useWaPanel();
  const hoje = hojeEmSaoPaulo();
  const [vista, setVista] = useState<Vista>("dia");
  const [data, setData] = useState(hoje);
  const [soPendentes, setSoPendentes] = useState(true);
  const [itens, setItens] = useState<AgendamentoDaTela[] | null>(null);
  const [livres, setLivres] = useState<{ configurada: boolean; horas: string[] } | null>(null);
  const [config, setConfig] = useState<ConfigAgenda | null | undefined>(undefined);
  const [equipe, setEquipe] = useState<Membro[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [configAberta, setConfigAberta] = useState(false);

  const periodo = useMemo(() => {
    if (vista === "dia") return { de: data, ate: data };
    if (vista === "semana") {
      const ini = inicioDaSemana(data);
      return { de: ini, ate: somarDias(ini, 6) };
    }
    return { de: data, ate: somarDias(data, 30) };
  }, [vista, data]);

  const carregar = useCallback(() => {
    const sp = new URLSearchParams({ de: periodo.de, ate: periodo.ate });
    if (vista === "lista" && soPendentes) sp.set("status", "a_confirmar,confirmado");
    fetch(`/api/wa/agenda?${sp}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error ?? "Falha ao carregar a agenda");
        setItens(d.agendamentos ?? []);
      })
      .catch((e: Error) => {
        setErro(e.message);
        setItens([]);
      });
    if (vista === "dia") {
      fetch(`/api/wa/agenda/horarios?data=${periodo.de}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setLivres(d ? { configurada: Boolean(d.configurada), horas: d.horas ?? [] } : null))
        .catch(() => setLivres(null));
    }
  }, [periodo, vista, soPendentes]);
  useEffect(carregar, [carregar]);

  const carregarConfig = useCallback(() => {
    fetch("/api/wa/agenda/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setConfig(d?.config ?? null))
      .catch(() => setConfig(null));
  }, []);
  useEffect(carregarConfig, [carregarConfig]);

  useEffect(() => {
    fetch("/api/wa/conversations/equipe")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setEquipe(d?.equipe ?? []))
      .catch(() => {});
  }, []);

  async function mudarStatus(a: AgendamentoDaTela, status: StatusAgendamento) {
    setItens((l) => l?.map((x) => (x.id === a.id ? { ...x, status } : x)) ?? null);
    const patch = (forcar: boolean) =>
      fetch(`/api/wa/agenda/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...(forcar ? { forcar: true } : {}) }),
      });
    let r = await patch(false);
    let d = r.ok ? null : await r.json().catch(() => ({}));
    // Reabrir num horário que lotou enquanto estava cancelado: a equipe decide.
    if (r.status === 409 && d?.conflito && confirm(`${d.error} Manter assim mesmo?`)) {
      r = await patch(true);
      d = r.ok ? null : await r.json().catch(() => ({}));
    }
    if (!r.ok && !(r.status === 409 && d?.conflito)) setErro(d?.error ?? "Não deu para mudar o status.");
    carregar();
  }

  function andar(d: -1 | 1) {
    setData((atual) => somarDias(atual, vista === "dia" ? d : vista === "semana" ? 7 * d : 30 * d));
  }

  const tituloDoPeriodo =
    vista === "dia"
      ? `${data === hoje ? "Hoje, " : ""}${rotuloDoDia(data)}`
      : vista === "semana"
        ? `Semana de ${rotuloDoDia(periodo.de).split(", ")[1]} a ${rotuloDoDia(periodo.ate).split(", ")[1]}`
        : `De ${rotuloDoDia(periodo.de).split(", ")[1]} a ${rotuloDoDia(periodo.ate).split(", ")[1]}`;

  const card = (a: AgendamentoDaTela) => (
    <CartaoAgendamento
      key={a.id}
      ag={a}
      responsavel={nomeDe(equipe, a.responsavel)}
      linkConversa={a.conversationId ? `${base}/central?c=${a.conversationId}` : null}
      onStatus={(s) => mudarStatus(a, s)}
      onEditar={() => setEdicao({ modo: "editar", ag: a })}
    />
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <CalendarDays size={20} className="text-brand-700" /> Agenda
          </h1>
          <p className="text-sm text-muted">
            Visitas e test drives. A IA marca como “a confirmar”; a equipe confirma com o cliente.
          </p>
        </div>
        <div className="flex gap-2">
          {gestor && (
            <button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => setConfigAberta(true)}>
              <Settings2 size={14} /> Configurar
            </button>
          )}
          <button
            className="btn-dark px-3 py-1.5 text-sm"
            onClick={() => setEdicao({ modo: "novo", data: data < hoje ? hoje : data, hora: "" })}
          >
            <Plus size={14} /> Novo agendamento
          </button>
        </div>
      </div>

      {config === null && gestor && (
        <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          A agenda ainda não tem dias e horários de visita. Sem isso a IA não oferece horário: anota o que o cliente pedir.{" "}
          <button className="font-semibold underline" onClick={() => setConfigAberta(true)}>
            Configurar agora
          </button>
        </p>
      )}
      {erro && (
        <p className="flex items-start justify-between gap-3 rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
          <button onClick={() => setErro(null)} aria-label="Fechar aviso">
            <X size={14} />
          </button>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {(["dia", "semana", "lista"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              className={clsx(
                "rounded-full px-3 py-1.5 text-xs font-semibold",
                vista === v ? "pill-active" : "border border-line bg-paper text-muted",
              )}
            >
              {v === "dia" ? "Dia" : v === "semana" ? "Semana" : "Lista"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button className="rounded-full p-1.5 text-muted hover:bg-canvas" onClick={() => andar(-1)} aria-label="Anterior">
            <ChevronLeft size={16} />
          </button>
          <button className="btn-ghost px-3 py-1 text-xs" onClick={() => setData(hoje)}>
            Hoje
          </button>
          <button className="rounded-full p-1.5 text-muted hover:bg-canvas" onClick={() => andar(1)} aria-label="Próximo">
            <ChevronRight size={16} />
          </button>
          <input
            type="date"
            className="input ml-1 w-auto py-1 text-xs"
            value={data}
            onChange={(e) => e.target.value && setData(e.target.value)}
            aria-label="Ir para o dia"
          />
        </div>
        <p className="text-sm font-semibold capitalize">{tituloDoPeriodo}</p>
        {vista === "lista" && (
          <label className="ml-auto flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={soPendentes} onChange={(e) => setSoPendentes(e.target.checked)} />
            Só a confirmar e confirmados
          </label>
        )}
      </div>

      {itens === null ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Loader2 size={14} className="animate-spin" /> Carregando…
        </p>
      ) : vista === "dia" ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
          <section className="space-y-2">
            {itens.length === 0 ? (
              <p className="card text-sm text-muted">Nada marcado neste dia.</p>
            ) : (
              itens.map(card)
            )}
          </section>
          <aside className="card h-fit p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink-800">
              <Clock size={13} /> Horários livres
            </p>
            {!livres ? (
              <p className="text-xs text-muted">…</p>
            ) : !livres.configurada ? (
              <p className="text-xs text-muted">
                Configure os dias e horários de visita para ver os horários livres{gestor ? "" : " (peça ao gestor)"}.
              </p>
            ) : livres.horas.length === 0 ? (
              <p className="text-xs text-muted">Sem horário livre neste dia.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {livres.horas.map((h) => (
                  <button
                    key={h}
                    className="rounded-full border border-dashed border-brand-300 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                    onClick={() => setEdicao({ modo: "novo", data, hora: h })}
                    title="Marcar neste horário"
                  >
                    {h}
                  </button>
                ))}
              </div>
            )}
          </aside>
        </div>
      ) : vista === "semana" ? (
        <div className="overflow-x-auto">
          <div className="grid min-w-[56rem] grid-cols-7 gap-2">
            {Array.from({ length: 7 }, (_, i) => somarDias(periodo.de, i)).map((dia) => {
              const doDia = itens.filter((a) => a.data === dia);
              return (
                <section key={dia} className={clsx("card min-h-[10rem] p-2", dia === hoje && "ring-2 ring-brand-300")}>
                  <button
                    className="mb-2 w-full text-left text-xs font-semibold capitalize text-ink-800 hover:underline"
                    onClick={() => {
                      setData(dia);
                      setVista("dia");
                    }}
                  >
                    {DIAS_CURTOS[diaDaSemana(dia)]} {dia.slice(8, 10)}/{dia.slice(5, 7)}
                  </button>
                  <ul className="space-y-1">
                    {doDia.map((a) => (
                      <li key={a.id}>
                        <button
                          className={clsx(
                            "w-full rounded-lg border-l-4 bg-canvas px-2 py-1 text-left text-[11px] hover:bg-ink-50",
                            BORDA[a.status],
                            a.status === "cancelado" && "opacity-50",
                          )}
                          onClick={() => setEdicao({ modo: "editar", ag: a })}
                        >
                          <span className="block font-semibold tabular-nums">
                            {a.hora} {a.tipo === "test_drive" ? "· test drive" : ""}
                          </span>
                          <span className="block truncate">{a.contatoNome || "Cliente"}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      ) : itens.length === 0 ? (
        <p className="card text-sm text-muted">Nenhum agendamento nos próximos 30 dias.</p>
      ) : (
        <div className="space-y-4">
          {[...new Set(itens.map((a) => a.data))].map((dia) => (
            <section key={dia} className="space-y-2">
              <p className="text-xs font-semibold capitalize text-muted">{dia === hoje ? `Hoje, ${rotuloDoDia(dia)}` : rotuloDoDia(dia)}</p>
              {itens.filter((a) => a.data === dia).map(card)}
            </section>
          ))}
        </div>
      )}

      {edicao && (
        <AgendamentoModal
          edicao={edicao}
          equipe={equipe}
          onClose={() => setEdicao(null)}
          onSaved={() => {
            setEdicao(null);
            carregar();
          }}
        />
      )}
      {configAberta && (
        <ConfigModal
          atual={config ?? null}
          onClose={() => setConfigAberta(false)}
          onSaved={() => {
            setConfigAberta(false);
            carregarConfig();
            carregar();
          }}
        />
      )}
    </div>
  );
}

function CartaoAgendamento({
  ag: a,
  responsavel,
  linkConversa,
  onStatus,
  onEditar,
}: {
  ag: AgendamentoDaTela;
  responsavel: string | null;
  linkConversa: string | null;
  onStatus: (s: StatusAgendamento) => void;
  onEditar: () => void;
}) {
  const passou = new Date(a.inicio).getTime() < Date.now();
  const aberto = a.status === "a_confirmar" || a.status === "confirmado";
  const lembrete =
    a.lembrete.via === "texto" || a.lembrete.via === "template"
      ? "Lembrete enviado"
      : a.lembrete.via === "equipe"
        ? "Lembrete não saiu: a equipe foi avisada"
        : null;
  return (
    <article className={clsx("card border-l-4 p-3 text-sm", BORDA[a.status], a.status === "cancelado" && "opacity-60")}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="w-20 shrink-0 tabular-nums">
          <p className="font-bold">{a.hora}</p>
          <p className="text-xs text-muted">até {fimDe(a)}</p>
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold">{a.contatoNome || "Cliente"}</span>
            <span className={clsx("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", TOM[a.status])}>{rotuloDoStatus(a.status)}</span>
            <span className="rounded-full bg-canvas px-1.5 py-0.5 text-[10px] font-semibold text-ink-700">{rotuloDoTipo(a.tipo)}</span>
            {a.horarioAproximado && aberto && (
              <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">horário a combinar</span>
            )}
            {a.origem === "ia" && <span className="text-[10px] text-muted">pela IA</span>}
          </p>
          <p className="truncate text-xs text-muted">
            {[a.contatoTelefone ? formatPhoneBr(a.contatoTelefone) : null, a.veiculo, responsavel ? `com ${responsavel}` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {a.observacao && <p className="mt-1 line-clamp-2 text-xs text-ink-700">{a.observacao}</p>}
          {lembrete && <p className="mt-1 text-[11px] text-muted">{lembrete}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {a.status === "a_confirmar" && (
            <button className="btn-primary px-2.5 py-1 text-xs" onClick={() => onStatus("confirmado")}>
              <Check size={13} /> Confirmar
            </button>
          )}
          {aberto && (passou || a.status === "confirmado") && (
            <>
              <button className="btn-ghost px-2 py-1 text-xs" onClick={() => onStatus("realizado")} title="Marcar como realizado">
                <Check size={13} /> Realizado
              </button>
              <button className="btn-ghost px-2 py-1 text-xs" onClick={() => onStatus("faltou")} title="O cliente não veio">
                <UserX size={13} /> Faltou
              </button>
            </>
          )}
          {aberto && (
            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => onStatus("cancelado")} title="Cancelar">
              <X size={13} />
            </button>
          )}
          {linkConversa && (
            <Link href={linkConversa} className="btn-ghost px-2 py-1 text-xs" title="Abrir a conversa">
              <MessageCircle size={13} />
            </Link>
          )}
          <button className="btn-ghost px-2 py-1 text-xs" onClick={onEditar} title="Editar">
            <Pencil size={13} />
          </button>
        </div>
      </div>
    </article>
  );
}

// ── Modal: novo / editar ─────────────────────────────────────

function Moldura({
  titulo,
  subtitulo,
  onClose,
  children,
  rodape,
  largo,
}: {
  titulo: string;
  subtitulo?: string;
  onClose: () => void;
  children: React.ReactNode;
  rodape: React.ReactNode;
  largo?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="Fechar" onClick={onClose} />
      <div
        className={clsx(
          "relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-paper shadow-2xl sm:rounded-3xl",
          largo ? "max-w-2xl" : "max-w-lg",
        )}
      >
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">{titulo}</p>
            {subtitulo && <p className="mt-0.5 text-xs text-muted">{subtitulo}</p>}
          </div>
          <button type="button" className="rounded-full p-1.5 text-muted hover:bg-canvas" onClick={onClose} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-4 overflow-y-auto px-5 py-4">{children}</div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">{rodape}</div>
      </div>
    </div>
  );
}

const DURACOES = [30, 45, 60, 90, 120];

function AgendamentoModal({
  edicao,
  equipe,
  onClose,
  onSaved,
}: {
  edicao: Edicao;
  equipe: Membro[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const ag = edicao.modo === "editar" ? edicao.ag : null;
  const [conversa, setConversa] = useState<ConversaEscolhida | null>(
    ag?.conversationId ? { id: ag.conversationId, nome: ag.contatoNome, telefone: ag.contatoTelefone } : null,
  );
  const [nome, setNome] = useState(ag?.contatoNome ?? "");
  const [telefone, setTelefone] = useState(ag?.contatoTelefone ?? "");
  const [tipo, setTipo] = useState<TipoAgendamento>(ag?.tipo ?? "visita");
  const [dia, setDia] = useState(ag?.data ?? (edicao.modo === "novo" ? edicao.data : hojeEmSaoPaulo()));
  const [hora, setHora] = useState(ag?.hora ?? (edicao.modo === "novo" ? edicao.hora : ""));
  const [duracao, setDuracao] = useState(ag?.duracaoMin ?? 60);
  const [status, setStatus] = useState<StatusAgendamento>(ag?.status ?? "confirmado");
  const [responsavel, setResponsavel] = useState(ag?.responsavel ?? "");
  const [veiculoId, setVeiculoId] = useState(ag?.veiculoId ?? "");
  const [veiculo, setVeiculo] = useState(ag?.veiculo ?? "");
  const [observacao, setObservacao] = useState(ag?.observacao ?? "");
  const [carros, setCarros] = useState<Array<{ id: string; titulo: string; reservado: boolean }>>([]);
  const [livres, setLivres] = useState<string[] | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Horário lotado ou fora do horário de visita: o motivo, até salvar assim mesmo.
  const [conflito, setConflito] = useState<string | null>(null);

  useEffect(() => {
    setConflito(null);
  }, [dia, hora, duracao, status]);

  useEffect(() => {
    fetch("/api/wa/agenda/carros")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCarros(d?.carros ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return;
    const sp = new URLSearchParams({ data: dia, duracao: String(duracao) });
    if (ag) sp.set("exceto", ag.id);
    fetch(`/api/wa/agenda/horarios?${sp}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setLivres(d?.configurada ? (d.horas ?? []) : null))
      .catch(() => setLivres(null));
  }, [dia, duracao, ag]);

  // Sem uma conversa escolhida, o nome do cliente é obrigatório (quem ligou).
  const podeSalvar = Boolean(dia && hora && (conversa || nome.trim())) && !salvando;

  async function salvar(e: React.FormEvent, forcar = false) {
    e.preventDefault();
    if (!podeSalvar) return;
    setSalvando(true);
    setErro(null);
    setConflito(null);
    const mesmaConversa = Boolean(conversa && ag && conversa.id === ag.conversationId);
    const corpo = {
      tipo,
      data: dia,
      hora,
      duracaoMin: duracao,
      status,
      responsavel,
      conversationId: conversa?.id ?? "",
      // Mesma conversa: mantém o nome e o telefone gravados; outra: os dela.
      contatoNome: conversa ? ((mesmaConversa ? ag?.contatoNome : null) ?? conversa.nome ?? "") : nome,
      contatoTelefone: conversa ? ((mesmaConversa ? ag?.contatoTelefone : null) ?? conversa.telefone ?? "") : telefone,
      veiculoId,
      veiculo: veiculoId ? "" : veiculo,
      observacao,
      ...(forcar ? { forcar: true } : {}),
    };
    const r = await fetch(ag ? `/api/wa/agenda/${ag.id}` : "/api/wa/agenda", {
      method: ag ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const d = await r.json().catch(() => ({}));
    setSalvando(false);
    if (r.status === 409 && d.conflito) return setConflito(d.error ?? "Esse horário não está livre na agenda.");
    if (!r.ok) return setErro(d.error ?? "Falha ao salvar");
    onSaved();
  }

  return (
    <form onSubmit={salvar}>
      <Moldura
        titulo={ag ? "Editar agendamento" : "Novo agendamento"}
        subtitulo={
          ag?.origem === "ia"
            ? "Pedido pela IA na conversa. Confirme o horário com o cliente e mude o status para confirmado."
            : "Ligue à conversa do cliente para o lembrete da véspera sair pelo WhatsApp."
        }
        onClose={onClose}
        rodape={
          <>
            <span className="min-w-0 flex-1 text-xs text-red-600">{conflito ?? erro}</span>
            <button type="button" className="btn-ghost px-4 py-2 text-xs" onClick={onClose}>
              Cancelar
            </button>
            {conflito ? (
              <button
                type="button"
                className="btn-dark px-4 py-2 text-xs"
                disabled={!podeSalvar}
                onClick={(e) => salvar(e, true)}
              >
                {salvando ? <Loader2 size={13} className="animate-spin" /> : null} Salvar mesmo assim
              </button>
            ) : (
              <button type="submit" className="btn-dark px-4 py-2 text-xs" disabled={!podeSalvar}>
                {salvando ? <Loader2 size={13} className="animate-spin" /> : null} Salvar
              </button>
            )}
          </>
        }
      >
        <div className="space-y-2">
          <p className="text-xs font-semibold text-ink-800">Cliente</p>
          <BuscaConversa valor={conversa} onChange={setConversa} disabled={salvando} />
          {!conversa && (
            <div className="grid gap-2 sm:grid-cols-2">
              <input className="input" placeholder="Nome (quem ligou ou passou na loja)" value={nome} onChange={(e) => setNome(e.target.value)} />
              <input className="input" placeholder="Telefone" value={telefone} onChange={(e) => setTelefone(e.target.value)} inputMode="tel" />
            </div>
          )}
        </div>

        <div className="flex gap-2">
          {TIPOS_AGENDAMENTO.map((t) => (
            <button
              key={t.chave}
              type="button"
              onClick={() => setTipo(t.chave)}
              className={clsx(
                "flex-1 rounded-2xl border px-3 py-2 text-sm font-semibold",
                tipo === t.chave ? "border-ink-900 bg-canvas" : "border-line text-muted",
              )}
            >
              {t.rotulo}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-xs font-semibold text-ink-800">
            Dia
            <input type="date" className="input mt-1 w-full" value={dia} onChange={(e) => setDia(e.target.value)} required />
          </label>
          <label className="block text-xs font-semibold text-ink-800">
            Horário
            <input type="time" className="input mt-1 w-full" value={hora} onChange={(e) => setHora(e.target.value)} required step={300} />
          </label>
          <label className="block text-xs font-semibold text-ink-800">
            Duração
            <select className="input mt-1 w-full" value={duracao} onChange={(e) => setDuracao(Number(e.target.value))}>
              {[...new Set([...DURACOES, duracao])].sort((a, b) => a - b).map((m) => (
                <option key={m} value={m}>
                  {m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)}h${m % 60}` : `${m / 60}h`}
                </option>
              ))}
            </select>
          </label>
        </div>
        {livres && (
          <div>
            <p className="mb-1 text-[11px] text-muted">{livres.length ? "Livres neste dia:" : "Sem horário livre neste dia na configuração."}</p>
            <div className="flex flex-wrap gap-1">
              {livres.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHora(h)}
                  className={clsx(
                    "rounded-full border px-2 py-0.5 text-xs",
                    hora === h ? "border-ink-900 bg-canvas font-semibold" : "border-dashed border-line text-muted",
                  )}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-ink-800">
            Status
            <select className="input mt-1 w-full" value={status} onChange={(e) => setStatus(e.target.value as StatusAgendamento)}>
              {STATUS_AGENDAMENTO.map((s) => (
                <option key={s.chave} value={s.chave}>
                  {s.rotulo}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold text-ink-800">
            Responsável
            <select className="input mt-1 w-full" value={responsavel} onChange={(e) => setResponsavel(e.target.value)}>
              <option value="">Qualquer um da equipe</option>
              {[...equipe, ...(responsavel && !equipe.some((m) => m.email === responsavel) ? [{ email: responsavel, name: null }] : [])].map(
                (m) => (
                  <option key={m.email} value={m.email}>
                    {m.name || m.email}
                  </option>
                ),
              )}
            </select>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {carros.length > 0 && (
            <label className="block text-xs font-semibold text-ink-800">
              Carro do pátio
              <select className="input mt-1 w-full" value={veiculoId} onChange={(e) => setVeiculoId(e.target.value)}>
                <option value="">Nenhum / outro</option>
                {carros.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.titulo}
                    {c.reservado ? " (reservado)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!veiculoId && (
            <label className={clsx("block text-xs font-semibold text-ink-800", carros.length === 0 && "sm:col-span-2")}>
              Carro
              <input className="input mt-1 w-full" placeholder="Ex.: Onix LTZ 2022" value={veiculo} onChange={(e) => setVeiculo(e.target.value)} />
            </label>
          )}
        </div>

        <label className="block text-xs font-semibold text-ink-800">
          Observação
          <textarea className="input mt-1 w-full" rows={3} value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={1000} />
        </label>
      </Moldura>
    </form>
  );
}

// ── Modal: configuração ──────────────────────────────────────

type TemplateAprovado = { name: string; language: string; body: string; variables: number; headerFormat: string | null };

function ConfigModal({ atual, onClose, onSaved }: { atual: ConfigAgenda | null; onClose: () => void; onSaved: () => void }) {
  const [cfg, setCfg] = useState<ConfigAgenda>(() => structuredClone(atual ?? CONFIG_PADRAO));
  const [templates, setTemplates] = useState<TemplateAprovado[] | null>(null);
  const [avisoTemplates, setAvisoTemplates] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/wa/conversations/templates")
      .then((r) => r.json().catch(() => ({})))
      .then((d) => {
        setTemplates(((d.templates ?? []) as TemplateAprovado[]).sort((a, b) => a.name.localeCompare(b.name)));
        if (d.error) setAvisoTemplates(d.error);
      })
      .catch(() => setTemplates([]));
  }, []);

  const setDia = (i: number, parte: Partial<ConfigAgenda["dias"][number]>) =>
    setCfg((c) => ({ ...c, dias: c.dias.map((d) => (d.dia === i ? { ...d, ...parte } : d)) }));
  const num = (k: "duracaoMin" | "intervaloMin" | "simultaneas" | "antecedenciaMin", v: string) =>
    setCfg((c) => ({ ...c, [k]: Number(v) || 0 }));

  const escolhido = templates?.find((t) => t.name === cfg.lembrete.templateName) ?? null;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    const r = await fetch("/api/wa/agenda/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    });
    const d = await r.json().catch(() => ({}));
    setSalvando(false);
    if (!r.ok) return setErro(d.error ?? "Falha ao salvar");
    onSaved();
  }

  // Ordem da tela: segunda a domingo.
  const ordem = [1, 2, 3, 4, 5, 6, 0];

  return (
    <form onSubmit={salvar}>
      <Moldura
        largo
        titulo="Configuração da agenda"
        subtitulo="Dias e horários em que a loja recebe visita e test drive. É daqui que a IA tira os horários livres que oferece."
        onClose={onClose}
        rodape={
          <>
            <span className="min-w-0 flex-1 text-xs text-red-600">{erro}</span>
            <button type="button" className="btn-ghost px-4 py-2 text-xs" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-dark px-4 py-2 text-xs" disabled={salvando}>
              {salvando ? <Loader2 size={13} className="animate-spin" /> : null} Salvar
            </button>
          </>
        }
      >
        <section className="space-y-1.5">
          <p className="text-xs font-semibold text-ink-800">Dias e horários de visita</p>
          {ordem.map((i) => {
            const d = cfg.dias.find((x) => x.dia === i)!;
            return (
              <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                <label className="flex w-36 items-center gap-2 capitalize">
                  <input type="checkbox" checked={d.ativo} onChange={(e) => setDia(i, { ativo: e.target.checked })} />
                  {DIAS_DA_SEMANA[i]}
                </label>
                <input
                  type="time"
                  className="input w-28 py-1"
                  value={d.inicio}
                  disabled={!d.ativo}
                  onChange={(e) => setDia(i, { inicio: e.target.value })}
                  aria-label={`Início de ${DIAS_DA_SEMANA[i]}`}
                />
                <span className="text-muted">às</span>
                <input
                  type="time"
                  className="input w-28 py-1"
                  value={d.fim}
                  disabled={!d.ativo}
                  onChange={(e) => setDia(i, { fim: e.target.value })}
                  aria-label={`Fim de ${DIAS_DA_SEMANA[i]}`}
                />
              </div>
            );
          })}
        </section>

        <section className="grid gap-3 sm:grid-cols-4">
          <label className="block text-xs font-semibold text-ink-800">
            Duração (min)
            <input type="number" min={15} max={480} step={5} className="input mt-1 w-full" value={cfg.duracaoMin} onChange={(e) => num("duracaoMin", e.target.value)} />
          </label>
          <label className="block text-xs font-semibold text-ink-800">
            Intervalo (min)
            <input type="number" min={0} max={240} step={5} className="input mt-1 w-full" value={cfg.intervaloMin} onChange={(e) => num("intervaloMin", e.target.value)} />
          </label>
          <label className="block text-xs font-semibold text-ink-800">
            Ao mesmo tempo
            <input type="number" min={1} max={50} className="input mt-1 w-full" value={cfg.simultaneas} onChange={(e) => num("simultaneas", e.target.value)} />
          </label>
          <label className="block text-xs font-semibold text-ink-800">
            Antecedência (min)
            <input type="number" min={0} max={1440} step={15} className="input mt-1 w-full" value={cfg.antecedenciaMin} onChange={(e) => num("antecedenciaMin", e.target.value)} />
          </label>
          <p className="text-[11px] text-muted sm:col-span-4">
            Os horários andam de {cfg.duracaoMin + cfg.intervaloMin} em {cfg.duracaoMin + cfg.intervaloMin} minutos (duração mais intervalo).
            “Ao mesmo tempo” é quantas visitas a loja atende juntas. A antecedência vale para a IA oferecer horário de hoje.
          </p>
        </section>

        <section className="space-y-2 rounded-2xl border border-line p-3">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={cfg.lembrete.ativo}
              onChange={(e) => setCfg((c) => ({ ...c, lembrete: { ...c.lembrete, ativo: e.target.checked } }))}
            />
            Lembrete ao cliente na véspera
          </label>
          <p className="text-xs text-muted">
            Vai para os agendamentos confirmados de amanhã, entre 9h e 20h. Se o cliente escreveu nas últimas 24h, sai como mensagem
            normal; senão, só com um template aprovado. Sem template, a equipe recebe uma tarefa para lembrar o cliente.
          </p>
          <label className="block text-xs font-semibold text-ink-800">
            Template para fora da janela de 24h
            <select
              className="input mt-1 w-full"
              value={cfg.lembrete.templateName ?? ""}
              disabled={!cfg.lembrete.ativo}
              onChange={(e) => {
                const t = templates?.find((x) => x.name === e.target.value);
                setCfg((c) => ({
                  ...c,
                  lembrete: { ...c.lembrete, templateName: t?.name ?? null, templateLanguage: t?.language ?? null },
                }));
              }}
            >
              <option value="">Nenhum (avisar a equipe)</option>
              {cfg.lembrete.templateName && !escolhido && templates !== null && (
                <option value={cfg.lembrete.templateName}>{cfg.lembrete.templateName} (não aprovado agora)</option>
              )}
              {(templates ?? []).map((t) => (
                <option key={`${t.name}:${t.language}`} value={t.name}>
                  {t.name} · {t.language}
                </option>
              ))}
            </select>
          </label>
          {avisoTemplates && <p className="text-xs text-amber-700">{avisoTemplates}</p>}
          {escolhido && (
            <div className="rounded-xl bg-canvas p-2 text-xs">
              <p className="whitespace-pre-wrap text-ink-800">{escolhido.body}</p>
              {escolhido.headerFormat && escolhido.headerFormat !== "TEXT" && (
                <p className="mt-1 text-red-600">Este template tem mídia no cabeçalho: a agenda não tem o arquivo e o lembrete não sai.</p>
              )}
              {escolhido.variables > 5 && <p className="mt-1 text-red-600">Este template pede mais de 5 variáveis: a agenda preenche até 5.</p>}
            </div>
          )}
          <p className="text-[11px] text-muted">
            Variáveis do template, nesta ordem: {"{{1}}"} primeiro nome, {"{{2}}"} dia (ex.: sexta-feira, 13/11), {"{{3}}"} horário,{" "}
            {"{{4}}"} nome da loja, {"{{5}}"} carro.
          </p>
        </section>
      </Moldura>
    </form>
  );
}
