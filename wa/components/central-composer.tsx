"use client";

// Campo de mensagem da Central: texto de várias linhas (Enter envia,
// Shift+Enter quebra a linha), anexo (botão, colar ou arrastar), emoji,
// respostas rápidas ("/" filtra pelo atalho), carro do estoque, localização
// da loja, áudio gravado na hora, resposta citando uma mensagem e nota interna.
//
// Nota interna vale até fora da janela de 24h: é conversa da equipe, não sai
// para o cliente.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import { Car, FileText, Loader2, MapPin, Paperclip, SendHorizonal, Smile, StickyNote, X, Zap } from "lucide-react";
import { aplicarVariaveis, filtrarRespostas, type RespostaRapida } from "@wa/lib/respostas";
import { EmojiPalette, ReplyingBar, type Message } from "@wa/components/central-kit";
import { GerenciarRespostas, RespostasPopover, useRespostasRapidas } from "@wa/components/quick-replies";
import { EnviarCarro } from "@wa/components/enviar-carro";
import { BotaoGravar, FaixaGravando, FaixaRevisarAudio, useGravador } from "@wa/components/central-gravador";
import { BotaoProgramar, FaixaProgramadas, ProgramarMensagem } from "@wa/components/central-programar";
import { CartaoResumo, MenuCopiloto, useCopiloto } from "@wa/components/central-copiloto";

/** Teto do servidor (wa/lib/midia-saida.ts): a Vercel recusa corpo maior. */
const MAX_BYTES = 4 * 1024 * 1024;
const ACEITA = "image/jpeg,image/png,video/mp4,video/3gpp,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv";
const ALTURA_MAX = 200;

function tamanho(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function Composer({
  conversationId,
  channelKind,
  contactName,
  canText,
  bloqueio,
  placeholder,
  replyingTo,
  onCancelReply,
  onSent,
  onError,
  podeEstoque,
  mapsUrl,
  lastInboundAt,
  copiloto = false,
}: {
  conversationId: string;
  channelKind: string;
  contactName: string | null;
  /** Última mensagem do cliente: a programada confere a janela na hora marcada. */
  lastInboundAt: string | null;
  /** A loja tem IA liberada e chave: mostra o copiloto (sob demanda). */
  copiloto?: boolean;
  /** Dentro da janela: dá para mandar mensagem livre. */
  canText: boolean;
  /** O aviso de janela fechada (com o botão de template), no lugar do campo. */
  bloqueio: ReactNode;
  placeholder: string;
  replyingTo: Message | null;
  onCancelReply: () => void;
  /** Depois de enviar mensagem ou salvar nota: recarrega a conversa. */
  onSent: () => Promise<void> | void;
  onError: (msg: string | null) => void;
  podeEstoque: boolean;
  mapsUrl: string | null;
}) {
  const [modo, setModo] = useState<"mensagem" | "nota">("mensagem");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [emojiAberto, setEmojiAberto] = useState(false);
  const [respostasAbertas, setRespostasAbertas] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const [gerenciar, setGerenciar] = useState(false);
  const [carroAberto, setCarroAberto] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [programarAberto, setProgramarAberto] = useState(false);
  const [versaoProgramadas, setVersaoProgramadas] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const seletor = useRef<HTMLInputElement>(null);
  const { respostas, podeEditar, carregado, recarregar } = useRespostasRapidas();
  const gravador = useGravador(onError);
  const copilotoDaTela = useCopiloto(conversationId, onError);
  /** O texto antes do copiloto mexer: "Desfazer" volta para ele. */
  const [antesDoCopiloto, setAntesDoCopiloto] = useState<string | null>(null);

  const ehWhats = channelKind === "whatsapp";
  const nota = modo === "nota";

  // Trocou de conversa: o rascunho, o anexo e o áudio gravado eram da outra.
  const zerarGravador = gravador.zerar;
  useEffect(() => {
    setTexto("");
    setArquivo(null);
    setModo("mensagem");
    setRespostasAbertas(false);
    setEmojiAberto(false);
    setProgramarAberto(false);
    setAviso(null);
    setAntesDoCopiloto(null);
    zerarGravador();
  }, [conversationId, zerarGravador]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 5000);
    return () => clearTimeout(t);
  }, [aviso]);

  // Prévia do anexo de imagem (o objeto URL é liberado ao trocar).
  useEffect(() => {
    if (!arquivo || !arquivo.type.startsWith("image/")) {
      setPrevia(null);
      return;
    }
    const url = URL.createObjectURL(arquivo);
    setPrevia(url);
    return () => URL.revokeObjectURL(url);
  }, [arquivo]);

  // Cresce com o texto até ~8 linhas; depois rola.
  useEffect(() => {
    const el = campo.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, ALTURA_MAX)}px`;
  }, [texto, modo]);

  // Responder citando volta o foco para o campo.
  useEffect(() => {
    if (replyingTo) {
      setModo("mensagem");
      campo.current?.focus();
    }
  }, [replyingTo]);

  // "/atalho" no começo do campo, sem espaço: abre a lista filtrada.
  const atalho = !nota && /^\/\S*$/.test(texto) ? texto.slice(1) : null;
  const listaVisivel = !nota && (respostasAbertas || atalho !== null);
  const filtradas = useMemo(
    () => (listaVisivel ? filtrarRespostas(respostas, atalho ?? "") : []),
    [listaVisivel, respostas, atalho],
  );
  useEffect(() => setAtivo(0), [atalho, respostasAbertas]);

  function escolherArquivo(f: File | null | undefined) {
    if (!f) return;
    if (!ehWhats) {
      onError("Anexo só sai pelo WhatsApp por enquanto. Neste canal, mande o texto.");
      return;
    }
    if (f.size > MAX_BYTES) {
      onError("Arquivo acima de 4 MB. Mande um menor ou um link.");
      return;
    }
    onError(null);
    setModo("mensagem");
    setArquivo(f);
    campo.current?.focus();
  }

  function inserir(trecho: string, substituirTudo = false) {
    const el = campo.current;
    if (substituirTudo || !el) {
      setTexto(trecho);
    } else {
      const ini = el.selectionStart ?? texto.length;
      const fim = el.selectionEnd ?? texto.length;
      const novo = texto.slice(0, ini) + trecho + texto.slice(fim);
      setTexto(novo);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(ini + trecho.length, ini + trecho.length);
      });
      return;
    }
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(trecho.length, trecho.length);
    });
  }

  function usarResposta(r: RespostaRapida) {
    const pronto = aplicarVariaveis(r.text, { nome: contactName });
    inserir(pronto, atalho !== null || !texto.trim());
    setRespostasAbertas(false);
  }

  async function enviar() {
    if (enviando) return;
    const conteudo = texto.trim();
    if (nota) {
      if (!conteudo) return;
      setEnviando(true);
      onError(null);
      try {
        const r = await fetch(`/api/wa/conversations/${conversationId}/notas`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: conteudo }),
        });
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          onError(body.error ?? "Falha ao salvar a nota");
          return;
        }
        setTexto("");
        await onSent();
      } finally {
        setEnviando(false);
      }
      return;
    }

    if (!conteudo && !arquivo) return;
    setEnviando(true);
    onError(null);
    setAntesDoCopiloto(null);
    const anexo = arquivo;
    setTexto("");
    setArquivo(null);
    try {
      let r: Response;
      if (anexo) {
        const form = new FormData();
        form.append("file", anexo, anexo.name || "arquivo");
        if (conteudo) form.append("caption", conteudo);
        if (replyingTo) form.append("replyToId", replyingTo.id);
        r = await fetch(`/api/wa/conversations/${conversationId}/send-media`, { method: "POST", body: form });
      } else {
        r = await fetch(`/api/wa/conversations/${conversationId}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: conteudo, replyToId: replyingTo?.id ?? null }),
        });
      }
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        onError(body.error || "Falha ao enviar");
        setTexto(conteudo);
        setArquivo(anexo);
      } else {
        onCancelReply();
      }
      await onSent();
    } finally {
      setEnviando(false);
      campo.current?.focus();
    }
  }

  async function copilotoNoCampo(acao: "sugerir" | "melhorar") {
    const antes = texto;
    const novo = await copilotoDaTela.pedir(acao, acao === "melhorar" ? texto : undefined);
    if (novo == null) return;
    setModo("mensagem");
    setAntesDoCopiloto(antes);
    inserir(novo, true);
  }

  async function copilotoResumo() {
    const r = await copilotoDaTela.pedir("resumir");
    if (r) copilotoDaTela.setResumo(r);
  }

  /** O áudio gravado vai como anexo comum: send-media aceita OGG/Opus. */
  async function enviarAudio() {
    const g = gravador.gravacao;
    if (!g || enviando) return;
    if (g.file.size > MAX_BYTES) {
      onError("Áudio acima de 4 MB. Grave um mais curto.");
      return;
    }
    setEnviando(true);
    onError(null);
    try {
      const form = new FormData();
      form.append("file", g.file, g.file.name);
      if (replyingTo) form.append("replyToId", replyingTo.id);
      const r = await fetch(`/api/wa/conversations/${conversationId}/send-media`, { method: "POST", body: form });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        onError(body.error || "Falha ao enviar o áudio");
      } else {
        gravador.descartar();
        onCancelReply();
      }
      await onSent();
    } finally {
      setEnviando(false);
    }
  }

  async function enviarLocalizacao() {
    if (enviando) return;
    setEnviando(true);
    onError(null);
    try {
      const r = await fetch(`/api/wa/conversations/${conversationId}/localizacao`, { method: "POST" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        onError(body.error ?? "Falha ao enviar a localização");
      }
      await onSent();
    } finally {
      setEnviando(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.nativeEvent.isComposing) return;
    if (listaVisivel) {
      if (e.key === "Escape") {
        e.preventDefault();
        setRespostasAbertas(false);
        if (atalho !== null) setTexto("");
        return;
      }
      if (filtradas.length) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setAtivo((i) => (i + 1) % filtradas.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setAtivo((i) => (i - 1 + filtradas.length) % filtradas.length);
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          usarResposta(filtradas[Math.min(ativo, filtradas.length - 1)]);
          return;
        }
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  }

  const bloqueado = !nota && !canText;
  // Campo vazio no WhatsApp: o botão de enviar vira o microfone.
  const podeGravar = !nota && ehWhats && !texto.trim() && !arquivo;

  return (
    <div
      className={clsx("relative border-t border-line p-3", arrastando && "bg-brand-50")}
      onDragOver={(e) => {
        if (!nota && canText && e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setArrastando(true);
        }
      }}
      onDragLeave={() => setArrastando(false)}
      onDrop={(e) => {
        setArrastando(false);
        if (nota || !canText) return;
        e.preventDefault();
        escolherArquivo(e.dataTransfer.files?.[0]);
      }}
    >
      <div className="mb-2 flex items-center gap-1">
        <button
          type="button"
          onClick={() => setModo("mensagem")}
          className={clsx(
            "rounded-full px-2.5 py-1 text-[11px] font-semibold",
            !nota ? "pill-active" : "text-muted hover:bg-canvas",
          )}
        >
          Mensagem
        </button>
        <button
          type="button"
          onClick={() => {
            setModo("nota");
            setArquivo(null);
            gravador.zerar();
            onCancelReply();
            requestAnimationFrame(() => campo.current?.focus());
          }}
          className={clsx(
            "flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold",
            nota ? "bg-amber-100 text-amber-800" : "text-muted hover:bg-canvas",
          )}
          title="Só a equipe vê. Não vai para o cliente."
        >
          <StickyNote size={11} /> Nota interna
        </button>
      </div>

      <FaixaProgramadas conversationId={conversationId} versao={versaoProgramadas} onError={onError} />
      {copilotoDaTela.resumo && (
        <CartaoResumo resumo={copilotoDaTela.resumo} onFechar={() => copilotoDaTela.setResumo(null)} />
      )}
      {antesDoCopiloto !== null && !nota && (
        <p className="mb-2 flex items-center gap-2 text-[11px] text-muted">
          Texto do copiloto no campo: confira antes de enviar.
          <button
            type="button"
            className="font-semibold text-brand-700 hover:underline"
            onClick={() => {
              setTexto(antesDoCopiloto);
              setAntesDoCopiloto(null);
            }}
          >
            Desfazer
          </button>
        </p>
      )}
      {aviso && <p className="mb-2 rounded-xl bg-emerald-50 px-3 py-1.5 text-[11px] text-emerald-700">{aviso}</p>}

      {bloqueado ? (
        <>
          {bloqueio}
          {/* Fora da janela, programar ainda serve: o template escolhido sai na hora. */}
          {(ehWhats || copiloto) && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {ehWhats && (
                <button
                  type="button"
                  onClick={() => setProgramarAberto(true)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:underline"
                >
                  Programar uma mensagem para depois
                </button>
              )}
              {copiloto && (
                <button
                  type="button"
                  onClick={copilotoResumo}
                  disabled={copilotoDaTela.ocupado !== null}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:underline disabled:opacity-50"
                >
                  {copilotoDaTela.ocupado === "resumir" ? "Resumindo…" : "Resumir a conversa"}
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          {replyingTo && !nota && <ReplyingBar m={replyingTo} contactName={contactName} onCancel={onCancelReply} />}
          {arquivo && (
            <div className="mb-2 flex items-center gap-3 rounded-xl border border-line bg-canvas px-3 py-2">
              {previa ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previa} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
              ) : (
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-paper">
                  <FileText size={18} className="text-brand-700" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold">{arquivo.name || "arquivo"}</span>
                <span className="block text-[11px] text-muted">
                  {tamanho(arquivo.size)}
                  {arquivo.type.startsWith("audio/")
                    ? " · o texto vai em seguida, como mensagem"
                    : " · o texto do campo vira a legenda"}
                </span>
              </span>
              <button onClick={() => setArquivo(null)} className="rounded-full p-1 text-muted hover:bg-paper" aria-label="Tirar anexo">
                <X size={14} />
              </button>
            </div>
          )}

          <div className="relative">
            {listaVisivel && (
              <RespostasPopover
                lista={filtradas}
                ativo={ativo}
                termo={atalho}
                carregado={carregado}
                podeEditar={podeEditar}
                onPick={usarResposta}
                onHover={setAtivo}
                onGerenciar={() => {
                  setRespostasAbertas(false);
                  setGerenciar(true);
                }}
                onClose={() => {
                  setRespostasAbertas(false);
                  if (atalho !== null) setTexto("");
                }}
              />
            )}
            {emojiAberto && (
              <EmojiPalette
                onPick={(e) => inserir(e)}
                onClose={() => setEmojiAberto(false)}
              />
            )}
            {gravador.gravando && !nota ? (
              <FaixaGravando
                segundos={gravador.segundos}
                onCancelar={() => gravador.parar(false)}
                onParar={() => gravador.parar(true)}
              />
            ) : gravador.gravacao && !nota ? (
              <FaixaRevisarAudio
                gravacao={gravador.gravacao}
                enviando={enviando}
                onDescartar={gravador.descartar}
                onEnviar={enviarAudio}
              />
            ) : (
              <div
                className={clsx(
                  "flex items-end gap-1 rounded-2xl border px-2 py-1.5",
                  nota ? "border-amber-300 bg-amber-50" : "border-line bg-paper",
                )}
              >
                {!nota && (
                  <>
                    <button
                      type="button"
                      className="rounded-full p-1.5 text-muted hover:bg-canvas hover:text-ink-900"
                      onClick={() => setEmojiAberto((v) => !v)}
                      title="Emoji"
                    >
                      <Smile size={17} />
                    </button>
                    <button
                      type="button"
                      className="rounded-full p-1.5 text-muted hover:bg-canvas hover:text-ink-900 disabled:opacity-40"
                      onClick={() => seletor.current?.click()}
                      disabled={!ehWhats}
                      title={ehWhats ? "Anexar foto, vídeo, áudio ou documento (até 4 MB)" : "Anexo só pelo WhatsApp"}
                    >
                      <Paperclip size={17} />
                    </button>
                    <input
                      ref={seletor}
                      type="file"
                      accept={ACEITA}
                      className="hidden"
                      onChange={(e) => {
                        escolherArquivo(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </>
                )}
                <textarea
                  ref={campo}
                  rows={1}
                  className="max-h-[200px] min-h-[2.25rem] flex-1 resize-none bg-transparent px-1 py-1.5 text-sm leading-snug outline-none placeholder:text-muted"
                  placeholder={nota ? "Nota para a equipe (o cliente não vê)…" : arquivo ? "Legenda (opcional)…" : placeholder}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={onKeyDown}
                  onPaste={(e) => {
                    const f = e.clipboardData?.files?.[0];
                    if (f && !nota) {
                      e.preventDefault();
                      escolherArquivo(f);
                    }
                  }}
                />
                {!nota && (
                  <>
                    <button
                      type="button"
                      className={clsx(
                        "rounded-full p-1.5 hover:bg-canvas hover:text-ink-900",
                        respostasAbertas ? "text-brand-700" : "text-muted",
                      )}
                      onClick={() => setRespostasAbertas((v) => !v)}
                      title="Respostas rápidas (ou digite /)"
                    >
                      <Zap size={17} />
                    </button>
                    {podeEstoque && (
                      <button
                        type="button"
                        className="rounded-full p-1.5 text-muted hover:bg-canvas hover:text-ink-900"
                        onClick={() => setCarroAberto(true)}
                        title="Enviar carro do estoque"
                      >
                        <Car size={17} />
                      </button>
                    )}
                    {mapsUrl && (
                      <button
                        type="button"
                        className="rounded-full p-1.5 text-muted hover:bg-canvas hover:text-ink-900"
                        onClick={enviarLocalizacao}
                        disabled={enviando}
                        title="Enviar a localização da loja"
                      >
                        <MapPin size={17} />
                      </button>
                    )}
                    <BotaoProgramar onClick={() => setProgramarAberto(true)} disabled={Boolean(arquivo)} />
                    {copiloto && (
                      <MenuCopiloto
                        ocupado={copilotoDaTela.ocupado}
                        temTexto={Boolean(texto.trim())}
                        onSugerir={() => copilotoNoCampo("sugerir")}
                        onMelhorar={() => copilotoNoCampo("melhorar")}
                        onResumir={copilotoResumo}
                      />
                    )}
                  </>
                )}
                {podeGravar && !enviando ? (
                  <BotaoGravar onClick={gravador.iniciar} />
                ) : (
                  <button
                    type="button"
                    className={clsx("shrink-0 px-3 py-2", nota ? "btn-dark" : "btn-primary")}
                    onClick={enviar}
                    disabled={enviando || (!texto.trim() && !arquivo)}
                    title={nota ? "Salvar nota" : "Enviar (Enter). Shift+Enter quebra a linha."}
                  >
                    {enviando ? <Loader2 size={16} className="animate-spin" /> : nota ? <StickyNote size={16} /> : <SendHorizonal size={16} />}
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {gerenciar && (
        <GerenciarRespostas respostas={respostas} onClose={() => setGerenciar(false)} onChanged={recarregar} />
      )}
      {carroAberto && (
        <EnviarCarro conversationId={conversationId} onClose={() => setCarroAberto(false)} onSent={() => onSent()} />
      )}
      {programarAberto && (
        <ProgramarMensagem
          conversationId={conversationId}
          channelKind={channelKind}
          lastInboundAt={lastInboundAt}
          rascunho={nota ? "" : texto}
          contactName={contactName}
          onClose={() => setProgramarAberto(false)}
          onProgramada={(quando) => {
            setProgramarAberto(false);
            setTexto("");
            setVersaoProgramadas((v) => v + 1);
            setAviso(`Mensagem programada para ${quando}.`);
          }}
        />
      )}
    </div>
  );
}
