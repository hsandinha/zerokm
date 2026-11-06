// Cliente do Chatrun Conexão (gateway) — conexao.chatrun.com.br.
//
// A regra do gateway vale aqui: a zerokm não guarda token da Meta nem recebe
// webhook da Meta. WhatsApp, Instagram e Messenger (do CNV e das lojas) são
// conectados pelo convite do gateway, no app da Chatrun; o envio, os modelos
// e a mídia passam pela API dele; o que chega volta assinado em
// /api/chatrun/eventos.
//
// Variáveis (a chave e o segredo saem prontos do /admin do gateway, ao
// cadastrar a plataforma "zerokm" com a callback_url
// https://www.cnv0km.com.br/api/chatrun/eventos):
//   CHATRUN_API_KEY          crk_live_... da plataforma
//   CHATRUN_CALLBACK_SECRET  segredo que assina os eventos
//   CHATRUN_URL              opcional, padrão https://conexao.chatrun.com.br

import { createHmac, timingSafeEqual } from "crypto";

export class ChatrunError extends Error {
  status: number;
  code: string | null;
  /** Código da Meta quando o gateway repassa um erro dela (meta_error). */
  metaCode: number | null;
  constructor(status: number, message: string, code: string | null = null, metaCode: number | null = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.metaCode = metaCode;
  }
}

function baseUrl(): string {
  return (process.env.CHATRUN_URL || "https://conexao.chatrun.com.br").replace(/\/+$/, "");
}

export function chatrunConfigured(): boolean {
  return Boolean(process.env.CHATRUN_API_KEY);
}

function apiKey(): string {
  const key = process.env.CHATRUN_API_KEY;
  if (!key) throw new ChatrunError(503, "Chatrun não configurado (CHATRUN_API_KEY).", "not_configured");
  return key;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ChatrunError(
      res.status,
      typeof body.error === "string" ? body.error : `Chatrun respondeu ${res.status}`,
      typeof body.code === "string" ? body.code : null,
      typeof body.meta_code === "number" ? body.meta_code : null,
    );
  }
  return body as T;
}

// ── Contas, convites e conexões ─────────────────────────────

export type ChatrunChannel = "whatsapp" | "instagram" | "messenger";

export type ChatrunConnection = {
  id: string;
  account_id: string;
  channel?: ChatrunChannel;
  status: "pending" | "connected" | "error" | "disconnected";
  status_detail?: string | null;
  waba_id?: string | null;
  phone_number_id?: string | null;
  display_phone?: string | null;
  verified_name?: string | null;
  quality_rating?: string | null;
  /** Instagram: a conta profissional. */
  ig_user_id?: string | null;
  ig_username?: string | null;
  /** Messenger: a Página do Facebook. */
  fb_page_id?: string | null;
  fb_page_name?: string | null;
  external_ref?: string | null;
};

/** Acha ou cria a conta da loja no gateway (pelo id guardado ou pelo e-mail). */
export async function resolveAccount(input: {
  accountId?: string | null;
  email?: string | null;
  name?: string | null;
}): Promise<{ id: string }> {
  const body = input.accountId
    ? { account_id: input.accountId }
    : { email: input.email, name: input.name ?? undefined };
  const r = await call<{ account: { id: string } }>("/api/v1/accounts/resolve", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return r.account;
}

/**
 * Link do convite: a página do gateway com o login oficial do canal (popup do
 * WhatsApp, login do Instagram ou do Facebook). Volta para `returnUrl` com
 * `status`, `connection_id`, `account_id` e `channel`.
 */
export async function invite(input: {
  accountId: string;
  externalRef: string;
  returnUrl: string;
  channel?: ChatrunChannel;
}): Promise<string> {
  const r = await call<{ url: string }>("/api/v1/invites", {
    method: "POST",
    body: JSON.stringify({
      account_id: input.accountId,
      channel: input.channel ?? "whatsapp",
      external_ref: input.externalRef,
      return_url: input.returnUrl,
      ttl_hours: 24,
    }),
  });
  return r.url;
}

/** Convite do WhatsApp (Cadastro Incorporado da Meta). */
export async function whatsappInvite(input: {
  accountId: string;
  externalRef: string;
  returnUrl: string;
}): Promise<string> {
  return invite({ ...input, channel: "whatsapp" });
}

/** Conexões vinculadas à zerokm com este external_ref (a loja, ou "cnv"). */
export async function connectionsOf(
  externalRef: string,
  channel: ChatrunChannel = "whatsapp",
): Promise<ChatrunConnection[]> {
  const r = await call<{ connections: ChatrunConnection[] }>(
    `/api/v1/connections?channel=${channel}&external_ref=${encodeURIComponent(externalRef)}`,
  );
  return r.connections ?? [];
}

export async function getConnection(id: string): Promise<ChatrunConnection> {
  const r = await call<{ connection?: ChatrunConnection } & ChatrunConnection>(
    `/api/v1/connections/${encodeURIComponent(id)}`,
  );
  return r.connection ?? r;
}

/** Desvincula só a zerokm (a conexão continua no gateway para as outras plataformas). */
export async function unlinkConnection(id: string): Promise<void> {
  await call(`/api/v1/connections/${encodeURIComponent(id)}/link`, { method: "DELETE" });
}

// ── Mensagens ───────────────────────────────────────────────

/** Parâmetro do cabeçalho do template, no formato do gateway (TemplateSend em
 *  src/lib/server/meta.ts do chatrun-conexao): texto para o {{1}} do
 *  cabeçalho de texto, ou o link público do arquivo do cabeçalho de mídia. */
export type ChatrunHeaderParam =
  | { type: "text"; text: string }
  | { type: "image" | "video" | "document"; link: string };

/** Final da URL de um botão de link dinâmico; `index` é a posição do botão
 *  entre TODOS os botões do template (o mesmo `index` de `button_vars`). */
export type ChatrunButtonUrlParam = { index: number; value: string };

export type ChatrunTemplateSend = {
  name: string;
  language: string;
  body_params?: string[];
  header_params?: ChatrunHeaderParam[];
  button_url_params?: ChatrunButtonUrlParam[];
};

export type ChatrunSend = {
  connectionId: string;
  to: string;
  type: "text" | "template" | "image" | "audio" | "video" | "document" | "sticker" | "reaction";
  text?: string;
  replyTo?: string | null;
  media?: { link: string; caption?: string | null; filename?: string | null };
  template?: ChatrunTemplateSend;
  reaction?: { wamid: string; emoji: string };
  /** Messenger: resposta de gente entre 24 h e 7 dias (tag HUMAN_AGENT). */
  humanAgent?: boolean;
  /** Idempotência do gateway: repetir o mesmo client_ref devolve a mensagem
   *  já enviada, sem falar com a Meta de novo. */
  clientRef?: string | null;
};

/**
 * Envia pelo gateway e devolve o wamid (o gateway fala com a Meta na hora).
 * `to`: telefone no WhatsApp; "ig:<id>" no Instagram; "fb:<PSID>" no Messenger.
 */
export async function sendMessage(input: ChatrunSend): Promise<string> {
  const perfil = /^(ig|fb):/.test(input.to);
  const r = await call<{ message: { wamid: string } }>("/api/v1/messages", {
    method: "POST",
    body: JSON.stringify({
      connection_id: input.connectionId,
      to: perfil ? input.to : input.to.replace(/\D/g, ""),
      ...(input.humanAgent ? { human_agent: true } : {}),
      type: input.type,
      ...(input.text != null ? { text: input.text } : {}),
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      ...(input.media ? { media: input.media } : {}),
      ...(input.template ? { template: limparTemplate(input.template) } : {}),
      ...(input.reaction ? { reaction: input.reaction } : {}),
      ...(input.clientRef ? { client_ref: input.clientRef } : {}),
    }),
  });
  return r.message?.wamid ?? "";
}

/** Só manda header_params e button_url_params quando existem: o corpo do
 *  pedido de um template simples continua igual ao de antes. */
function limparTemplate(t: ChatrunTemplateSend): ChatrunTemplateSend {
  return {
    name: t.name,
    language: t.language,
    ...(t.body_params ? { body_params: t.body_params } : {}),
    ...(t.header_params?.length ? { header_params: t.header_params } : {}),
    ...(t.button_url_params?.length ? { button_url_params: t.button_url_params } : {}),
  };
}

/** Marca como lida e mostra "digitando". */
export async function markRead(connectionId: string, wamid: string): Promise<void> {
  await call("/api/v1/messages/read", {
    method: "POST",
    body: JSON.stringify({ connection_id: connectionId, wamid, typing: true }),
  });
}

/** Bytes de uma mídia recebida (os ids expiram na Meta em alguns dias). */
export async function downloadMedia(
  connectionId: string,
  mediaId: string,
): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const res = await fetch(
    `${baseUrl()}/api/v1/media/${encodeURIComponent(mediaId)}?connection_id=${encodeURIComponent(connectionId)}`,
    { headers: { Authorization: `Bearer ${apiKey()}` }, cache: "no-store" },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    throw new ChatrunError(res.status, body.error ?? "falha ao baixar a mídia", body.code ?? null);
  }
  return {
    bytes: await res.arrayBuffer(),
    contentType: res.headers.get("content-type") ?? "application/octet-stream",
  };
}

// ── Modelos (templates) ─────────────────────────────────────

export type ChatrunTemplate = {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  body: string;
  footer: string | null;
  header_format: string | null;
  header_text: string | null;
  header_example?: string | null;
  body_example?: string[] | null;
  /** Quantas variáveis distintas o corpo tem. */
  var_count?: number;
  /** Textos dos botões, na ordem. */
  buttons?: string[];
  buttons_detail?: Array<{ type: string; text?: string; url?: string; phone_number?: string; example?: string }>;
  /** Botões de URL dinâmica: precisam de um valor por envio (button_url_params). */
  button_vars?: Array<{ index: number; text: string; url_prefix: string }>;
};

/** Todos os modelos da WABA da conexão (qualquer status). */
export async function listTemplates(connectionId: string): Promise<ChatrunTemplate[]> {
  const r = await call<{ templates: ChatrunTemplate[] }>(
    `/api/v1/templates?connection_id=${encodeURIComponent(connectionId)}&all=1`,
  );
  return r.templates ?? [];
}

export type ChatrunTemplateDraft = {
  name: string;
  category: string;
  language: string;
  body_text: string;
  example_values?: string[];
  footer_text?: string;
  /** Mídia: o gateway baixa a amostra de `sample_url` (https público) e sobe
   *  na Meta; a zerokm manda o link assinado de /api/wa/midia/[id]. */
  header?:
    | { format: "TEXT"; text: string; example?: string }
    | { format: "IMAGE" | "VIDEO" | "DOCUMENT"; sample_url: string };
  buttons?: Array<
    | { type: "QUICK_REPLY"; text: string }
    | { type: "URL"; text: string; url: string; example?: string }
    | { type: "PHONE_NUMBER"; text: string; phone_number: string }
  >;
};

export async function createTemplate(
  connectionId: string,
  draft: ChatrunTemplateDraft,
): Promise<{ id: string; status: string; category: string }> {
  return call("/api/v1/templates", {
    method: "POST",
    body: JSON.stringify({ connection_id: connectionId, ...draft }),
  });
}

export async function deleteTemplate(connectionId: string, name: string): Promise<void> {
  await call(
    `/api/v1/templates?connection_id=${encodeURIComponent(connectionId)}&name=${encodeURIComponent(name)}`,
    { method: "DELETE" },
  );
}

// ── Iscas de comentário (Instagram e Página do Facebook) ────
// Comentou no post → o gateway responde no comentário (opcional) e manda UMA
// mensagem privada (Direct ou Messenger). Quem fala com a Meta, deduplica o
// comentário e escolhe a isca é o gateway; aqui só se cadastra a regra e se
// recebe o resultado (instagram.comment_reply / messenger.comment_reply).

export type ChatrunCommentRule = {
  id: string;
  connection_id: string;
  /** _id da isca na zerokm (WaIsca): é por ele que o evento acha a isca. */
  external_ref: string | null;
  /** null = todos os posts. No Messenger é o id do post da Página. */
  media_id: string | null;
  /** null = qualquer comentário. O gateway compara sem acento e sem caixa. */
  keyword: string | null;
  public_reply: string | null;
  direct_message: string;
  active: boolean;
  priority: number;
  expires_at: string | null;
  created_at?: string;
  updated_at?: string;
};

/** Campos que o gateway aceita (POST cria, PATCH altera o que vier). Texto
 *  vazio ou null apaga o campo opcional. */
export type ChatrunCommentRuleInput = {
  media_id?: string | null;
  keyword?: string | null;
  public_reply?: string | null;
  direct_message?: string;
  external_ref?: string | null;
  active?: boolean;
  priority?: number;
  expires_at?: string | null;
};

export type ChatrunCommentRuleStats = { comments: number; directs: number; failures: number };

export async function listCommentRules(
  filtro: { connectionId?: string; externalRef?: string; mediaId?: string; active?: boolean } = {},
): Promise<ChatrunCommentRule[]> {
  const q = new URLSearchParams();
  if (filtro.connectionId) q.set("connection_id", filtro.connectionId);
  if (filtro.externalRef) q.set("external_ref", filtro.externalRef);
  if (filtro.mediaId) q.set("media_id", filtro.mediaId);
  if (filtro.active !== undefined) q.set("active", String(filtro.active));
  const qs = q.toString();
  const r = await call<{ rules: ChatrunCommentRule[] }>(`/api/v1/comment-rules${qs ? `?${qs}` : ""}`);
  return r.rules ?? [];
}

export async function createCommentRule(
  input: ChatrunCommentRuleInput & { connection_id: string; direct_message: string },
): Promise<{ rule: ChatrunCommentRule; warnings: string[] }> {
  const r = await call<{ rule: ChatrunCommentRule; warnings?: string[] }>("/api/v1/comment-rules", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return { rule: r.rule, warnings: r.warnings ?? [] };
}

/** A isca e os números dela no gateway (comentários, privadas enviadas, falhas). */
export async function getCommentRule(
  id: string,
): Promise<{ rule: ChatrunCommentRule; stats: ChatrunCommentRuleStats }> {
  return call(`/api/v1/comment-rules/${encodeURIComponent(id)}`);
}

export async function updateCommentRule(id: string, patch: ChatrunCommentRuleInput): Promise<ChatrunCommentRule> {
  const r = await call<{ rule: ChatrunCommentRule }>(`/api/v1/comment-rules/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return r.rule;
}

export async function deleteCommentRule(id: string): Promise<void> {
  await call(`/api/v1/comment-rules/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export type ChatrunPost = {
  id: string;
  caption: string | null;
  type: "image" | "video" | "carousel" | "reel" | "text";
  image_url: string | null;
  permalink: string | null;
  created_at: string | null;
};

/**
 * Posts recentes da conta (Instagram) ou da Página (Messenger), para escolher
 * a isca pela foto. null = o gateway não respondeu a lista (rota ainda não
 * publicada, Meta fora do ar, token): a tela volta ao campo do id do post.
 * Nunca lança: a lista é conveniência, não pode travar o cadastro.
 */
export async function postsDaConexao(connectionId: string, limit = 24): Promise<ChatrunPost[] | null> {
  try {
    const n = Math.min(Math.max(Math.floor(limit) || 24, 1), 50);
    const r = await call<{ posts?: unknown }>(
      `/api/v1/connections/${encodeURIComponent(connectionId)}/posts?limit=${n}`,
    );
    if (!Array.isArray(r.posts)) return null;
    return r.posts
      .filter((p): p is ChatrunPost => Boolean(p && typeof (p as ChatrunPost).id === "string"))
      .map((p) => ({
        id: p.id,
        caption: typeof p.caption === "string" ? p.caption : null,
        type: p.type ?? "image",
        image_url: typeof p.image_url === "string" ? p.image_url : null,
        permalink: typeof p.permalink === "string" ? p.permalink : null,
        created_at: typeof p.created_at === "string" ? p.created_at : null,
      }));
  } catch (err) {
    if (!(err instanceof ChatrunError && err.status === 404)) {
      console.warn("[chatrun] posts da conexão não listados:", err instanceof Error ? err.message : err);
    }
    return null;
  }
}

// ── Eventos ─────────────────────────────────────────────────

/** Assinatura dos eventos: sha256=<hmac(segredo, `${timestamp}.${corpo}`)>, até 5 min. */
export function validSignature(rawBody: string, headers: Headers): boolean {
  const secret = process.env.CHATRUN_CALLBACK_SECRET;
  if (!secret) return false;
  const ts = headers.get("x-chatrun-timestamp") ?? "";
  const sig = headers.get("x-chatrun-signature") ?? "";
  if (!sig.startsWith("sha256=")) return false;
  if (!ts || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${ts}.${rawBody}`, "utf8").digest("hex");
  const received = sig.slice("sha256=".length);
  return expected.length === received.length && timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

// ── Bloqueio (opt-out) ───────────────────────────────────────
// O gateway tem um bloqueio por conta que vale para todas as plataformas. A
// zerokm já respeita o opt-out nos próprios envios; o que ela grava lá é o
// motivo "no_automation", que barra só o que o gateway manda sozinho (a isca
// de comentário do Instagram) e deixa a equipe responder se a pessoa voltar a
// escrever. Esse motivo não enfraquece um bloqueio que outra plataforma gravou.

export async function blockContact(input: {
  accountId: string;
  phone: string;
  detail?: string;
  signal?: AbortSignal;
}): Promise<void> {
  await call("/api/v1/blocked", {
    method: "POST",
    body: JSON.stringify({
      account_id: input.accountId,
      phone: input.phone,
      reason: "no_automation",
      ...(input.detail ? { detail: input.detail.slice(0, 200) } : {}),
    }),
    signal: input.signal,
  });
}

export async function unblockContact(input: { accountId: string; phone: string; signal?: AbortSignal }): Promise<void> {
  await call("/api/v1/blocked", {
    method: "DELETE",
    // Com o motivo: tira só o bloqueio que a zerokm pôs, nunca o de outra plataforma.
    body: JSON.stringify({ account_id: input.accountId, phone: input.phone, reason: "no_automation" }),
    signal: input.signal,
  });
}
