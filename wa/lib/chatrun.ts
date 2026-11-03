// Cliente do Chatrun Conexão (gateway) — conexao.chatrun.com.br.
//
// A regra do gateway vale aqui: a zerokm não guarda token da Meta nem recebe
// o webhook do WhatsApp das lojas. A loja conecta o número pelo convite do
// gateway (Cadastro Incorporado da Meta, no app da Chatrun); o envio, os
// modelos e a mídia passam pela API dele; o que chega volta assinado em
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

export type ChatrunConnection = {
  id: string;
  account_id: string;
  channel?: "whatsapp" | "instagram" | "messenger";
  status: "pending" | "connected" | "error" | "disconnected";
  status_detail?: string | null;
  waba_id?: string | null;
  phone_number_id?: string | null;
  display_phone?: string | null;
  verified_name?: string | null;
  quality_rating?: string | null;
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

/** Link do convite do WhatsApp (popup da Meta na página do gateway). */
export async function whatsappInvite(input: {
  accountId: string;
  externalRef: string;
  returnUrl: string;
}): Promise<string> {
  const r = await call<{ url: string }>("/api/v1/invites", {
    method: "POST",
    body: JSON.stringify({
      account_id: input.accountId,
      channel: "whatsapp",
      external_ref: input.externalRef,
      return_url: input.returnUrl,
      ttl_hours: 24,
    }),
  });
  return r.url;
}

/** Conexões de WhatsApp vinculadas à zerokm com este external_ref (a loja). */
export async function connectionsOf(externalRef: string): Promise<ChatrunConnection[]> {
  const r = await call<{ connections: ChatrunConnection[] }>(
    `/api/v1/connections?channel=whatsapp&external_ref=${encodeURIComponent(externalRef)}`,
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

export type ChatrunSend = {
  connectionId: string;
  to: string;
  type: "text" | "template" | "image" | "audio" | "video" | "document" | "sticker" | "reaction";
  text?: string;
  replyTo?: string | null;
  media?: { link: string; caption?: string | null; filename?: string | null };
  template?: { name: string; language: string; body_params?: string[] };
  reaction?: { wamid: string; emoji: string };
};

/** Envia pelo gateway e devolve o wamid (o gateway fala com a Meta na hora). */
export async function sendMessage(input: ChatrunSend): Promise<string> {
  const r = await call<{ message: { wamid: string } }>("/api/v1/messages", {
    method: "POST",
    body: JSON.stringify({
      connection_id: input.connectionId,
      to: input.to.replace(/\D/g, ""),
      type: input.type,
      ...(input.text != null ? { text: input.text } : {}),
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      ...(input.media ? { media: input.media } : {}),
      ...(input.template ? { template: input.template } : {}),
      ...(input.reaction ? { reaction: input.reaction } : {}),
    }),
  });
  return r.message?.wamid ?? "";
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
  buttons_detail?: Array<{ type: string; text?: string; url?: string; phone_number?: string; example?: string }>;
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
  header?: { format: "TEXT"; text: string; example?: string };
  buttons?: Array<{ type: "QUICK_REPLY"; text: string } | { type: "URL"; text: string; url: string; example?: string }>;
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
