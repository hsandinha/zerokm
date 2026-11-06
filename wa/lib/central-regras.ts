// Regras puras da Central que valem para uma conversa e para várias de uma
// vez (ações em lote): o que muda ao atribuir e o texto da linha do tempo.
// Puro de propósito: a mesma regra nas duas rotas, conferida em teste.

import type { WaConversationStatus } from "@wa/models/wa";

export type PatchDeAtribuicao = {
  assignedTo: string | null;
  status?: WaConversationStatus;
  waitingSince?: Date | null;
};

/**
 * Passar a conversa para alguém (ou tirar o responsável):
 * - para si mesmo: é assumir (a IA sai e o SLA para);
 * - para um colega: espera por ele, e o SLA conta desde a transferência;
 * - tirar o responsável de quem estava sendo atendido: volta para a fila
 *   (sem dono e sem IA, ninguém responderia e o SLA não contaria);
 * - conversa encerrada só troca o responsável.
 */
export function patchDeAtribuicao(
  atual: { status: WaConversationStatus },
  destino: string | null,
  quem: string,
  agora: Date = new Date(),
): PatchDeAtribuicao {
  const patch: PatchDeAtribuicao = { assignedTo: destino };
  if (destino && atual.status !== "closed") {
    if (destino === quem) {
      patch.status = "human_active";
      patch.waitingSince = null;
    } else {
      patch.status = "waiting_human";
      patch.waitingSince = agora;
    }
  }
  if (!destino && atual.status === "human_active") {
    patch.status = "waiting_human";
    patch.waitingSince = agora;
  }
  return patch;
}

/** A mudança tira a conversa da IA? Então os jobs pendentes são cancelados
 *  (regra de ouro: nunca IA e humano ao mesmo tempo). */
export function tiraDaIa(status: WaConversationStatus | undefined): boolean {
  return status === "human_active" || status === "closed" || status === "waiting_human";
}

/** Linha do tempo da atribuição ("Ana transferiu a conversa para Bruno."). */
export function linhaDaAtribuicao(p: {
  autor: string;
  destino: string | null;
  quem: string;
  /** Responsável de antes (e-mail) e os nomes para mostrar. */
  anterior: string | null | undefined;
  nomeDoDestino: string;
  nomeDoAnterior: string;
}): string {
  if (!p.destino) return `${p.autor} tirou o responsável da conversa.`;
  if (p.destino === p.quem) {
    return p.anterior && p.anterior !== p.quem
      ? `${p.autor} assumiu a conversa de ${p.nomeDoAnterior}.`
      : `${p.autor} assumiu a conversa.`;
  }
  return `${p.autor} transferiu a conversa para ${p.nomeDoDestino}.`;
}

/** Ids da seleção: válidos, sem repetir, com teto (a requisição não pode
 *  virar uma varredura da loja inteira). */
export const LOTE_MAX = 200;

export function idsDoLote(bruto: unknown, valido: (id: string) => boolean): string[] {
  if (!Array.isArray(bruto)) return [];
  const vistos = new Set<string>();
  for (const x of bruto) {
    const id = String(x ?? "").trim();
    if (id && valido(id)) vistos.add(id);
    if (vistos.size >= LOTE_MAX) break;
  }
  return [...vistos];
}

/** Rótulo do balão de saída: "IA", "Você", o nome de quem da equipe
 *  escreveu ou "Equipe" (mensagem antiga, ou respondida pelo celular). */
export function rotuloDoAutor(
  m: { sender: string; authorEmail?: string | null; authorName?: string | null },
  currentEmail: string,
): string {
  if (m.sender === "ai") return "IA";
  if (m.sender === "system") return "Sistema";
  if (m.sender !== "human") return "";
  const email = m.authorEmail?.toLowerCase() ?? null;
  if (!email) return "Equipe";
  if (email === currentEmail.toLowerCase()) return "Você";
  return m.authorName?.trim() || email.split("@")[0].replace(/[._-]/g, " ");
}
