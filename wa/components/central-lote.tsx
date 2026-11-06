"use client";

// Barra das ações em lote, embaixo da fila: com várias conversas marcadas,
// atribuir a alguém da equipe, pôr uma etiqueta, encerrar ou devolver à IA.
// "Devolver à IA" só aparece quando a IA responderia (a mesma regra do botão
// da conversa); o servidor recusa do mesmo jeito.

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Bot, CheckSquare, Inbox, Loader2, Tag, UserRound, Users, XCircle } from "lucide-react";
import { corDaColuna } from "@wa/lib/stages";
import type { Etiqueta } from "@wa/lib/etiquetas";

type Membro = { email: string; name: string | null; role: "gestor" | "atendente" };

export type AcaoEmLote =
  | { acao: "atribuir"; email: string | null }
  | { acao: "etiqueta"; etiquetaId: string }
  | { acao: "encerrar" }
  | { acao: "devolver" };

function nomeDoMembro(m: { email: string; name: string | null }): string {
  return m.name || m.email.split("@")[0].replace(/[._-]/g, " ");
}

export function BarraDeLote({
  marcadas,
  visiveis,
  currentEmail,
  etiquetas,
  iaDisponivel,
  onTodas,
  onCancelar,
  onAcao,
}: {
  marcadas: number;
  visiveis: number;
  currentEmail: string;
  etiquetas: Etiqueta[];
  iaDisponivel: boolean;
  onTodas: () => void;
  onCancelar: () => void;
  /** Devolve a mensagem de sucesso, ou lança com o motivo. */
  onAcao: (a: AcaoEmLote) => Promise<string>;
}) {
  const [menu, setMenu] = useState<"atribuir" | "etiqueta" | null>(null);
  const [equipe, setEquipe] = useState<Membro[] | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; erro: boolean } | null>(null);

  useEffect(() => {
    if (menu !== "atribuir" || equipe) return;
    fetch("/api/wa/conversations/equipe")
      .then((r) => (r.ok ? r.json() : { equipe: [] }))
      .then((b) => setEquipe(b.equipe ?? []))
      .catch(() => setEquipe([]));
  }, [menu, equipe]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  async function fazer(a: AcaoEmLote, confirmar?: string) {
    if (confirmar && !confirm(confirmar)) return;
    setMenu(null);
    setOcupado(true);
    try {
      setAviso({ texto: await onAcao(a), erro: false });
    } catch (e) {
      setAviso({ texto: e instanceof Error ? e.message : "Não deu para fazer isso agora.", erro: true });
    } finally {
      setOcupado(false);
    }
  }

  const s = marcadas === 1 ? "" : "s";
  const travado = marcadas === 0 || ocupado;

  return (
    <div className="relative shrink-0 border-t border-line bg-paper p-3">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-ink-900">
          {ocupado ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 size={12} className="animate-spin" /> Aplicando…
            </span>
          ) : marcadas === 0 ? (
            "Marque as conversas"
          ) : (
            `${marcadas} selecionada${s}`
          )}
        </span>
        <span className="flex items-center gap-1">
          <button type="button" onClick={onTodas} className="flex items-center gap-1 rounded-lg px-1.5 py-1 font-semibold text-brand-700 hover:bg-canvas">
            <CheckSquare size={12} /> Todas ({visiveis})
          </button>
          <button type="button" onClick={onCancelar} className="rounded-lg px-1.5 py-1 text-muted hover:bg-canvas">
            Cancelar
          </button>
        </span>
      </div>

      {aviso && (
        <p className={clsx("mb-2 rounded-xl px-2.5 py-1.5 text-[11px]", aviso.erro ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700")}>
          {aviso.texto}
        </p>
      )}

      <div className={clsx("flex flex-wrap gap-1.5", travado && "pointer-events-none opacity-40")}>
        <button type="button" className="btn-ghost px-2.5 py-1.5 text-xs" onClick={() => setMenu(menu === "atribuir" ? null : "atribuir")}>
          <Users size={13} /> Atribuir
        </button>
        {etiquetas.length > 0 && (
          <button type="button" className="btn-ghost px-2.5 py-1.5 text-xs" onClick={() => setMenu(menu === "etiqueta" ? null : "etiqueta")}>
            <Tag size={13} /> Etiqueta
          </button>
        )}
        <button
          type="button"
          className="btn-ghost px-2.5 py-1.5 text-xs"
          onClick={() =>
            fazer({ acao: "encerrar" }, `Encerrar ${marcadas} conversa${s}? Se o cliente escrever de novo, ela volta para a fila.`)
          }
        >
          <XCircle size={13} /> Encerrar
        </button>
        {iaDisponivel && (
          <button
            type="button"
            className="btn-ghost px-2.5 py-1.5 text-xs"
            onClick={() => fazer({ acao: "devolver" }, `Devolver ${marcadas} conversa${s} para a IA continuar o atendimento?`)}
          >
            <Bot size={13} /> Devolver à IA
          </button>
        )}
      </div>

      {menu && (
        <>
          <button type="button" className="fixed inset-0 z-30 cursor-default" aria-label="Fechar" onClick={() => setMenu(null)} />
          <div className="absolute bottom-full left-3 right-3 z-40 mb-2 max-h-72 overflow-y-auto rounded-2xl border border-line bg-paper p-2 shadow-xl">
            {menu === "atribuir" ? (
              <>
                <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-muted">Quem continua o atendimento</p>
                {equipe === null ? (
                  <p className="flex items-center gap-2 px-2 py-2 text-xs text-muted">
                    <Loader2 size={12} className="animate-spin" /> Carregando a equipe…
                  </p>
                ) : (
                  equipe.map((m) => (
                    <button
                      key={m.email}
                      type="button"
                      onClick={() => fazer({ acao: "atribuir", email: m.email })}
                      className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-canvas"
                    >
                      <UserRound size={13} className="shrink-0 text-muted" />
                      <span className="min-w-0 flex-1 truncate capitalize">
                        {nomeDoMembro(m)}
                        {m.email === currentEmail ? " (você)" : ""}
                      </span>
                    </button>
                  ))
                )}
                <button
                  type="button"
                  onClick={() => fazer({ acao: "atribuir", email: null })}
                  className="mt-1 flex w-full items-center gap-2 rounded-xl border-t border-line px-2 pb-1 pt-2 text-left text-sm hover:bg-canvas"
                >
                  <Inbox size={13} className="shrink-0 text-muted" />
                  <span className="flex-1">Tirar o responsável (volta para a fila)</span>
                </button>
              </>
            ) : (
              <>
                <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-muted">Pôr a etiqueta</p>
                {etiquetas.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => fazer({ acao: "etiqueta", etiquetaId: e.id })}
                    className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-canvas"
                  >
                    <span className={clsx("h-2 w-2 shrink-0 rounded-full", corDaColuna(e.cor).dot)} />
                    <span className="min-w-0 flex-1 truncate">{e.nome}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
