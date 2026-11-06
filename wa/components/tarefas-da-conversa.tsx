"use client";

// Tarefas da conversa, no painel ao lado da Central: as abertas, concluir com
// um clique e "Nova tarefa" em modal. A lista completa fica em Tarefas
// (/dashboard/atendimento/tarefas); aqui é o atalho de quem está atendendo.

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { CheckCircle2, Circle, ListChecks, Plus, X } from "lucide-react";

type Tarefa = {
  id: string;
  titulo: string;
  prazo: string | null;
  responsavel: string | null;
  feita: boolean;
};

type Membro = { email: string; name: string | null };

function quando(iso: string | null): string {
  if (!iso) return "sem prazo";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function TarefasDaConversa({ conversationId }: { conversationId: string }) {
  const [tarefas, setTarefas] = useState<Tarefa[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(async () => {
    const res = await fetch(`/api/wa/conversations/${conversationId}/tarefas`).catch(() => null);
    if (!res?.ok) {
      setTarefas([]);
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { tarefas?: Tarefa[] };
    setTarefas(body.tarefas ?? []);
  }, [conversationId]);

  useEffect(() => {
    setTarefas(null);
    carregar();
  }, [carregar]);

  async function concluir(t: Tarefa) {
    setErro(null);
    const res = await fetch(`/api/wa/tarefas/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feita: !t.feita }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setErro(body.error ?? "Não foi possível atualizar a tarefa.");
    }
    await carregar();
  }

  const abertas = (tarefas ?? []).filter((t) => !t.feita);

  return (
    <div className="border-t border-line pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <ListChecks size={13} /> Tarefas
        </p>
        <button
          className="flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:underline"
          onClick={() => setCriando(true)}
        >
          <Plus size={12} /> Nova tarefa
        </button>
      </div>
      {erro && <p className="mt-1 text-[11px] text-red-600">{erro}</p>}
      {tarefas === null ? (
        <p className="mt-1 text-xs text-muted">Carregando…</p>
      ) : abertas.length === 0 ? (
        <p className="mt-1 text-xs text-muted">Nenhuma tarefa aberta nesta conversa.</p>
      ) : (
        <ul className="mt-1.5 space-y-1.5">
          {abertas.map((t) => {
            const atrasada = t.prazo != null && new Date(t.prazo).getTime() < Date.now();
            return (
              <li key={t.id} className="flex items-start gap-2 text-xs">
                <button
                  className="mt-0.5 shrink-0 text-muted hover:text-emerald-600"
                  title="Marcar como feita"
                  aria-label={`Marcar "${t.titulo}" como feita`}
                  onClick={() => concluir(t)}
                >
                  {t.feita ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                </button>
                <span className="min-w-0 flex-1">
                  <span className="block text-ink-900">{t.titulo}</span>
                  <span className={clsx("text-[11px]", atrasada ? "font-semibold text-red-600" : "text-muted")}>
                    {quando(t.prazo)}
                    {t.responsavel ? ` · ${t.responsavel.split("@")[0]}` : ""}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {criando && (
        <NovaTarefa
          conversationId={conversationId}
          onClose={() => setCriando(false)}
          onCriada={async () => {
            setCriando(false);
            await carregar();
          }}
        />
      )}
    </div>
  );
}

function NovaTarefa({
  conversationId,
  onClose,
  onCriada,
}: {
  conversationId: string;
  onClose: () => void;
  onCriada: () => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [prazo, setPrazo] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [equipe, setEquipe] = useState<Membro[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/wa/conversations/equipe")
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { equipe?: Membro[]; me?: string } | null) => {
        setEquipe(b?.equipe ?? []);
        if (b?.me) setResponsavel(b.me);
      })
      .catch(() => {});
  }, []);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo.trim() || salvando) return;
    setSalvando(true);
    setErro(null);
    // datetime-local vem sem fuso: a rota lê como horário de Brasília.
    const res = await fetch(`/api/wa/conversations/${conversationId}/tarefas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titulo: titulo.trim(),
        prazo: prazo || undefined,
        responsavel: responsavel || undefined,
      }),
    });
    setSalvando(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setErro(body.error ?? "Não foi possível criar a tarefa.");
      return;
    }
    onCriada();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-black/50" aria-label="Fechar" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-line bg-paper shadow-2xl sm:rounded-3xl">
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Nova tarefa</p>
            <p className="mt-0.5 text-xs text-muted">Fica ligada a esta conversa e aparece em Tarefas.</p>
          </div>
          <button className="rounded-full p-1.5 text-muted hover:bg-canvas" onClick={onClose} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
        <form className="space-y-4 overflow-y-auto px-5 py-4" onSubmit={salvar}>
          <label className="block text-xs font-semibold text-ink-800">
            O que fazer
            <input
              className="input mt-1 w-full"
              value={titulo}
              maxLength={160}
              autoFocus
              placeholder="Ex.: Ligar para confirmar a avaliação do usado"
              onChange={(e) => setTitulo(e.target.value)}
            />
          </label>
          <label className="block text-xs font-semibold text-ink-800">
            Prazo
            <input
              type="datetime-local"
              className="input mt-1 w-full"
              value={prazo}
              onChange={(e) => setPrazo(e.target.value)}
            />
          </label>
          {equipe.length > 0 && (
            <label className="block text-xs font-semibold text-ink-800">
              Responsável
              <select
                className="input mt-1 w-full"
                value={responsavel}
                onChange={(e) => setResponsavel(e.target.value)}
              >
                {equipe.map((m) => (
                  <option key={m.email} value={m.email}>
                    {m.name ?? m.email}
                  </option>
                ))}
              </select>
            </label>
          )}
          {erro && <p className="text-xs text-red-600">{erro}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-ghost px-4 py-2 text-xs" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-dark px-4 py-2 text-xs" disabled={!titulo.trim() || salvando}>
              {salvando ? "Criando…" : "Criar tarefa"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
