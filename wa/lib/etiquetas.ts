// Etiquetas da Central (VIP, Financiamento, Troca...): regras puras, usadas
// pelas rotas e pela tela. A loja cria as dela; a conversa guarda os ids.

import { COLUNA_CORES } from "@wa/lib/stages";

/** Teto por loja: etiqueta demais vira ruído na barra lateral. */
export const MAX_ETIQUETAS = 40;
export const NOME_MAX = 40;

export type Etiqueta = { id: string; nome: string; cor: string; conversas?: number };

/** Chave de unicidade: "VIP", " vip " e "Víp" são a mesma etiqueta. */
export function chaveDaEtiqueta(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function lerEtiqueta(
  body: unknown,
): { ok: true; data: { nome: string; cor: string; chave: string } } | { ok: false; error: string } {
  const b = (body && typeof body === "object" ? body : {}) as { nome?: unknown; cor?: unknown };
  const nome = String(b.nome ?? "").replace(/\s+/g, " ").trim();
  if (!nome) return { ok: false, error: "Dê um nome à etiqueta." };
  if (nome.length > NOME_MAX) return { ok: false, error: `Nome com até ${NOME_MAX} caracteres.` };
  const cor = typeof b.cor === "string" && b.cor in COLUNA_CORES ? b.cor : "azul";
  return { ok: true, data: { nome, cor, chave: chaveDaEtiqueta(nome) } };
}
