// Iscas de comentário: regras puras, usadas pela tela e pelo servidor.
//
// Validação do que o gestor digita, montagem do corpo que vai ao gateway
// (/api/v1/comment-rules) e o aviso de isca repetida. Sem banco e sem rede:
// a tela importa este arquivo.

import type { ChatrunCommentRuleInput } from "@wa/lib/chatrun";

/** Limites do gateway (os da Meta): privada e resposta pública até 1000. */
export const LIMITE_DIRECT = 1000;
export const LIMITE_PUBLICO = 1000;
export const LIMITE_PALAVRA = 60;
const LIMITE_MEDIA_ID = 64;
const LIMITE_LEGENDA = 300;

/** A regra da Meta que dá o formato da isca, em uma linha para a tela. */
export const REGRA_DA_META =
  "A Meta permite uma mensagem privada por comentário, em até 7 dias depois dele. Se a pessoa responder, a conversa segue na Central.";

export type CanalDaIsca = "instagram" | "messenger";

/** Canal que pode ter isca (Instagram ou Página conectados pelo gateway). */
export type CanalDeIsca = {
  id: string;
  kind: CanalDaIsca;
  label: string;
  status: "connected" | "error" | "disconnected";
};

/** Post para escolher pela foto. */
export type PostDaIsca = {
  id: string;
  legenda: string | null;
  tipo: string;
  imagem: string | null;
  link: string | null;
  em: string | null;
};

/** A isca como a tela mostra. */
export type IscaView = {
  id: string;
  channelId: string;
  canal: CanalDaIsca;
  mediaId: string | null;
  postLegenda: string | null;
  postImagem: string | null;
  postLink: string | null;
  keyword: string | null;
  publicReply: string | null;
  directMessage: string;
  ativo: boolean;
  priority: number;
  comentarios: number;
  directs: number;
  falhas: number;
  createdAt: string;
};

/** Comentário recebido, com o que a isca fez. */
export type ComentarioView = {
  id: string;
  channelId: string;
  canal: CanalDaIsca;
  mediaId: string | null;
  texto: string;
  autor: string;
  iscaId: string | null;
  respondeuPublico: boolean;
  respondeuDirect: boolean;
  erro: string | null;
  conversationId: string | null;
  em: string;
};

/** O que se grava na isca (o canal só na criação: trocar de canal é outra isca). */
export type CamposDaIsca = {
  mediaId: string | null;
  postLegenda: string | null;
  postImagem: string | null;
  postLink: string | null;
  keyword: string | null;
  publicReply: string | null;
  directMessage: string;
  ativo: boolean;
  priority: number;
};

/** Sem acento, sem caixa e sem espaço sobrando: o gateway compara assim,
 *  então "Eu Querô" e "eu quero" são a mesma palavra. */
export function normalizarPalavra(texto: string | null | undefined): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function texto(valor: unknown): string | null | undefined {
  if (valor === undefined) return undefined;
  if (valor === null) return null;
  if (typeof valor !== "string") return undefined;
  const t = valor.trim();
  return t ? t : null;
}

/** Link da Meta (foto e permalink do post): só https, senão fica sem. */
function link(valor: unknown): string | null {
  const t = texto(valor);
  if (!t) return null;
  try {
    const u = new URL(t);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export type LeituraDaIsca =
  | { ok: true; campos: Partial<CamposDaIsca>; channelId: string | null }
  | { ok: false; erro: string };

/**
 * Normaliza o corpo do formulário. `criando` exige o canal e a mensagem
 * privada e preenche o padrão do que faltar; na edição só vem o que mudou.
 */
export function lerIsca(body: unknown, criando: boolean): LeituraDaIsca {
  if (!body || typeof body !== "object") return { ok: false, erro: "Dados inválidos." };
  const b = body as Record<string, unknown>;
  const campos: Partial<CamposDaIsca> = {};

  const channelId = typeof b.channelId === "string" && b.channelId.trim() ? b.channelId.trim() : null;
  if (criando && !channelId) return { ok: false, erro: "Escolha o canal da isca." };

  if (b.keyword !== undefined || criando) {
    const k = texto(b.keyword);
    const limpa = k ? k.replace(/\s+/g, " ") : null;
    if (limpa && limpa.length > LIMITE_PALAVRA) {
      return { ok: false, erro: `A palavra-chave passa de ${LIMITE_PALAVRA} caracteres.` };
    }
    campos.keyword = limpa ?? null;
  }

  if (b.publicReply !== undefined || criando) {
    const p = texto(b.publicReply);
    if (p && p.length > LIMITE_PUBLICO) {
      return { ok: false, erro: `A resposta pública passa de ${LIMITE_PUBLICO} caracteres.` };
    }
    campos.publicReply = p ?? null;
  }

  if (b.directMessage !== undefined || criando) {
    const d = texto(b.directMessage);
    if (!d) return { ok: false, erro: "Escreva a mensagem que a pessoa recebe no privado." };
    if (d.length > LIMITE_DIRECT) {
      return { ok: false, erro: `A mensagem privada passa de ${LIMITE_DIRECT} caracteres.` };
    }
    campos.directMessage = d;
  }

  if (b.mediaId !== undefined || criando) {
    const m = texto(b.mediaId);
    if (m && (m.length > LIMITE_MEDIA_ID || !/^[A-Za-z0-9_:-]+$/.test(m))) {
      return { ok: false, erro: "Id do post inválido: cole só o número do post (ou escolha pela foto)." };
    }
    campos.mediaId = m ?? null;
    // O que a tela mostra do post só vale com um post escolhido.
    const post = (b.post && typeof b.post === "object" ? b.post : {}) as Record<string, unknown>;
    const legenda = m ? texto(post.legenda) : null;
    campos.postLegenda = legenda ? legenda.slice(0, LIMITE_LEGENDA) : null;
    campos.postImagem = m ? link(post.imagem) : null;
    campos.postLink = m ? link(post.link) : null;
  }

  if (b.ativo !== undefined) {
    if (typeof b.ativo !== "boolean") return { ok: false, erro: "Ativa precisa ser sim ou não." };
    campos.ativo = b.ativo;
  } else if (criando) {
    campos.ativo = true;
  }

  if (b.priority !== undefined && b.priority !== null && b.priority !== "") {
    const n = Number(b.priority);
    if (!Number.isInteger(n) || n < -1000 || n > 1000) {
      return { ok: false, erro: "A prioridade é um número inteiro entre -1000 e 1000." };
    }
    campos.priority = n;
  } else if (criando) {
    campos.priority = 0;
  }

  return { ok: true, campos, channelId };
}

/** O corpo para o gateway, só com o que veio (no PATCH, o resto não muda).
 *  null apaga o opcional lá: post vazio = todos os posts. */
export function corpoDaRegra(campos: Partial<CamposDaIsca>): ChatrunCommentRuleInput {
  return {
    ...(campos.mediaId !== undefined ? { media_id: campos.mediaId } : {}),
    ...(campos.keyword !== undefined ? { keyword: campos.keyword } : {}),
    ...(campos.publicReply !== undefined ? { public_reply: campos.publicReply } : {}),
    ...(campos.directMessage !== undefined ? { direct_message: campos.directMessage } : {}),
    ...(campos.ativo !== undefined ? { active: campos.ativo } : {}),
    ...(campos.priority !== undefined ? { priority: campos.priority } : {}),
  };
}

type IscaParaComparar = {
  id?: string | null;
  channelId: string;
  mediaId: string | null;
  keyword: string | null;
  ativo: boolean;
};

/**
 * Outra isca ativa no mesmo canal, no mesmo post e com a mesma palavra (sem
 * acento e sem caixa)? O gateway só manda uma por comentário: a segunda
 * nunca dispararia, e o gestor acharia que ela está funcionando.
 */
export function iscaRepetida<T extends IscaParaComparar>(existentes: T[], nova: IscaParaComparar): T | null {
  if (!nova.ativo) return null;
  const palavra = normalizarPalavra(nova.keyword);
  return (
    existentes.find(
      (e) =>
        e.ativo &&
        String(e.id ?? "") !== String(nova.id ?? "") &&
        e.channelId === nova.channelId &&
        (e.mediaId ?? null) === (nova.mediaId ?? null) &&
        normalizarPalavra(e.keyword) === palavra,
    ) ?? null
  );
}

/** Legenda curta do post para a lista e para a linha do tempo. */
export function resumoDaLegenda(legenda: string | null | undefined, max = 60): string {
  const t = (legenda ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** Canal que o modal abre escolhido: o primeiro conectado (ou o primeiro). */
export function canalInicial(canais: CanalDeIsca[]): CanalDeIsca | null {
  return canais.find((c) => c.status === "connected") ?? canais[0] ?? null;
}

export const NOME_DO_CANAL: Record<CanalDaIsca, string> = { instagram: "Instagram", messenger: "Messenger" };
/** Onde a mensagem privada chega, para os textos da tela. */
export const PRIVADO_DO_CANAL: Record<CanalDaIsca, string> = { instagram: "Direct", messenger: "Messenger" };

/** O erro do resultado da isca quando o gateway não mandou porque o contato
 *  está bloqueado lá (pediu para sair). Não é falha: é o opt-out valendo. */
export function bloqueadoNoGateway(erro: string | null | undefined): boolean {
  return Boolean(erro && /^contato bloqueado/i.test(erro.trim()));
}
