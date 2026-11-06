// Regras puras das respostas rápidas (servidor e tela usam as mesmas).

import type { IWaQuickReply } from "@wa/models/atendimento";

/** Primeiro nome do contato, sem o @ do Instagram e sem sobrar espaço. */
export function primeiroNome(nome: string | null | undefined): string {
  const limpo = (nome ?? "").replace(/^@/, "").trim();
  if (!limpo) return "";
  const primeiro = limpo.split(/\s+/)[0];
  // "JOÃO" ou "joão" viram "João": o texto pronto não pode gritar com o cliente.
  return primeiro.charAt(0).toLocaleUpperCase("pt-BR") + primeiro.slice(1).toLocaleLowerCase("pt-BR");
}

/**
 * Troca {{nome}} pelo primeiro nome. Sem nome conhecido, a variável some com
 * o espaço e a vírgula que a acompanham ("Oi {{nome}}, tudo bem?" vira
 * "Oi, tudo bem?"), em vez de mandar "{{nome}}" para o cliente.
 */
export function aplicarVariaveis(texto: string, ctx: { nome?: string | null }): string {
  const nome = primeiroNome(ctx.nome);
  if (nome) return texto.replace(/\{\{\s*nome\s*\}\}/gi, nome);
  return texto
    .replace(/[ \t]*\{\{\s*nome\s*\}\}/gi, "")
    .replace(/[ \t]+([,.!?])/g, "$1");
}

/** Atalho normalizado: minúsculo, sem barra, sem espaço nem acento. */
export function normalizarAtalho(atalho: string): string {
  return atalho
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^\/+/, "")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 30);
}

export type RespostaRapida = {
  id: string;
  title: string;
  shortcut: string;
  text: string;
  category: string | null;
};

/** O que o "/" digitado no campo filtra: atalho primeiro, depois título. */
export function filtrarRespostas(lista: RespostaRapida[], termo: string): RespostaRapida[] {
  const t = normalizarAtalho(termo);
  if (!t) return lista;
  const porAtalho = lista.filter((r) => r.shortcut.startsWith(t));
  const porTitulo = lista.filter(
    (r) => !r.shortcut.startsWith(t) && normalizarAtalho(r.title).includes(t),
  );
  return [...porAtalho, ...porTitulo];
}

/** Formato da tela (o mesmo na lista e depois de salvar). */
export function respostaParaTela(r: Pick<IWaQuickReply, "title" | "shortcut" | "text" | "category"> & { _id: unknown }) {
  return {
    id: String(r._id),
    title: r.title,
    shortcut: r.shortcut,
    text: r.text,
    category: r.category ?? null,
  };
}

/** Corpo do formulário já limpo; erro em texto para a tela mostrar. */
export function lerResposta(body: Record<string, unknown>):
  | { ok: true; data: { title: string; shortcut: string; text: string; category?: string } }
  | { ok: false; error: string } {
  const title = String(body.title ?? "").trim().slice(0, 80);
  const text = String(body.text ?? "").trim().slice(0, 4000);
  const shortcut = normalizarAtalho(String(body.shortcut ?? "") || title);
  // Vazio = sem categoria (undefined: o update do Mongo remove o campo).
  const category = String(body.category ?? "").trim().slice(0, 40) || undefined;
  if (!title) return { ok: false, error: "Dê um título para a resposta." };
  if (!text) return { ok: false, error: "Escreva o texto da resposta." };
  if (!shortcut) return { ok: false, error: "O atalho aceita letras, números, - e _." };
  return { ok: true, data: { title, shortcut, text, category } };
}
