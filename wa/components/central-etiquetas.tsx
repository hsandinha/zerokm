"use client";

// Etiquetas na Central: o selo na fila, o seletor da conversa (pôr e tirar)
// e o cadastro da gestão (criar, renomear, trocar a cor, apagar). A paleta é
// a mesma das colunas do funil.

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Check, Loader2, Plus, Settings2, Tag, Trash2, X } from "lucide-react";
import { COLUNA_CORES, corDaColuna } from "@wa/lib/stages";
import { NOME_MAX, type Etiqueta } from "@wa/lib/etiquetas";

export function EtiquetaChip({ etiqueta }: { etiqueta: Pick<Etiqueta, "nome" | "cor"> }) {
  return (
    <span
      className={clsx(
        "inline-flex max-w-[8rem] items-center gap-1 truncate rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
        corDaColuna(etiqueta.cor).chip,
      )}
      title={etiqueta.nome}
    >
      <Tag size={9} className="shrink-0" />
      <span className="truncate">{etiqueta.nome}</span>
    </span>
  );
}

/** Lista para marcar e desmarcar as etiquetas da conversa aberta. */
export function SeletorDeEtiquetas({
  etiquetas,
  aplicadas,
  podeEditar,
  onToggle,
  onGerenciar,
  onClose,
}: {
  etiquetas: Etiqueta[];
  aplicadas: string[];
  podeEditar: boolean;
  onToggle: (etiqueta: Etiqueta, aplicar: boolean) => Promise<void>;
  onGerenciar: () => void;
  onClose: () => void;
}) {
  const [ocupada, setOcupada] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <button type="button" className="fixed inset-0 z-30 cursor-default" aria-label="Fechar etiquetas" onClick={onClose} />
      <div className="absolute right-0 top-full z-40 mt-2 w-64 rounded-2xl border border-line bg-paper p-2 shadow-xl">
        <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-muted">Etiquetas da conversa</p>
        {etiquetas.length === 0 ? (
          <p className="px-2 py-2 text-xs text-muted">
            {podeEditar ? "Nenhuma etiqueta ainda. Crie as da loja em Gerenciar." : "A gestão ainda não criou etiquetas."}
          </p>
        ) : (
          <div className="max-h-64 space-y-0.5 overflow-y-auto">
            {etiquetas.map((e) => {
              const tem = aplicadas.includes(e.id);
              return (
                <button
                  key={e.id}
                  type="button"
                  disabled={ocupada !== null}
                  onClick={async () => {
                    setOcupada(e.id);
                    await onToggle(e, !tem);
                    setOcupada(null);
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-canvas"
                >
                  <span
                    className={clsx(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                      tem ? "border-brand-500 bg-brand-500 text-ink-950" : "border-line bg-paper",
                    )}
                  >
                    {ocupada === e.id ? <Loader2 size={10} className="animate-spin" /> : tem && <Check size={11} />}
                  </span>
                  <span className={clsx("h-2 w-2 shrink-0 rounded-full", corDaColuna(e.cor).dot)} />
                  <span className="min-w-0 flex-1 truncate">{e.nome}</span>
                </button>
              );
            })}
          </div>
        )}
        {podeEditar && (
          <button
            type="button"
            onClick={onGerenciar}
            className="mt-1 flex w-full items-center gap-1.5 rounded-xl border-t border-line px-2 pb-1 pt-2 text-left text-xs font-semibold text-brand-700 hover:underline"
          >
            <Settings2 size={12} /> Gerenciar etiquetas
          </button>
        )}
      </div>
    </>
  );
}

function SeletorDeCor({ cor, onChange }: { cor: string; onChange: (cor: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {Object.entries(COLUNA_CORES).map(([chave, c]) => (
        <button
          key={chave}
          type="button"
          onClick={() => onChange(chave)}
          className={clsx(
            "flex h-6 w-6 items-center justify-center rounded-full border-2",
            cor === chave ? "border-ink-900" : "border-transparent",
          )}
          title={c.label}
          aria-label={c.label}
        >
          <span className={clsx("h-3.5 w-3.5 rounded-full", c.dot)} />
        </button>
      ))}
    </div>
  );
}

/** Cadastro das etiquetas da loja (só a gestão abre). */
export function GerenciarEtiquetas({
  etiquetas,
  onClose,
  onChanged,
}: {
  etiquetas: Etiqueta[];
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState("azul");
  const [editando, setEditando] = useState<{ id: string; nome: string; cor: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function chamar(url: string, method: string, body?: unknown): Promise<boolean> {
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        setErro(b.error ?? "Não deu para salvar.");
        return false;
      }
      await onChanged();
      return true;
    } finally {
      setSalvando(false);
    }
  }

  async function criar() {
    if (!nome.trim()) return;
    if (await chamar("/api/wa/conversations/etiquetas", "POST", { nome, cor })) setNome("");
  }

  async function salvarEdicao() {
    if (!editando) return;
    if (await chamar(`/api/wa/conversations/etiquetas/${editando.id}`, "PATCH", editando)) setEditando(null);
  }

  async function apagar(e: Etiqueta) {
    const n = e.conversas ?? 0;
    if (!confirm(`Apagar a etiqueta "${e.nome}"?${n ? ` Ela sai de ${n} conversa${n === 1 ? "" : "s"}.` : ""}`)) return;
    await chamar(`/api/wa/conversations/etiquetas/${e.id}`, "DELETE");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-black/50" aria-label="Fechar" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-line bg-paper shadow-2xl sm:rounded-3xl">
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
            <Tag size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Etiquetas da loja</p>
            <p className="truncate text-xs text-muted">Para separar as conversas: VIP, Financiamento, Troca…</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-muted hover:bg-canvas" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="space-y-2 rounded-2xl border border-line p-3">
            <label className="label">Nova etiqueta</label>
            <div className="flex gap-2">
              <input
                className="input py-2 text-sm"
                placeholder="Ex.: Financiamento"
                value={nome}
                maxLength={NOME_MAX}
                onChange={(e) => setNome(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && criar()}
              />
              <button className="btn-primary shrink-0 px-3 py-2 text-xs" onClick={criar} disabled={salvando || !nome.trim()}>
                {salvando && !editando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Criar
              </button>
            </div>
            <SeletorDeCor cor={cor} onChange={setCor} />
          </div>

          {erro && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{erro}</p>}

          {etiquetas.length === 0 ? (
            <p className="text-xs text-muted">Nenhuma etiqueta ainda.</p>
          ) : (
            <ul className="space-y-1">
              {etiquetas.map((e) =>
                editando?.id === e.id ? (
                  <li key={e.id} className="space-y-2 rounded-2xl border border-brand-300 p-3">
                    <input
                      className="input py-2 text-sm"
                      value={editando.nome}
                      maxLength={NOME_MAX}
                      autoFocus
                      onChange={(ev) => setEditando({ ...editando, nome: ev.target.value })}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter") salvarEdicao();
                        if (ev.key === "Escape") setEditando(null);
                      }}
                    />
                    <SeletorDeCor cor={editando.cor} onChange={(c) => setEditando({ ...editando, cor: c })} />
                    <div className="flex justify-end gap-2">
                      <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setEditando(null)} disabled={salvando}>
                        Cancelar
                      </button>
                      <button className="btn-primary px-3 py-1.5 text-xs" onClick={salvarEdicao} disabled={salvando}>
                        {salvando ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Salvar
                      </button>
                    </div>
                  </li>
                ) : (
                  <li key={e.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-canvas">
                    <span className={clsx("h-2.5 w-2.5 shrink-0 rounded-full", corDaColuna(e.cor).dot)} />
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left text-sm"
                      onClick={() => setEditando({ id: e.id, nome: e.nome, cor: e.cor })}
                      title="Editar"
                    >
                      {e.nome}
                    </button>
                    <span className="text-[11px] tabular-nums text-muted">{e.conversas ?? 0}</span>
                    <button
                      type="button"
                      className="rounded-full p-1 text-muted hover:bg-paper hover:text-red-600"
                      onClick={() => apagar(e)}
                      disabled={salvando}
                      title="Apagar"
                      aria-label={`Apagar ${e.nome}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                ),
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
