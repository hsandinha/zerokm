"use client";

// Respostas rápidas na Central: o botão do campo abre a lista, e digitar "/"
// no começo da mensagem filtra pelo atalho (como no Chatrun). O {{nome}} vira
// o primeiro nome do contato na hora de inserir. Quem gerencia é o gestor,
// num modal aberto da própria lista.

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { Loader2, Pencil, Plus, Settings2, Trash2, X, Zap } from "lucide-react";
import { normalizarAtalho, type RespostaRapida } from "@wa/lib/respostas";

export function useRespostasRapidas() {
  const [respostas, setRespostas] = useState<RespostaRapida[]>([]);
  const [podeEditar, setPodeEditar] = useState(false);
  const [carregado, setCarregado] = useState(false);

  const recarregar = useCallback(async () => {
    try {
      const r = await fetch("/api/wa/respostas-rapidas");
      if (!r.ok) return;
      const body = await r.json();
      setRespostas(body.respostas ?? []);
      setPodeEditar(Boolean(body.podeEditar));
    } catch {
      /* rede oscilou: a lista volta na próxima abertura */
    } finally {
      setCarregado(true);
    }
  }, []);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  return { respostas, podeEditar, carregado, recarregar };
}

/** Lista que abre acima do campo. `ativo` é o item destacado pelo teclado. */
export function RespostasPopover({
  lista,
  ativo,
  termo,
  carregado,
  podeEditar,
  onPick,
  onHover,
  onGerenciar,
  onClose,
}: {
  lista: RespostaRapida[];
  ativo: number;
  termo: string | null;
  carregado: boolean;
  podeEditar: boolean;
  onPick: (r: RespostaRapida) => void;
  onHover: (i: number) => void;
  onGerenciar: () => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute bottom-full left-0 right-0 z-30 mb-2 overflow-hidden rounded-2xl border border-line bg-paper shadow-xl">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <Zap size={13} className="text-brand-700" />
        <p className="flex-1 text-xs font-semibold">
          Respostas rápidas
          {termo ? <span className="ml-1 font-normal text-muted">/{termo}</span> : null}
        </p>
        {podeEditar && (
          <button type="button" onClick={onGerenciar} className="flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:underline">
            <Settings2 size={12} /> Gerenciar
          </button>
        )}
        <button type="button" onClick={onClose} className="rounded-full p-0.5 text-muted hover:bg-canvas" aria-label="Fechar">
          <X size={13} />
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto p-1">
        {!carregado ? (
          <p className="flex items-center gap-2 px-3 py-3 text-xs text-muted">
            <Loader2 size={12} className="animate-spin" /> Carregando…
          </p>
        ) : lista.length === 0 ? (
          <p className="px-3 py-3 text-xs text-muted">
            {termo
              ? "Nenhuma resposta com esse atalho."
              : podeEditar
                ? "Nenhuma resposta rápida ainda. Crie em Gerenciar."
                : "Nenhuma resposta rápida ainda. Peça a um gestor para criar."}
          </p>
        ) : (
          lista.map((r, i) => (
            <button
              key={r.id}
              type="button"
              onMouseEnter={() => onHover(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(r)}
              className={clsx("flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left", i === ativo ? "bg-brand-100" : "hover:bg-canvas")}
            >
              <code className="mt-0.5 shrink-0 rounded bg-brand-50 px-1.5 py-0.5 text-[11px] text-brand-700">/{r.shortcut}</code>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">{r.title}</span>
                  {r.category && <span className="shrink-0 rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-800">{r.category}</span>}
                </span>
                <span className="line-clamp-2 block text-[11px] text-muted">{r.text}</span>
              </span>
            </button>
          ))
        )}
      </div>
      <p className="border-t border-line px-3 py-1.5 text-[10px] text-muted">
        ↑↓ escolhe · Enter insere · {"{{nome}}"} vira o primeiro nome do cliente
      </p>
    </div>
  );
}

type Rascunho = { id: string | null; title: string; shortcut: string; text: string; category: string };
const VAZIO: Rascunho = { id: null, title: "", shortcut: "", text: "", category: "" };

export function GerenciarRespostas({
  respostas,
  onClose,
  onChanged,
}: {
  respostas: RespostaRapida[];
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const [form, setForm] = useState<Rascunho | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (!form) return;
    setSalvando(true);
    setErro(null);
    const res = await fetch(form.id ? `/api/wa/respostas-rapidas/${form.id}` : "/api/wa/respostas-rapidas", {
      method: form.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: form.title, shortcut: form.shortcut, text: form.text, category: form.category }),
    });
    const body = await res.json().catch(() => ({}));
    setSalvando(false);
    if (!res.ok) {
      setErro(body.error ?? "Falha ao salvar");
      return;
    }
    setForm(null);
    await onChanged();
  }

  async function apagar(r: RespostaRapida) {
    if (!confirm(`Apagar a resposta "${r.title}"?`)) return;
    const res = await fetch(`/api/wa/respostas-rapidas/${r.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setErro(body.error ?? "Falha ao apagar");
      return;
    }
    await onChanged();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-black/50" aria-label="Fechar" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-line bg-paper shadow-2xl sm:rounded-3xl">
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
            <Zap size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Respostas rápidas</p>
            <p className="truncate text-xs text-muted">Textos prontos da equipe. Digite / no campo de mensagem para usar.</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-muted hover:bg-canvas" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {form ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">Título</label>
                  <input
                    className="input"
                    placeholder="Ex.: Boas-vindas"
                    value={form.title}
                    maxLength={80}
                    autoFocus
                    onChange={(e) =>
                      setForm((f) =>
                        f && {
                          ...f,
                          title: e.target.value,
                          // Sugere o atalho pelo título até a pessoa mexer nele.
                          shortcut: f.id || f.shortcut !== normalizarAtalho(f.title) ? f.shortcut : normalizarAtalho(e.target.value),
                        },
                      )
                    }
                  />
                </div>
                <div>
                  <label className="label">Atalho</label>
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-muted">/</span>
                    <input
                      className="input"
                      placeholder="boasvindas"
                      value={form.shortcut}
                      maxLength={30}
                      onChange={(e) => setForm((f) => f && { ...f, shortcut: normalizarAtalho(e.target.value) })}
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="label">Categoria (opcional)</label>
                <input
                  className="input"
                  placeholder="Ex.: Financiamento"
                  value={form.category}
                  maxLength={40}
                  onChange={(e) => setForm((f) => f && { ...f, category: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Texto</label>
                <textarea
                  className="input min-h-[8rem] resize-y text-sm"
                  placeholder="Oi {{nome}}, tudo bem? Aqui é da loja..."
                  value={form.text}
                  maxLength={4000}
                  onChange={(e) => setForm((f) => f && { ...f, text: e.target.value })}
                />
                <p className="mt-1 text-[11px] text-muted">
                  Use <code className="rounded bg-brand-50 px-1 text-brand-700">{"{{nome}}"}</code> para o primeiro nome do
                  cliente. Sem nome conhecido, ele some do texto.
                </p>
              </div>
              {erro && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{erro}</p>}
              <div className="flex justify-end gap-2">
                <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setForm(null)}>
                  Cancelar
                </button>
                <button className="btn-primary px-4 py-1.5 text-xs" disabled={salvando} onClick={salvar}>
                  {salvando && <Loader2 size={14} className="animate-spin" />} Salvar
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {erro && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{erro}</p>}
              {respostas.length === 0 && (
                <p className="rounded-xl bg-canvas px-4 py-6 text-center text-sm text-muted">
                  Nenhuma resposta rápida ainda. Crie as mensagens que a equipe repete todo dia.
                </p>
              )}
              {respostas.map((r) => (
                <div key={r.id} className="flex items-start gap-3 rounded-2xl border border-line px-3 py-2.5">
                  <code className="mt-0.5 shrink-0 rounded bg-brand-50 px-1.5 py-0.5 text-[11px] text-brand-700">/{r.shortcut}</code>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <span className="truncate">{r.title}</span>
                      {r.category && <span className="shrink-0 rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] font-normal text-ink-800">{r.category}</span>}
                    </p>
                    <p className="line-clamp-2 text-xs text-muted">{r.text}</p>
                  </div>
                  <button
                    className="rounded-full p-1.5 text-muted hover:bg-canvas"
                    title="Editar"
                    onClick={() => setForm({ id: r.id, title: r.title, shortcut: r.shortcut, text: r.text, category: r.category ?? "" })}
                  >
                    <Pencil size={14} />
                  </button>
                  <button className="rounded-full p-1.5 text-muted hover:bg-red-50 hover:text-red-600" title="Apagar" onClick={() => apagar(r)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {!form && (
          <div className="flex justify-end border-t border-line px-5 py-3">
            <button className="btn-primary px-4 py-1.5 text-xs" onClick={() => setForm(VAZIO)}>
              <Plus size={14} /> Nova resposta
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
