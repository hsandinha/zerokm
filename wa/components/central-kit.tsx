"use client";

// Peças da Central que não dependem do estado dela: o balão de mídia, a
// citação, o relógio da janela, a paleta de emoji, as reações e o modal de
// transferência. Ficam aqui para a central.tsx continuar legível.

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  Clock,
  CornerUpLeft,
  Download,
  FileText,
  ImageOff,
  Loader2,
  SmilePlus,
  StickyNote,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { dateTime, shortTime } from "@wa/lib/stages";

// ── Tipos que a API devolve ─────────────────────────────────

export type Quoted = {
  id: string | null;
  direction: "inbound" | "outbound" | null;
  sender: "contact" | "ai" | "human" | "system" | null;
  content: string | null;
  mediaType: string | null;
  filename: string | null;
};

export type Message = {
  id: string;
  direction: "inbound" | "outbound";
  sender: "contact" | "ai" | "human" | "system";
  content: string | null;
  mediaType: string;
  mediaId?: string | null;
  /** De onde carregar a mídia (proxy da Meta, link assinado ou catálogo). */
  mediaSrc?: string | null;
  filename?: string | null;
  externalId?: string | null;
  status: string | null;
  reaction: string | null;
  error: string | null;
  createdAt: string;
  quoted?: Quoted | null;
  /** Quem da equipe escreveu (sender "human"). */
  authorEmail?: string | null;
  authorName?: string | null;
};

/** Rótulo do balão de saída (regra pura em wa/lib/central-regras.ts). */
export { rotuloDoAutor } from "@wa/lib/central-regras";

export type Note = {
  id: string;
  authorEmail: string;
  authorName: string | null;
  text: string;
  createdAt: string;
};

export const MEDIA_LABEL: Record<string, string> = {
  button: "toque no botão",
  interactive: "resposta interativa",
  image: "imagem",
  audio: "áudio",
  video: "vídeo",
  document: "documento",
  sticker: "figurinha",
  location: "localização",
  contacts: "contato",
};

// ── Mídia ───────────────────────────────────────────────────

/** Foto, áudio, vídeo, documento ou figurinha dentro do balão. Sem fonte (o
 *  Direct não guarda o anexo, a localização não tem arquivo), fica o rótulo. */
export function MediaContent({ m }: { m: Message }) {
  const [falhou, setFalhou] = useState(false);
  const [aberta, setAberta] = useState(false);
  const src = m.mediaSrc ?? null;
  const tipo = m.mediaType;

  if (!src || falhou) {
    if (tipo === "text" || tipo === "template" || tipo === "evento") return null;
    return (
      <p className="mb-0.5 flex items-center gap-1 text-xs italic text-muted">
        {falhou && <ImageOff size={12} />}[{MEDIA_LABEL[tipo] ?? tipo}
        {falhou ? " indisponível" : ""}]
      </p>
    );
  }

  if (tipo === "image" || tipo === "sticker") {
    return (
      <>
        <button
          type="button"
          onClick={() => tipo === "image" && setAberta(true)}
          className={clsx("mb-1 block overflow-hidden rounded-xl", tipo === "image" && "cursor-zoom-in")}
          title={tipo === "image" ? "Ampliar" : undefined}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={tipo === "sticker" ? "Figurinha" : m.content ?? "Imagem"}
            loading="lazy"
            onError={() => setFalhou(true)}
            className={clsx(tipo === "sticker" ? "h-28 w-28 object-contain" : "max-h-64 w-auto max-w-full object-cover")}
          />
        </button>
        {aberta && <Lightbox src={src} alt={m.content ?? "Imagem"} onClose={() => setAberta(false)} />}
      </>
    );
  }
  if (tipo === "audio") {
    return <audio controls preload="none" src={src} onError={() => setFalhou(true)} className="mb-1 h-10 w-64 max-w-full" />;
  }
  if (tipo === "video") {
    return (
      <video
        controls
        preload="metadata"
        src={src}
        onError={() => setFalhou(true)}
        className="mb-1 max-h-64 max-w-full rounded-xl bg-black"
      />
    );
  }
  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      className="mb-1 flex items-center gap-2 rounded-xl border border-line bg-paper/70 px-3 py-2 text-xs font-semibold text-ink-900 hover:bg-paper"
    >
      <FileText size={16} className="shrink-0 text-brand-700" />
      <span className="min-w-0 flex-1 truncate">{m.filename ?? "Documento"}</span>
      <Download size={13} className="shrink-0 text-muted" />
    </a>
  );
}

export function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4" role="dialog" aria-modal="true" onClick={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
      <div className="absolute right-4 top-4 flex gap-2">
        <a
          href={src}
          download
          onClick={(e) => e.stopPropagation()}
          className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          aria-label="Baixar"
        >
          <Download size={18} />
        </a>
        <button onClick={onClose} className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Fechar">
          <X size={18} />
        </button>
      </div>
    </div>
  );
}

// ── Citação ─────────────────────────────────────────────────

function autorDaCitacao(q: Pick<Quoted, "direction" | "sender">, contactName: string | null): string {
  if (q.direction === "inbound") return contactName || "Cliente";
  if (q.sender === "ai") return "IA";
  if (q.sender === "system") return "Sistema";
  return "Equipe";
}

export function resumoDaCitacao(q: { content: string | null; mediaType: string | null; filename?: string | null }): string {
  if (q.content) return q.content;
  if (q.mediaType === "document" && q.filename) return `📄 ${q.filename}`;
  if (q.mediaType && q.mediaType !== "text") return `[${MEDIA_LABEL[q.mediaType] ?? q.mediaType}]`;
  return "Mensagem";
}

/** A mensagem citada, em cima do balão (como no WhatsApp). */
export function QuotedBubble({ q, contactName, onClick }: { q: Quoted; contactName: string | null; onClick?: () => void }) {
  if (!q.id) {
    return (
      <p className="mb-1 rounded-lg border-l-4 border-ink-300 bg-ink-100/60 px-2 py-1 text-[11px] italic text-muted">
        Respondeu a uma mensagem que não está aqui.
      </p>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "mb-1 block w-full rounded-lg border-l-4 bg-ink-100/60 px-2 py-1 text-left text-[11px] leading-snug",
        q.direction === "inbound" ? "border-emerald-500" : "border-brand-500",
      )}
    >
      <span className="block font-semibold text-ink-800">{autorDaCitacao(q, contactName)}</span>
      <span className="line-clamp-2 text-muted">{resumoDaCitacao(q)}</span>
    </button>
  );
}

/** Barra "respondendo a..." acima do campo. */
export function ReplyingBar({ m, contactName, onCancel }: { m: Message; contactName: string | null; onCancel: () => void }) {
  return (
    <div className="mb-2 flex items-start gap-2 rounded-xl border-l-4 border-brand-500 bg-canvas px-3 py-1.5 text-xs">
      <CornerUpLeft size={13} className="mt-0.5 shrink-0 text-brand-700" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">Respondendo a {autorDaCitacao(m, contactName)}</span>
        <span className="line-clamp-1 text-muted">{resumoDaCitacao(m)}</span>
      </span>
      <button onClick={onCancel} className="rounded-full p-0.5 text-muted hover:bg-paper" aria-label="Cancelar resposta">
        <X size={13} />
      </button>
    </div>
  );
}

// ── Ações no balão (responder, reagir) ──────────────────────

/** As mesmas seis do WhatsApp no celular. */
export const REACOES = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export function MessageActions({
  mine,
  canReact,
  onReply,
  onReact,
}: {
  mine: boolean;
  canReact: boolean;
  onReply: () => void;
  onReact: (emoji: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <div
      className={clsx(
        "absolute -top-3 z-10 hidden items-center gap-0.5 rounded-full border border-line bg-paper px-1 py-0.5 shadow-sm group-hover:flex",
        aberto && "flex",
        mine ? "left-2" : "right-2",
      )}
    >
      <button type="button" onClick={onReply} className="rounded-full p-1 text-muted hover:bg-canvas hover:text-ink-900" title="Responder citando">
        <CornerUpLeft size={13} />
      </button>
      {canReact && (
        <>
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            className="rounded-full p-1 text-muted hover:bg-canvas hover:text-ink-900"
            title="Reagir"
          >
            <SmilePlus size={13} />
          </button>
          {aberto &&
            REACOES.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  setAberto(false);
                  onReact(e);
                }}
                className="rounded-full px-1 text-sm leading-none transition hover:scale-125"
              >
                {e}
              </button>
            ))}
        </>
      )}
    </div>
  );
}

// ── Nota interna na linha do tempo ──────────────────────────

export function NoteItem({
  note,
  canDelete,
  onDelete,
}: {
  note: Note;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const autor = note.authorName || note.authorEmail.split("@")[0].replace(/[._-]/g, " ");
  return (
    <div className="group flex justify-center">
      <div className="relative w-full max-w-[80%] rounded-2xl border border-dashed border-amber-300 bg-amber-50 px-3.5 py-2 text-sm leading-relaxed text-amber-950">
        <p className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
          <StickyNote size={11} /> Nota interna · {autor}
        </p>
        <p className="whitespace-pre-wrap">{note.text}</p>
        <p className="mt-1 flex items-center justify-end gap-2 text-[10px] text-amber-700/80" title={dateTime(note.createdAt)}>
          só a equipe vê · {shortTime(note.createdAt)}
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="hidden rounded p-0.5 hover:bg-amber-100 group-hover:inline-flex"
              title="Apagar nota"
            >
              <Trash2 size={11} />
            </button>
          )}
        </p>
      </div>
    </div>
  );
}

// ── Janela de atendimento ───────────────────────────────────

const HORA = 3600_000;
const DIA = 24 * HORA;

function relogio(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(t / 86400);
  const h = String(Math.floor((t % 86400) / 3600)).padStart(2, "0");
  const m = String(Math.floor((t % 3600) / 60)).padStart(2, "0");
  const s = String(t % 60).padStart(2, "0");
  return d > 0 ? `${d}d ${h}:${m}:${s}` : `${h}:${m}:${s}`;
}

/**
 * Contagem regressiva da janela da Meta no cabeçalho (como o window-timer do
 * Chatrun). O campo já travava quando a janela fechava, mas ninguém via a hora
 * chegando. Relógio próprio: só este pedaço re-renderiza a cada segundo.
 */
export function WindowTimer({ lastInboundAt, kind }: { lastInboundAt: string | null; kind: string }) {
  const [agora, setAgora] = useState(() => Date.now());
  const janela = kind === "instagram" || kind === "messenger" ? 7 * DIA : DIA;
  const fechaEm = lastInboundAt ? new Date(lastInboundAt).getTime() + janela : null;
  const restante = fechaEm === null ? null : fechaEm - agora;

  useEffect(() => setAgora(Date.now()), [lastInboundAt, kind]);
  useEffect(() => {
    if (restante === null || restante <= 0) return;
    const t = setTimeout(() => setAgora(Date.now()), 1000 - (Date.now() % 1000) + 5);
    return () => clearTimeout(t);
  }, [agora, restante]);

  // SMS não tem janela: nada para contar.
  if (kind === "sms") return null;

  const rotulo = kind === "instagram" ? "Janela do Direct" : kind === "messenger" ? "Janela do Messenger" : "Janela de 24h";
  if (restante === null || restante <= 0) {
    return (
      <span
        className="hidden items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-600 sm:inline-flex"
        title={
          restante === null
            ? "O cliente ainda não escreveu. Até ele escrever, só template aprovado chega."
            : kind === "whatsapp"
              ? "Fechada: só template aprovado até o cliente escrever de novo."
              : "Fechada: só dá para responder quando o cliente escrever de novo."
        }
      >
        <Clock size={12} /> {kind === "whatsapp" ? "Janela fechada" : "Fechada"}
      </span>
    );
  }
  const tom =
    restante <= HORA
      ? "bg-red-50 text-red-600"
      : restante <= 6 * HORA
        ? "bg-amber-50 text-amber-700"
        : "bg-emerald-50 text-emerald-700";
  return (
    <span
      className={clsx("hidden items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold tabular-nums sm:inline-flex", tom)}
      title={`${rotulo}: texto livre até ${dateTime(new Date(fechaEm!).toISOString())}. Depois, ${kind === "whatsapp" ? "só template aprovado" : "só quando o cliente escrever de novo"}.`}
    >
      <Clock size={12} className={clsx(restante <= HORA && "animate-pulse")} /> {relogio(restante)}
    </span>
  );
}

// ── Paleta de emoji (sem dependência) ───────────────────────

const EMOJIS = [
  "😀", "😁", "😂", "🤣", "😊", "😍", "😘", "😉", "🙂", "🤗", "🤩", "😎",
  "🤔", "😅", "😬", "🙄", "😢", "😭", "😡", "😮", "🥳", "😴", "🤝", "🙏",
  "👍", "👎", "👏", "🙌", "💪", "👋", "👌", "✌️", "❤️", "💙", "💚", "🔥",
  "✨", "⭐", "✅", "❌", "⚠️", "📍", "📅", "⏰", "💰", "💳", "📄", "📷",
  "🚗", "🚙", "🏎️", "🛻", "🔑", "⛽", "🛠️", "🎉", "🎁", "📞", "💬", "➡️",
];

export function EmojiPalette({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <button type="button" className="fixed inset-0 z-20 cursor-default" aria-label="Fechar emojis" onClick={onClose} />
      <div className="absolute bottom-full left-0 z-30 mb-2 grid w-72 grid-cols-8 gap-0.5 rounded-2xl border border-line bg-paper p-2 shadow-xl">
        {EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onPick(e)}
            className="rounded-lg p-1 text-lg leading-none transition hover:bg-canvas"
          >
            {e}
          </button>
        ))}
      </div>
    </>
  );
}

// ── Transferir / atribuir ───────────────────────────────────

type Membro = { email: string; name: string | null; role: "gestor" | "atendente" };

function nomeDoMembro(m: { email: string; name: string | null }): string {
  return m.name || m.email.split("@")[0].replace(/[._-]/g, " ");
}

export function AtribuirModal({
  assignedTo,
  currentEmail,
  onClose,
  onConfirm,
}: {
  assignedTo: string | null;
  currentEmail: string;
  onClose: () => void;
  /** email null = tirar o responsável. */
  onConfirm: (email: string | null, motivo: string) => Promise<boolean>;
}) {
  const [equipe, setEquipe] = useState<Membro[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [escolhido, setEscolhido] = useState<string>("");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    fetch("/api/wa/conversations/equipe")
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error ?? "Falha ao carregar a equipe");
        setEquipe(body.equipe ?? []);
      })
      .catch((e: Error) => setErro(e.message));
  }, []);

  const outros = useMemo(() => (equipe ?? []).filter((m) => m.email !== assignedTo), [equipe, assignedTo]);
  const responsavel = equipe?.find((m) => m.email === assignedTo) ?? null;

  async function confirmar(email: string | null) {
    setSalvando(true);
    const ok = await onConfirm(email, motivo.trim());
    setSalvando(false);
    if (ok) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-black/50" aria-label="Fechar" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-line bg-paper shadow-2xl sm:rounded-3xl">
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
            <Users size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Transferir conversa</p>
            <p className="truncate text-xs text-muted">
              {assignedTo
                ? `Com ${assignedTo === currentEmail ? "você" : responsavel ? nomeDoMembro(responsavel) : assignedTo}`
                : "Sem responsável"}
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-muted hover:bg-canvas" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {erro ? (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{erro}</p>
          ) : equipe == null ? (
            <p className="flex items-center gap-2 text-xs text-muted">
              <Loader2 size={13} className="animate-spin" /> Carregando a equipe…
            </p>
          ) : outros.length === 0 ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Ninguém mais na equipe. Convide atendentes na Configuração.
            </p>
          ) : (
            <div>
              <label className="label">Para quem</label>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-2xl border border-line p-1">
                {outros.map((m) => (
                  <button
                    key={m.email}
                    type="button"
                    onClick={() => setEscolhido(m.email)}
                    className={clsx(
                      "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition",
                      escolhido === m.email ? "bg-brand-100" : "hover:bg-canvas",
                    )}
                  >
                    <UserRound size={14} className="shrink-0 text-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold capitalize">
                        {nomeDoMembro(m)}
                        {m.email === currentEmail ? " (você)" : ""}
                      </span>
                      <span className="block truncate text-[11px] text-muted">{m.email}</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-800">{m.role}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="label">Motivo (opcional)</label>
            <textarea
              className="input min-h-[4.5rem] resize-y text-sm"
              placeholder="Ex.: cliente quer falar de financiamento"
              value={motivo}
              maxLength={500}
              onChange={(e) => setMotivo(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-muted">Fica como nota interna na conversa. O cliente não vê.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">
          {assignedTo && (
            <button className="btn-ghost mr-auto px-3 py-1.5 text-xs" disabled={salvando} onClick={() => confirmar(null)}>
              Tirar responsável
            </button>
          )}
          {assignedTo !== currentEmail && (
            <button className="btn-ghost px-3 py-1.5 text-xs" disabled={salvando} onClick={() => confirmar(currentEmail)}>
              {assignedTo ? "Assumir para mim" : "Ficar com ela"}
            </button>
          )}
          <button
            className="btn-primary px-4 py-1.5 text-xs"
            disabled={salvando || !escolhido}
            onClick={() => confirmar(escolhido)}
          >
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />} Transferir
          </button>
        </div>
      </div>
    </div>
  );
}
