"use client";

// Escolher a conversa de um agendamento ou de uma tarefa: busca pelo nome,
// telefone ou @ do contato (/api/wa/agenda/conversas) e mostra a escolhida
// com o botão para trocar. Usado nos modais da Agenda e das Tarefas.

import { useEffect, useState } from "react";
import { Loader2, MessageCircle, Search, X } from "lucide-react";
import { formatPhoneBr } from "@wa/lib/phone";

export type ConversaEscolhida = { id: string; nome: string | null; telefone: string | null };

export function BuscaConversa({
  valor,
  onChange,
  disabled,
}: {
  valor: ConversaEscolhida | null;
  onChange: (c: ConversaEscolhida | null) => void;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const [lista, setLista] = useState<ConversaEscolhida[]>([]);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (valor || q.trim().length < 2) {
      setLista([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setCarregando(true);
      try {
        const r = await fetch(`/api/wa/agenda/conversas?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal });
        const d = await r.json().catch(() => ({}));
        setLista(r.ok ? (d.conversas ?? []) : []);
      } catch {
        // Busca cancelada pela digitação seguinte.
      } finally {
        if (!ctrl.signal.aborted) setCarregando(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, valor]);

  if (valor) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-line px-3 py-2 text-sm">
        <MessageCircle size={14} className="shrink-0 text-brand-700" />
        <span className="min-w-0 flex-1 truncate">
          {valor.nome || "Contato sem nome"}
          {valor.telefone && <span className="text-muted"> · {formatPhoneBr(valor.telefone)}</span>}
        </span>
        {!disabled && (
          <button type="button" className="rounded-full p-1 text-muted hover:bg-canvas" onClick={() => onChange(null)} aria-label="Trocar a conversa">
            <X size={14} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <Search size={14} className="pointer-events-none absolute left-3 top-[1.15rem] -translate-y-1/2 text-muted" />
      <input
        className="input w-full py-2 pl-8 text-sm"
        placeholder="Buscar conversa por nome, telefone ou @"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        disabled={disabled}
      />
      {carregando && <Loader2 size={14} className="absolute right-3 top-[1.15rem] -translate-y-1/2 animate-spin text-muted" />}
      {lista.length > 0 && (
        <ul className="mt-1 max-h-48 overflow-y-auto rounded-2xl border border-line bg-paper py-1 shadow-lg">
          {lista.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-canvas"
                onClick={() => {
                  onChange(c);
                  setQ("");
                }}
              >
                <span className="min-w-0 flex-1 truncate">{c.nome || "Contato sem nome"}</span>
                {c.telefone && <span className="shrink-0 text-xs text-muted">{formatPhoneBr(c.telefone)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!carregando && q.trim().length >= 2 && lista.length === 0 && (
        <p className="mt-1 text-xs text-muted">Nenhuma conversa com esse nome ou número.</p>
      )}
    </div>
  );
}
