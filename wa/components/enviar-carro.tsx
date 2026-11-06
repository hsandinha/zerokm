"use client";

// "Enviar carro" na Central: busca no estoque que a IA da loja vende (as
// mesmas regras de visibilidade: carro do pátio só se estiver disponível) e
// manda o carro. Do pátio vão até 3 fotos (a capa primeiro) e o cartão com a
// ficha; do 0km, a foto do catálogo com o cartão. O preço que sai é o do
// banco na hora do envio, nunca o da tela.

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Car, Loader2, Search, SendHorizonal, X } from "lucide-react";
import { money } from "@wa/lib/stages";

type Oferta = {
  ref: string;
  origem: "0km" | "usado" | "local";
  titulo: string;
  ano: string;
  km: number | null;
  cores: string[];
  combustivel: string | null;
  cambio: string | null;
  preco: number;
  prazoDias: number | null;
  foto?: string | null;
  /** Só do pátio: quantas fotos o carro tem (vão até 3). */
  fotoIds?: string[];
  cartao: string;
};

const ORIGEM: Record<Oferta["origem"], { label: string; cls: string }> = {
  "0km": { label: "0 km", cls: "bg-emerald-100 text-emerald-700" },
  usado: { label: "Seminovo", cls: "bg-sky-100 text-sky-700" },
  local: { label: "No pátio", cls: "bg-violet-100 text-violet-700" },
};

export function EnviarCarro({
  conversationId,
  onClose,
  onSent,
}: {
  conversationId: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [termo, setTermo] = useState("");
  const [tipo, setTipo] = useState<"todos" | "0km" | "usado">("todos");
  const [ofertas, setOfertas] = useState<Oferta[] | null>(null);
  const [vendeRede, setVendeRede] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);

  // Busca com folga de digitação: o estoque da rede é grande.
  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setCarregando(true);
      setErro(null);
      try {
        const sp = new URLSearchParams({ q: termo, tipo });
        const r = await fetch(`/api/wa/conversations/${conversationId}/carro?${sp}`, { signal: ctrl.signal });
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error ?? "Falha ao buscar o estoque");
        setOfertas(body.ofertas ?? []);
        setVendeRede(Boolean(body.vendeRede));
      } catch (e) {
        if ((e as Error).name !== "AbortError") setErro((e as Error).message);
      } finally {
        if (!ctrl.signal.aborted) setCarregando(false);
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [termo, tipo, conversationId]);

  async function enviar(o: Oferta) {
    setEnviando(o.ref);
    setErro(null);
    const r = await fetch(`/api/wa/conversations/${conversationId}/carro`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref: o.ref, q: termo, tipo }),
    });
    const body = await r.json().catch(() => ({}));
    setEnviando(null);
    if (!r.ok) {
      setErro(body.error ?? "Falha ao enviar");
      return;
    }
    onSent();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-black/50" aria-label="Fechar" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-line bg-paper shadow-2xl sm:rounded-3xl">
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
            <Car size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Enviar carro do estoque</p>
            <p className="truncate text-xs text-muted">
              {vendeRede ? "Estoque da loja e da rede CNV, com a sua margem." : "Estoque da loja."} Vão as fotos (até 3 do pátio)
              e o cartão com preço.
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-muted hover:bg-canvas" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-line px-5 py-3">
          <label className="relative block min-w-0 flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              className="input py-2 pl-8 text-sm"
              placeholder="Modelo, versão, câmbio… (ex.: onix automático)"
              value={termo}
              autoFocus
              onChange={(e) => setTermo(e.target.value)}
            />
          </label>
          <div className="flex gap-1">
            {(["todos", "0km", "usado"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTipo(t)}
                className={clsx(
                  "rounded-full px-3 py-1.5 text-xs font-semibold",
                  tipo === t ? "pill-active" : "border border-line bg-paper text-muted",
                )}
              >
                {t === "todos" ? "Todos" : t === "0km" ? "0 km" : "Seminovos"}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-[12rem] flex-1 overflow-y-auto p-3">
          {erro && <p className="mb-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{erro}</p>}
          {ofertas == null || (carregando && ofertas.length === 0) ? (
            <p className="flex items-center gap-2 px-2 py-6 text-xs text-muted">
              <Loader2 size={13} className="animate-spin" /> Buscando no estoque…
            </p>
          ) : ofertas.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted">Nenhum carro encontrado com essa busca.</p>
          ) : (
            <ul className={clsx("space-y-1", carregando && "opacity-60")}>
              {ofertas.map((o) => (
                <li key={o.ref} className="rounded-2xl border border-line">
                  <div className="flex items-center gap-3 px-3 py-2">
                    <span className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-canvas">
                      {o.foto ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={o.foto} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <Car size={18} className="text-muted" />
                      )}
                    </span>
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setAberto(aberto === o.ref ? null : o.ref)}>
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold">{o.titulo}</span>
                        <span className={clsx("shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold", ORIGEM[o.origem].cls)}>
                          {ORIGEM[o.origem].label}
                        </span>
                        {o.origem === "local" && (
                          <span className="shrink-0 text-[10px] text-muted">
                            {o.fotoIds?.length
                              ? `${Math.min(3, o.fotoIds.length)} foto${Math.min(3, o.fotoIds.length) === 1 ? "" : "s"}`
                              : "sem foto"}
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-[11px] text-muted">
                        {[o.ano, o.origem === "0km" ? null : o.km != null ? `${o.km.toLocaleString("pt-BR")} km` : null, o.cambio, o.cores[0]]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </button>
                    <span className="shrink-0 text-sm font-bold tabular-nums">{money(o.preco)}</span>
                    <button
                      className="btn-primary shrink-0 px-3 py-1.5 text-xs"
                      disabled={enviando !== null}
                      onClick={() => enviar(o)}
                      title="Enviar para o cliente"
                    >
                      {enviando === o.ref ? <Loader2 size={14} className="animate-spin" /> : <SendHorizonal size={14} />}
                    </button>
                  </div>
                  {aberto === o.ref && (
                    <pre className="mx-3 mb-2 whitespace-pre-wrap rounded-xl bg-canvas px-3 py-2 font-sans text-xs text-ink-800">{o.cartao}</pre>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
