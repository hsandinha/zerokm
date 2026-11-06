// Regras da equipe que valem no servidor e na tela: status de quem atende
// (Online, Pausa, Ausente), o sinal de vida do navegador, o rodízio da
// distribuição automática e a meta de primeira resposta (SLA). Puro, sem
// banco: roda também no browser.

import { SLA_MINUTES } from "@wa/lib/stages";

export type StatusAtendente = "online" | "pausa" | "ausente";
export const STATUS_ATENDENTE: StatusAtendente[] = ["online", "pausa", "ausente"];

export function isStatusAtendente(v: unknown): v is StatusAtendente {
  return v === "online" || v === "pausa" || v === "ausente";
}

/** A moldura manda um sinal por minuto (e na hora em que a aba volta). */
export const PING_MS = 60_000;

/** Sem sinal há mais que isso = navegador fechado: a pessoa conta como
 *  Ausente e deixa de receber conversa, sem precisar lembrar de marcar. */
export const SINAL_MAX_MS = 3 * 60_000;

/** A aba estava na frente há menos que isso: o push não sai (a tela já
 *  mostra). A moldura manda sinal também ao ganhar e perder o foco. */
export const FOCO_MAX_MS = 90_000;

export function statusEfetivo(
  row: { status?: string | null; vistoEm?: Date | string | null } | null | undefined,
  agora: number = Date.now(),
): StatusAtendente {
  if (!row?.vistoEm) return "ausente";
  if (agora - new Date(row.vistoEm).getTime() > SINAL_MAX_MS) return "ausente";
  return isStatusAtendente(row.status) ? row.status : "online";
}

export const STATUS_ROTULO: Record<StatusAtendente, string> = {
  online: "Online",
  pausa: "Pausa",
  ausente: "Ausente",
};

export const STATUS_COR: Record<StatusAtendente, { dot: string; texto: string }> = {
  online: { dot: "bg-emerald-500", texto: "text-emerald-700" },
  pausa: { dot: "bg-amber-500", texto: "text-amber-700" },
  ausente: { dot: "bg-ink-300", texto: "text-muted" },
};

export const MOTIVOS_DE_PAUSA = ["Almoço", "Café", "Reunião", "Atendendo na loja"];

export type ModoDistribuicao = "manual" | "rodizio";

export function isModoDistribuicao(v: unknown): v is ModoDistribuicao {
  return v === "manual" || v === "rodizio";
}

export const DISTRIBUICAO_ROTULO: Record<ModoDistribuicao, string> = {
  manual: "Desligada (a equipe pega da fila)",
  rodizio: "Rodízio entre quem está Online",
};

export const SLA_MIN_MINUTOS = 1;
export const SLA_MAX_MINUTOS = 1440;

/** Meta de primeira resposta da loja, em minutos (padrão 15). */
export function slaValido(v: unknown): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < SLA_MIN_MINUTOS) return SLA_MINUTES;
  return Math.min(n, SLA_MAX_MINUTOS);
}

export type CandidatoRodizio = {
  email: string;
  ultimaAtribuicaoEm?: Date | string | null;
  vistoEm?: Date | string | null;
};

/**
 * Quem recebe a próxima conversa no rodízio: quem recebeu há mais tempo
 * (nunca recebeu = primeiro); empate vai para quem deu sinal mais recente.
 * `excluir`: quem acabou de devolver a conversa para a fila não a recebe de
 * volta.
 */
export function escolherNoRodizio<T extends CandidatoRodizio>(candidatos: T[], excluir?: string | null): T | null {
  const t = (v: Date | string | null | undefined) => (v ? new Date(v).getTime() : 0);
  const lista = candidatos.filter((c) => c.email !== excluir);
  if (!lista.length) return null;
  return [...lista].sort(
    (a, b) => t(a.ultimaAtribuicaoEm) - t(b.ultimaAtribuicaoEm) || t(b.vistoEm) - t(a.vistoEm),
  )[0];
}

/** "agora", "4 min", "1 h 05", "3 dias". */
export function formatarDuracao(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000));
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h ${String(min % 60).padStart(2, "0")}`;
  return `${Math.floor(h / 24)} dias`;
}

/** Segundos em texto curto para métricas: "45 s", "3 min", "1 h 10". */
export function formatarSegundos(seg: number | null | undefined): string {
  if (seg === null || seg === undefined || !Number.isFinite(Number(seg))) return "sem dados";
  const s = Math.round(Number(seg));
  if (s < 60) return `${s} s`;
  return formatarDuracao(s * 1000);
}
