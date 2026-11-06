"use client";

// Gravação de áudio no compositor da Central, como a nota de voz do WhatsApp.
//
// O navegador grava em WebM/MP4, e o WhatsApp só mostra como mensagem de voz
// o OGG com Opus: o opus-recorder codifica direto em OGG/Opus (o worker do
// codificador fica em public/wa/encoderWorker.min.js). Gravou, a pessoa ouve
// antes de mandar e decide: descartar ou enviar. O envio é o mesmo anexo de
// sempre (send-media), então a janela de 24h e o limite de 4 MB valem igual.

import { useCallback, useEffect, useRef, useState } from "react";
import type OpusRecorder from "opus-recorder";
import { Loader2, Mic, SendHorizonal, Square, Trash2 } from "lucide-react";

/** Teto da gravação: 10 minutos a 24 kbps dão ~1,8 MB, longe dos 4 MB. */
const MAX_SEGUNDOS = 600;

export type Gravacao = { url: string; file: File; segundos: number };

function relogio(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function useGravador(onError: (msg: string | null) => void) {
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [gravacao, setGravacao] = useState<Gravacao | null>(null);
  const recorder = useRef<OpusRecorder | null>(null);
  const pedacos = useRef<Uint8Array[]>([]);
  const cancelada = useRef(false);
  const relogioRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const segundosRef = useRef(0);

  const pararRelogio = useCallback(() => {
    if (relogioRef.current) clearInterval(relogioRef.current);
    relogioRef.current = null;
  }, []);

  const parar = useCallback(
    (guardar: boolean) => {
      const rec = recorder.current;
      if (!rec) return;
      cancelada.current = !guardar;
      recorder.current = null;
      setGravando(false);
      pararRelogio();
      rec.stop().catch(() => {});
    },
    [pararRelogio],
  );

  const iniciar = useCallback(async () => {
    if (recorder.current) return;
    onError(null);
    try {
      const { default: Recorder } = await import("opus-recorder");
      if (!Recorder.isRecordingSupported()) {
        onError("Este navegador não grava áudio. Use o Chrome, o Edge ou o Firefox atualizados.");
        return;
      }
      pedacos.current = [];
      cancelada.current = false;
      const rec = new Recorder({
        encoderPath: "/wa/encoderWorker.min.js",
        numberOfChannels: 1,
        // 2048 = VOIP: o perfil do Opus feito para voz.
        encoderApplication: 2048,
        encoderSampleRate: 48000,
        encoderBitRate: 24000,
      });
      rec.ondataavailable = (data) => pedacos.current.push(data);
      rec.onstop = () => {
        const partes = pedacos.current;
        pedacos.current = [];
        if (cancelada.current) return;
        const blob = new Blob(partes as BlobPart[], { type: "audio/ogg" });
        if (blob.size === 0) return;
        const file = new File([blob], `audio-${Date.now()}.ogg`, { type: "audio/ogg" });
        setGravacao({ url: URL.createObjectURL(blob), file, segundos: segundosRef.current });
      };
      await rec.start();
      recorder.current = rec;
      segundosRef.current = 0;
      setSegundos(0);
      setGravando(true);
      relogioRef.current = setInterval(() => {
        segundosRef.current += 1;
        setSegundos(segundosRef.current);
      }, 1000);
    } catch {
      onError("Não deu para usar o microfone. Confira a permissão do navegador para este site.");
    }
  }, [onError]);

  // Chegou no teto: para e guarda (a pessoa ouve e decide).
  useEffect(() => {
    if (gravando && segundos >= MAX_SEGUNDOS) parar(true);
  }, [gravando, segundos, parar]);

  const descartar = useCallback(() => {
    setGravacao((g) => {
      if (g) URL.revokeObjectURL(g.url);
      return null;
    });
  }, []);

  /** Trocou de conversa ou fechou a tela: nada gravado vai para outro cliente. */
  const zerar = useCallback(() => {
    parar(false);
    descartar();
  }, [parar, descartar]);

  useEffect(() => {
    return () => {
      pararRelogio();
      try {
        recorder.current?.stop();
      } catch {
        /* já parado */
      }
    };
  }, [pararRelogio]);

  return { gravando, segundos, gravacao, iniciar, parar, descartar, zerar };
}

/** Botão do microfone (no lugar do enviar, com o campo vazio). */
export function BotaoGravar({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      className="btn-primary shrink-0 px-3 py-2"
      onClick={onClick}
      disabled={disabled}
      title="Gravar áudio (sai como mensagem de voz)"
      aria-label="Gravar áudio"
    >
      <Mic size={16} />
    </button>
  );
}

/** Faixa durante a gravação: o tempo correndo, cancelar e parar. */
export function FaixaGravando({
  segundos,
  onCancelar,
  onParar,
}: {
  segundos: number;
  onCancelar: () => void;
  onParar: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2">
      <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-500" aria-hidden />
      <span className="flex-1 text-sm font-semibold tabular-nums text-red-700">
        Gravando {relogio(segundos)}
        <span className="ml-2 text-[11px] font-normal text-red-600/80">até {relogio(MAX_SEGUNDOS)}</span>
      </span>
      <button
        type="button"
        onClick={onCancelar}
        className="rounded-full p-1.5 text-red-700 hover:bg-red-100"
        title="Cancelar a gravação"
        aria-label="Cancelar a gravação"
      >
        <Trash2 size={16} />
      </button>
      <button
        type="button"
        onClick={onParar}
        className="btn-dark shrink-0 px-3 py-1.5 text-xs"
        title="Parar e ouvir antes de mandar"
      >
        <Square size={13} /> Parar
      </button>
    </div>
  );
}

/** Revisão: ouvir, descartar ou enviar. */
export function FaixaRevisarAudio({
  gravacao,
  enviando,
  onDescartar,
  onEnviar,
}: {
  gravacao: Gravacao;
  enviando: boolean;
  onDescartar: () => void;
  onEnviar: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-canvas px-3 py-2">
      <audio controls src={gravacao.url} className="h-10 min-w-0 flex-1" />
      <span className="text-[11px] tabular-nums text-muted">{relogio(gravacao.segundos)}</span>
      <button
        type="button"
        onClick={onDescartar}
        disabled={enviando}
        className="btn-ghost px-3 py-1.5 text-xs"
        title="Apagar esta gravação"
      >
        <Trash2 size={13} /> Descartar
      </button>
      <button
        type="button"
        onClick={onEnviar}
        disabled={enviando}
        className="btn-primary px-3 py-1.5 text-xs"
        title="Enviar como mensagem de voz"
      >
        {enviando ? <Loader2 size={14} className="animate-spin" /> : <SendHorizonal size={14} />} Enviar
      </button>
    </div>
  );
}
