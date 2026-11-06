"use client";

// Copiloto no compositor da Central: um botão com três pedidos, todos sob
// demanda (nada roda sozinho). Sugerir e melhorar põem o texto no campo para a
// pessoa ler e ajustar antes de enviar; dá para desfazer. O resumo aparece num
// cartão acima do campo, só para a equipe.

import { useEffect, useRef, useState } from "react";
import { Copy, Loader2, MessageSquareText, Sparkles, Wand2, X } from "lucide-react";

type Acao = "sugerir" | "melhorar" | "resumir";

export function useCopiloto(conversationId: string, onError: (msg: string | null) => void) {
  const [ocupado, setOcupado] = useState<Acao | null>(null);
  const [resumo, setResumo] = useState<string | null>(null);
  // Conversa aberta agora. O compositor não remonta ao trocar de conversa:
  // sem isto, a resposta pedida na conversa A cairia no campo da B (e seria
  // enviada ao cliente errado).
  const atual = useRef(conversationId);

  useEffect(() => {
    atual.current = conversationId;
    setResumo(null);
    setOcupado(null);
  }, [conversationId]);

  async function pedir(acao: Acao, texto?: string): Promise<string | null> {
    if (ocupado) return null;
    const pedidoDe = conversationId;
    const mudou = () => atual.current !== pedidoDe;
    setOcupado(acao);
    onError(null);
    try {
      const r = await fetch(`/api/wa/conversations/${pedidoDe}/copiloto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao, texto }),
      });
      const b = await r.json().catch(() => ({}));
      // Trocou de conversa no meio do pedido: a resposta era da outra.
      if (mudou()) return null;
      if (!r.ok) {
        onError(b.error ?? "O copiloto não respondeu. Tente de novo.");
        return null;
      }
      return typeof b.texto === "string" ? b.texto : null;
    } catch {
      if (!mudou()) onError("O copiloto não respondeu. Tente de novo.");
      return null;
    } finally {
      // Na conversa nova, o "ocupado" já foi zerado e pode ser de outro pedido.
      if (!mudou()) setOcupado(null);
    }
  }

  return { ocupado, resumo, setResumo, pedir };
}

export function MenuCopiloto({
  ocupado,
  temTexto,
  onSugerir,
  onMelhorar,
  onResumir,
}: {
  ocupado: Acao | null;
  temTexto: boolean;
  onSugerir: () => void;
  onMelhorar: () => void;
  onResumir: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const item = "flex w-full items-start gap-2 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-canvas disabled:opacity-40";
  const escolher = (fn: () => void) => () => {
    setAberto(false);
    fn();
  };
  return (
    <div className="relative">
      <button
        type="button"
        className="rounded-full p-1.5 text-muted hover:bg-canvas hover:text-ink-900 disabled:opacity-40"
        onClick={() => setAberto((v) => !v)}
        disabled={ocupado !== null}
        title="Copiloto: sugerir, melhorar o texto ou resumir"
        aria-label="Copiloto"
      >
        {ocupado ? <Loader2 size={17} className="animate-spin text-brand-700" /> : <Sparkles size={17} />}
      </button>
      {aberto && (
        <>
          <button type="button" className="fixed inset-0 z-20 cursor-default" aria-label="Fechar" onClick={() => setAberto(false)} />
          <div className="absolute bottom-full right-0 z-30 mb-2 w-64 rounded-2xl border border-line bg-paper p-2 shadow-xl">
            <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-muted">Copiloto</p>
            <button type="button" className={item} onClick={escolher(onSugerir)}>
              <Sparkles size={14} className="mt-0.5 shrink-0 text-brand-700" />
              <span>
                <span className="block font-semibold">Sugerir resposta</span>
                <span className="block text-[11px] text-muted">Escreve a próxima mensagem no campo</span>
              </span>
            </button>
            <button type="button" className={item} onClick={escolher(onMelhorar)} disabled={!temTexto}>
              <Wand2 size={14} className="mt-0.5 shrink-0 text-brand-700" />
              <span>
                <span className="block font-semibold">Melhorar o texto</span>
                <span className="block text-[11px] text-muted">
                  {temTexto ? "Corrige e deixa mais claro, sem mudar o sentido" : "Escreva algo no campo primeiro"}
                </span>
              </span>
            </button>
            <button type="button" className={item} onClick={escolher(onResumir)}>
              <MessageSquareText size={14} className="mt-0.5 shrink-0 text-brand-700" />
              <span>
                <span className="block font-semibold">Resumir a conversa</span>
                <span className="block text-[11px] text-muted">O que o cliente quer e o próximo passo</span>
              </span>
            </button>
            <p className="px-2 pt-1 text-[10px] leading-snug text-muted">Usa a chave de IA da loja. Confira antes de enviar.</p>
          </div>
        </>
      )}
    </div>
  );
}

export function CartaoResumo({ resumo, onFechar }: { resumo: string; onFechar: () => void }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="mb-2 rounded-2xl border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-ink-900">
      <div className="mb-1 flex items-center gap-2">
        <Sparkles size={12} className="text-brand-700" />
        <span className="flex-1 text-[10px] font-bold uppercase tracking-[0.16em] text-brand-700">Resumo do copiloto</span>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard?.writeText(resumo).catch(() => {});
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1500);
          }}
          className="flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] text-brand-700 hover:bg-brand-100"
        >
          <Copy size={11} /> {copiado ? "Copiado" : "Copiar"}
        </button>
        <button type="button" onClick={onFechar} className="rounded-full p-0.5 text-muted hover:bg-brand-100" aria-label="Fechar resumo">
          <X size={13} />
        </button>
      </div>
      <p className="whitespace-pre-wrap leading-relaxed">{resumo}</p>
      <p className="mt-1 text-[10px] text-muted">Só a equipe vê. Não vai para o cliente.</p>
    </div>
  );
}
