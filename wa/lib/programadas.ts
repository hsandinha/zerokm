// Mensagem programada: as regras puras (usadas pela rota ao programar, pelo
// worker na hora do envio e pela tela). A regra da janela vale na HORA DO
// ENVIO: se o cliente escreveu depois de programarem, sai o texto mesmo que
// tenham escolhido template.

import type { FormaDoTemplate } from "@wa/lib/meta";

const HORA = 3600_000;
const DIA = 24 * HORA;

/** Até quando dá para programar (e o mínimo de antecedência). */
export const PROGRAMAR_MAX_DIAS = 60;
export const PROGRAMAR_MIN_MS = 60_000;
/** "enviando" parado há mais que isto: o worker caiu no meio. */
export const ENVIANDO_PRESO_MS = 10 * 60_000;

/** Fuso das lojas (Brasil sem horário de verão desde 2019). */
export const FUSO = "-03:00";

/** Texto livre sai neste canal, neste momento? (mesma regra de podeMandarLivre) */
export function livreEm(kind: string, lastInboundAt: Date | string | null | undefined, momento: number): boolean {
  if (kind === "sms") return true;
  if (!lastInboundAt) return false;
  const limite = kind === "instagram" || kind === "messenger" ? 7 * DIA : DIA;
  return momento - new Date(lastInboundAt).getTime() < limite;
}

const NOME_DO_CANAL: Record<string, string> = { instagram: "Instagram", messenger: "Messenger" };

export type DecisaoDoEnvio = { como: "texto" } | { como: "template" } | { falha: string };

/** Na hora do envio: o texto, o template no lugar, ou por que não sai. */
export function decidirEnvio(p: {
  kind: string;
  lastInboundAt: Date | string | null | undefined;
  agora: number;
  temModelo: boolean;
  optOut?: boolean;
}): DecisaoDoEnvio {
  if (p.optOut) return { falha: "O contato pediu para não receber mensagens (opt-out)." };
  if (livreEm(p.kind, p.lastInboundAt, p.agora)) return { como: "texto" };
  if (p.kind === "whatsapp") {
    return p.temModelo
      ? { como: "template" }
      : { falha: "Na hora do envio já tinham passado 24 horas da última mensagem do cliente, e não havia template escolhido." };
  }
  return {
    falha: `Janela do ${NOME_DO_CANAL[p.kind] ?? "canal"} fechada na hora do envio: só dá para responder quando o cliente escrever de novo.`,
  };
}

/** Ao programar: o que barra antes de gravar. null = pode programar. */
export function erroAoProgramar(p: {
  kind: string;
  lastInboundAt: Date | string | null | undefined;
  enviarEm: Date;
  agora: number;
  texto: string;
  temModelo: boolean;
  optOut?: boolean;
}): string | null {
  if (!p.texto.trim()) return "Escreva a mensagem.";
  if (p.texto.length > 4096) return "Mensagem longa demais (até 4.096 caracteres).";
  const quando = p.enviarEm.getTime();
  if (!Number.isFinite(quando)) return "Escolha o dia e a hora.";
  if (quando < p.agora + PROGRAMAR_MIN_MS) return "Escolha um horário daqui a pelo menos 1 minuto.";
  if (quando > p.agora + PROGRAMAR_MAX_DIAS * DIA) return `Dá para programar até ${PROGRAMAR_MAX_DIAS} dias à frente.`;
  if (p.optOut) return "O contato pediu para não receber mensagens (opt-out).";
  if (livreEm(p.kind, p.lastInboundAt, quando)) return null;
  if (p.kind === "whatsapp") {
    return p.temModelo ? null : "Nessa hora a janela de 24h já terá fechado: escolha o template que sai no lugar.";
  }
  return `Nessa hora a janela do ${NOME_DO_CANAL[p.kind] ?? "canal"} já terá fechado e a mensagem não sairia. Escolha um horário antes.`;
}

/** Template que dá para guardar para depois: só corpo (com variáveis já
 *  preenchidas). Arquivo no cabeçalho, {{1}} no cabeçalho ou link dinâmico
 *  pedem o que só se escolhe na hora: esses saem pela Central ou campanha. */
export function templateProgramavel(f: Pick<FormaDoTemplate, "headerFormat" | "headerVars" | "botoesUrl">): boolean {
  if (f.headerFormat && f.headerFormat !== "TEXT") return false;
  if (f.headerVars > 0) return false;
  return f.botoesUrl.length === 0;
}

/** "sex., 07/11, 07:00" no horário de Brasília. */
export function quandoTexto(d: Date | string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(d));
}
