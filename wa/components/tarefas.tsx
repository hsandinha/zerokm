"use client";

// Tarefas da equipe da loja: o que alguém precisa fazer, com prazo e
// responsável, ligado (ou não) a uma conversa. Abas: abertas, minhas,
// atrasadas e feitas. Criar e editar abrem em modal.
//
// Também chegam tarefas sozinhas: o lembrete da véspera que não pôde sair
// (janela de 24h fechada e sem template) e a IA quando o cliente pede foto
// de um carro que ainda não tem.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { CalendarClock, ListChecks, Loader2, MessageCircle, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useWaPanel } from "@wa/components/wa-panel";
import { BuscaConversa, type ConversaEscolhida } from "@wa/components/busca-conversa";
import { dataLocal, horaLocal, hojeEmSaoPaulo, rotuloDoDia, somarDias } from "@wa/lib/agenda";
import type { FiltroTarefas, TarefaDaTela } from "@wa/lib/tarefas";

type Membro = { email: string; name: string | null };

const ABAS: Array<{ chave: FiltroTarefas; rotulo: string }> = [
  { chave: "abertas", rotulo: "Abertas" },
  { chave: "minhas", rotulo: "Minhas" },
  { chave: "atrasadas", rotulo: "Atrasadas" },
  { chave: "feitas", rotulo: "Feitas" },
];

function prazoLegivel(iso: string): string {
  const d = new Date(iso);
  const dia = dataLocal(d);
  const hoje = hojeEmSaoPaulo();
  const quando = dia === hoje ? "hoje" : dia === somarDias(hoje, 1) ? "amanhã" : dia === somarDias(hoje, -1) ? "ontem" : rotuloDoDia(dia);
  return `${quando}, ${horaLocal(d)}`;
}

/** ISO → valor do <input type="datetime-local"> (Brasília). */
const paraInput = (iso: string | null) => (iso ? `${dataLocal(new Date(iso))}T${horaLocal(new Date(iso))}` : "");

export function Tarefas({ me }: { me: string }) {
  const { base } = useWaPanel();
  const [aba, setAba] = useState<FiltroTarefas>("abertas");
  const [tarefas, setTarefas] = useState<TarefaDaTela[] | null>(null);
  const [contagem, setContagem] = useState<{ abertas: number; minhas: number; atrasadas: number } | null>(null);
  const [equipe, setEquipe] = useState<Membro[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [edicao, setEdicao] = useState<TarefaDaTela | "nova" | null>(null);

  const carregar = useCallback(() => {
    fetch(`/api/wa/tarefas?filtro=${aba}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error ?? "Falha ao carregar as tarefas");
        setTarefas(d.tarefas ?? []);
        setContagem(d.contagem ?? null);
      })
      .catch((e: Error) => {
        setErro(e.message);
        setTarefas([]);
      });
  }, [aba]);
  useEffect(carregar, [carregar]);

  useEffect(() => {
    fetch("/api/wa/conversations/equipe")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setEquipe(d?.equipe ?? []))
      .catch(() => {});
  }, []);

  async function alternar(t: TarefaDaTela) {
    setTarefas((l) => l?.map((x) => (x.id === t.id ? { ...x, feita: !t.feita } : x)) ?? null);
    const r = await fetch(`/api/wa/tarefas/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feita: !t.feita }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setErro(d.error ?? "Não deu para atualizar a tarefa.");
    }
    carregar();
  }

  const nomeDe = (email: string | null) => {
    if (!email) return null;
    if (email === me) return "você";
    const m = equipe.find((x) => x.email === email);
    return m?.name || email.split("@")[0];
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <ListChecks size={20} className="text-brand-700" /> Tarefas
          </h1>
          <p className="text-sm text-muted">O que a equipe precisa fazer, com prazo e responsável.</p>
        </div>
        <button className="btn-dark px-3 py-1.5 text-sm" onClick={() => setEdicao("nova")}>
          <Plus size={14} /> Nova tarefa
        </button>
      </div>

      {erro && (
        <p className="flex items-start justify-between gap-3 rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
          <button onClick={() => setErro(null)} aria-label="Fechar aviso">
            <X size={14} />
          </button>
        </p>
      )}

      <div className="flex flex-wrap gap-1">
        {ABAS.map((a) => {
          const n = a.chave === "feitas" ? null : contagem?.[a.chave as "abertas" | "minhas" | "atrasadas"];
          return (
            <button
              key={a.chave}
              onClick={() => setAba(a.chave)}
              className={clsx(
                "rounded-full px-3 py-1.5 text-xs font-semibold",
                aba === a.chave ? "pill-active" : "border border-line bg-paper text-muted",
              )}
            >
              {a.rotulo}
              {n != null && n > 0 && (
                <span className={clsx("ml-1", a.chave === "atrasadas" && aba !== a.chave && "text-red-600")}>({n})</span>
              )}
            </button>
          );
        })}
      </div>

      {tarefas === null ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Loader2 size={14} className="animate-spin" /> Carregando…
        </p>
      ) : tarefas.length === 0 ? (
        <p className="card text-sm text-muted">
          {aba === "feitas" ? "Nenhuma tarefa feita ainda." : aba === "atrasadas" ? "Nada atrasado." : "Nenhuma tarefa aberta."}
        </p>
      ) : (
        <ul className="space-y-2">
          {tarefas.map((t) => {
            const atrasada = !t.feita && !!t.prazo && new Date(t.prazo).getTime() < Date.now();
            return (
              <li key={t.id} className={clsx("card flex items-start gap-3 p-3 text-sm", t.feita && "opacity-60")}>
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 shrink-0"
                  checked={t.feita}
                  onChange={() => alternar(t)}
                  aria-label={t.feita ? "Reabrir a tarefa" : "Marcar como feita"}
                />
                <div className="min-w-0 flex-1">
                  <p className={clsx("font-semibold", t.feita && "line-through")}>
                    {t.titulo}
                    {t.origem !== "equipe" && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-canvas px-1.5 py-0.5 align-middle text-[10px] font-semibold text-muted">
                        <Sparkles size={10} /> {t.origem === "ia" ? "da IA" : "da agenda"}
                      </span>
                    )}
                  </p>
                  {t.descricao && <p className="mt-0.5 line-clamp-2 text-xs text-ink-700">{t.descricao}</p>}
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                    {t.prazo && (
                      <span className={clsx("inline-flex items-center gap-1", atrasada && "font-semibold text-red-600")}>
                        <CalendarClock size={12} /> {atrasada ? "Atrasada: " : ""}
                        {prazoLegivel(t.prazo)}
                      </span>
                    )}
                    <span>{nomeDe(t.responsavel) ? `Com ${nomeDe(t.responsavel)}` : "Qualquer um da equipe"}</span>
                    {t.feita && t.feitaEm && <span>Feita {prazoLegivel(t.feitaEm)}{t.feitaPor ? ` por ${nomeDe(t.feitaPor)}` : ""}</span>}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {t.conversationId && (
                    <Link
                      href={`${base}/central?c=${t.conversationId}`}
                      className="btn-ghost max-w-[10rem] px-2 py-1 text-xs"
                      title="Abrir a conversa"
                    >
                      <MessageCircle size={13} /> <span className="truncate">{t.contatoNome || "Conversa"}</span>
                    </Link>
                  )}
                  <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEdicao(t)} title="Editar">
                    <Pencil size={13} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {edicao && (
        <TarefaModal
          tarefa={edicao === "nova" ? null : edicao}
          equipe={equipe}
          me={me}
          onClose={() => setEdicao(null)}
          onSaved={() => {
            setEdicao(null);
            carregar();
          }}
        />
      )}
    </div>
  );
}

function TarefaModal({
  tarefa,
  equipe,
  me,
  onClose,
  onSaved,
}: {
  tarefa: TarefaDaTela | null;
  equipe: Membro[];
  me: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [titulo, setTitulo] = useState(tarefa?.titulo ?? "");
  const [descricao, setDescricao] = useState(tarefa?.descricao ?? "");
  const [prazo, setPrazo] = useState(paraInput(tarefa?.prazo ?? null));
  const [responsavel, setResponsavel] = useState(tarefa ? (tarefa.responsavel ?? "") : me);
  const [conversa, setConversa] = useState<ConversaEscolhida | null>(
    tarefa?.conversationId ? { id: tarefa.conversationId, nome: tarefa.contatoNome, telefone: null } : null,
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo.trim() || salvando) return;
    setSalvando(true);
    setErro(null);
    const r = await fetch(tarefa ? `/api/wa/tarefas/${tarefa.id}` : "/api/wa/tarefas", {
      method: tarefa ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titulo, descricao, prazo, responsavel, conversationId: conversa?.id ?? "" }),
    });
    const d = await r.json().catch(() => ({}));
    setSalvando(false);
    if (!r.ok) return setErro(d.error ?? "Falha ao salvar");
    onSaved();
  }

  async function excluir() {
    if (!tarefa) return;
    setSalvando(true);
    const r = await fetch(`/api/wa/tarefas/${tarefa.id}`, { method: "DELETE" });
    setSalvando(false);
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      return setErro(d.error ?? "Falha ao excluir");
    }
    onSaved();
  }

  const atalho = (dias: number, hora: string) => setPrazo(`${somarDias(hojeEmSaoPaulo(), dias)}T${hora}`);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="Fechar" onClick={onClose} />
      <form
        onSubmit={salvar}
        className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-line bg-paper shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">{tarefa ? "Editar tarefa" : "Nova tarefa"}</p>
            <p className="mt-0.5 text-xs text-muted">Ligue a uma conversa para abrir o cliente direto da tarefa.</p>
          </div>
          <button type="button" className="rounded-full p-1.5 text-muted hover:bg-canvas" onClick={onClose} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <label className="block text-xs font-semibold text-ink-800">
            O que fazer
            <input
              className="input mt-1 w-full"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              maxLength={200}
              autoFocus
              placeholder="Ex.: Ligar para o Carlos sobre o financiamento"
              required
            />
          </label>
          <label className="block text-xs font-semibold text-ink-800">
            Detalhes
            <textarea className="input mt-1 w-full" rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={2000} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-ink-800">
              Prazo
              <input type="datetime-local" className="input mt-1 w-full" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
              <span className="mt-1 flex flex-wrap gap-1 font-normal">
                <button type="button" className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted" onClick={() => atalho(0, "18:00")}>
                  Hoje
                </button>
                <button type="button" className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted" onClick={() => atalho(1, "10:00")}>
                  Amanhã
                </button>
                <button type="button" className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted" onClick={() => atalho(7, "10:00")}>
                  Em 1 semana
                </button>
                {prazo && (
                  <button type="button" className="rounded-full px-2 py-0.5 text-[11px] text-muted underline" onClick={() => setPrazo("")}>
                    Sem prazo
                  </button>
                )}
              </span>
            </label>
            <label className="block text-xs font-semibold text-ink-800">
              Responsável
              <select className="input mt-1 w-full" value={responsavel} onChange={(e) => setResponsavel(e.target.value)}>
                <option value="">Qualquer um da equipe</option>
                {[...equipe, ...(responsavel && !equipe.some((m) => m.email === responsavel) ? [{ email: responsavel, name: null }] : [])].map(
                  (m) => (
                    <option key={m.email} value={m.email}>
                      {m.email === me ? `${m.name || m.email} (você)` : m.name || m.email}
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-ink-800">Conversa (opcional)</p>
            <BuscaConversa valor={conversa} onChange={setConversa} disabled={salvando} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
          {tarefa && !confirmarExclusao && (
            <button type="button" className="btn-ghost px-3 py-2 text-xs text-red-600" onClick={() => setConfirmarExclusao(true)}>
              <Trash2 size={13} /> Excluir
            </button>
          )}
          {confirmarExclusao && (
            <span className="flex items-center gap-2 text-xs">
              Excluir a tarefa?
              <button type="button" className="btn-ghost px-2 py-1 text-xs text-red-600" onClick={excluir} disabled={salvando}>
                Excluir
              </button>
              <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setConfirmarExclusao(false)}>
                Não
              </button>
            </span>
          )}
          <span className="min-w-0 flex-1 text-xs text-red-600">{erro}</span>
          <button type="button" className="btn-ghost px-4 py-2 text-xs" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn-dark px-4 py-2 text-xs" disabled={!titulo.trim() || salvando}>
            {salvando ? <Loader2 size={13} className="animate-spin" /> : null} Salvar
          </button>
        </div>
      </form>
    </div>
  );
}
