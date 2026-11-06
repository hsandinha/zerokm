// Wrapper da Meta WhatsApp Cloud API (fetch puro) — credenciais POR CANAL.
// Portado do padrão validado no pnlcreditoseguro.

import { createHmac, timingSafeEqual } from "crypto";
import * as chatrun from "@wa/lib/chatrun";

const GRAPH_VERSION = "v21.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export type MetaCredentials = {
  token: string;
  phoneNumberId: string;
  wabaId?: string | null;
  appSecret?: string | null;
  /** Canal conectado pelo Chatrun Conexão: não há token aqui, tudo (envio,
   *  modelos, mídia) passa pelo gateway com esta conexão. */
  chatrunConnectionId?: string | null;
};

export class MetaApiError extends Error {
  status: number;
  code: number | null;
  constructor(status: number, message: string, code: number | null = null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Erro do gateway no formato que o resto do módulo já entende. */
export async function viaChatrun<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof chatrun.ChatrunError) {
      // Fora da janela o gateway barra antes da Meta: mesmo código que ela daria.
      const code = err.metaCode ?? (err.code === "outside_24h_window" ? 131047 : null);
      throw new MetaApiError(err.status, err.message, code);
    }
    throw err;
  }
}

async function graphFetch(
  creds: MetaCredentials,
  path: string,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${creds.token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = body?.error as { message?: string; code?: number } | undefined;
    throw new MetaApiError(
      res.status,
      err?.message ?? `Meta API ${res.status}`,
      err?.code ?? null,
    );
  }
  return body;
}

// ── Validação do canal (onboarding) ─────────────────────────
export async function fetchPhoneInfo(creds: MetaCredentials) {
  const cid = creds.chatrunConnectionId;
  if (cid) {
    const c = await viaChatrun(() => chatrun.getConnection(cid));
    return {
      display_phone_number: c.display_phone ?? undefined,
      verified_name: c.verified_name ?? undefined,
      quality_rating: c.quality_rating ?? undefined,
    };
  }
  const data = await graphFetch(
    creds,
    `/${creds.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
  );
  return data as {
    display_phone_number?: string;
    verified_name?: string;
    quality_rating?: string;
  };
}

// ── Envio ────────────────────────────────────────────────────
type SendResult = { external_id: string };

function extractWamid(body: Record<string, unknown>): string {
  const messages = body.messages as Array<{ id: string }> | undefined;
  return messages?.[0]?.id ?? "";
}

export type WabaInfo = {
  name?: string;
  account_review_status?: string;
  currency?: string;
};

/** Dados da conta: nome e situação da revisão da Meta. */
export async function fetchWabaInfo(creds: MetaCredentials): Promise<WabaInfo> {
  // Pelo Chatrun a WABA é do gateway: a revisão da conta é acompanhada lá.
  if (!creds.wabaId || creds.chatrunConnectionId) return {};
  const data = await graphFetch(
    creds,
    `/${creds.wabaId}?fields=name,account_review_status,timezone_id,currency`,
  );
  return data as WabaInfo;
}

export async function sendText(
  creds: MetaCredentials,
  to: string,
  text: string,
  replyToExternalId?: string | null,
): Promise<SendResult> {
  const cid = creds.chatrunConnectionId;
  if (cid) {
    const wamid = await viaChatrun(() =>
      chatrun.sendMessage({ connectionId: cid, to, type: "text", text, replyTo: replyToExternalId }),
    );
    return { external_id: wamid };
  }
  const body = await graphFetch(creds, `/${creds.phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: to.replace(/\D/g, ""),
      ...(replyToExternalId ? { context: { message_id: replyToExternalId } } : {}),
      type: "text",
      text: { body: text, preview_url: false },
    }),
  });
  return { external_id: extractWamid(body) };
}

// ── Mídia ────────────────────────────────────────────────────
export type WhatsAppMediaType =
  | "image"
  | "audio"
  | "video"
  | "document"
  | "sticker";

// Deriva o tipo de mídia do WhatsApp a partir do mime-type do arquivo.
export function mediaTypeFromMime(mime: string): WhatsAppMediaType {
  const base = (mime || "").split(";")[0].trim().toLowerCase();
  if (base.startsWith("image/")) return base === "image/webp" ? "sticker" : "image";
  if (base.startsWith("video/")) return "video";
  if (base.startsWith("audio/")) return "audio";
  return "document";
}

// Envia uma mídia por link (a Meta busca a URL — usamos uma signed URL do Storage).
export async function sendMedia(
  creds: MetaCredentials,
  to: string,
  mediaUrl: string,
  type: WhatsAppMediaType = "image",
  caption?: string,
  filename?: string,
  replyToExternalId?: string | null,
): Promise<SendResult> {
  // Só image/video/document aceitam caption; document aceita filename.
  const supportsCaption = type === "image" || type === "video" || type === "document";
  const mediaObject: Record<string, unknown> = { link: mediaUrl };
  if (caption && supportsCaption) mediaObject.caption = caption;
  if (filename && type === "document") mediaObject.filename = filename;

  const cid = creds.chatrunConnectionId;
  if (cid) {
    const wamid = await viaChatrun(() =>
      chatrun.sendMessage({
        connectionId: cid,
        to,
        type,
        media: {
          link: mediaUrl,
          caption: supportsCaption ? caption ?? null : null,
          filename: type === "document" ? filename ?? null : null,
        },
        replyTo: replyToExternalId,
      }),
    );
    return { external_id: wamid };
  }

  const body = await graphFetch(creds, `/${creds.phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to.replace(/\D/g, ""),
      ...(replyToExternalId ? { context: { message_id: replyToExternalId } } : {}),
      type,
      [type]: mediaObject,
    }),
  });
  return { external_id: extractWamid(body) };
}

// Reação a uma mensagem (emoji vazio remove a reação).
export async function sendReaction(
  creds: MetaCredentials,
  to: string,
  messageId: string,
  emoji: string,
): Promise<SendResult> {
  const cid = creds.chatrunConnectionId;
  if (cid) {
    const wamid = await viaChatrun(() =>
      chatrun.sendMessage({ connectionId: cid, to, type: "reaction", reaction: { wamid: messageId, emoji } }),
    );
    return { external_id: wamid };
  }
  const body = await graphFetch(creds, `/${creds.phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to.replace(/\D/g, ""),
      type: "reaction",
      reaction: { message_id: messageId, emoji },
    }),
  });
  return { external_id: extractWamid(body) };
}

// ── Download de mídia recebida ───────────────────────────────
// A URL da mídia é resolvida a partir do media id, depois baixada com o token.
async function getMediaUrl(creds: MetaCredentials, mediaId: string): Promise<string | null> {
  const data = await graphFetch(creds, `/${mediaId}`);
  return (data.url as string | undefined) ?? null;
}

export async function downloadMedia(
  creds: MetaCredentials,
  mediaId: string,
): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const cid = creds.chatrunConnectionId;
  if (cid) return viaChatrun(() => chatrun.downloadMedia(cid, mediaId));
  const mediaUrl = await getMediaUrl(creds, mediaId);
  if (!mediaUrl) throw new MetaApiError(404, "mídia não encontrada na Meta");

  // A CDN da Meta pode devolver conteúdo vazio sem um User-Agent.
  const res = await fetch(mediaUrl, {
    headers: {
      Authorization: `Bearer ${creds.token}`,
      "User-Agent": "SocilaWhatsApp/1.0 (Media Fetcher)",
    },
  });
  if (!res.ok) throw new MetaApiError(res.status, "falha ao baixar a mídia");
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  return { bytes: await res.arrayBuffer(), contentType };
}

export async function sendTemplate(
  creds: MetaCredentials,
  to: string,
  templateName: string,
  language: string,
  bodyParams: string[],
): Promise<SendResult> {
  const cid = creds.chatrunConnectionId;
  if (cid) {
    const wamid = await viaChatrun(() =>
      chatrun.sendMessage({
        connectionId: cid,
        to,
        type: "template",
        template: { name: templateName, language, body_params: bodyParams },
      }),
    );
    return { external_id: wamid };
  }
  const components =
    bodyParams.length > 0
      ? [
          {
            type: "body",
            parameters: bodyParams.map((p) => ({ type: "text", text: p })),
          },
        ]
      : [];
  const body = await graphFetch(creds, `/${creds.phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: to.replace(/\D/g, ""),
      type: "template",
      template: {
        name: templateName,
        language: { code: language },
        components,
      },
    }),
  });
  return { external_id: extractWamid(body) };
}

// Marca como lida + indicador "digitando..." (experiência natural da IA)
export async function markReadWithTyping(
  creds: MetaCredentials,
  messageId: string,
): Promise<void> {
  const cid = creds.chatrunConnectionId;
  if (cid) {
    await chatrun.markRead(cid, messageId).catch(() => {
      /* best-effort */
    });
    return;
  }
  await graphFetch(creds, `/${creds.phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
      typing_indicator: { type: "text" },
    }),
  }).catch(() => {
    /* best-effort */
  });
}

// ── Templates do WABA ────────────────────────────────────────
export type MetaTemplateComponent = {
  type: string;
  format?: string;
  text?: string;
  example?: { body_text?: string[][]; header_text?: string[] };
  buttons?: Array<{ type: string; text?: string; url?: string; phone_number?: string }>;
};

export type MetaTemplate = {
  id: string;
  name: string;
  status: string;
  language: string;
  category: string;
  components?: MetaTemplateComponent[];
  rejected_reason?: string;
  quality_score?: { score?: string };
};

/** Modelo do gateway no formato da Meta (o que as telas já leem). */
function fromGatewayTemplate(t: chatrun.ChatrunTemplate): MetaTemplate {
  const components: MetaTemplateComponent[] = [];
  if (t.header_format) {
    components.push({
      type: "HEADER",
      format: t.header_format,
      ...(t.header_text ? { text: t.header_text } : {}),
      ...(t.header_example ? { example: { header_text: [t.header_example] } } : {}),
    });
  }
  components.push({
    type: "BODY",
    text: t.body,
    ...(t.body_example?.length ? { example: { body_text: [t.body_example] } } : {}),
  });
  if (t.footer) components.push({ type: "FOOTER", text: t.footer });
  if (t.buttons_detail?.length) {
    components.push({
      type: "BUTTONS",
      buttons: t.buttons_detail.map((b) => ({
        type: b.type,
        text: b.text,
        url: b.url,
        phone_number: b.phone_number,
      })),
    });
  }
  return {
    id: t.id,
    name: t.name,
    status: t.status,
    language: t.language,
    category: t.category,
    components,
  };
}

export async function listTemplates(creds: MetaCredentials) {
  const cid = creds.chatrunConnectionId;
  if (cid) {
    const templates = await viaChatrun(() => chatrun.listTemplates(cid));
    return templates.map(fromGatewayTemplate);
  }
  if (!creds.wabaId) return [];
  const data = await graphFetch(
    creds,
    `/${creds.wabaId}/message_templates?fields=id,name,status,language,category,components,rejected_reason,quality_score&limit=100`,
  );
  return (data.data ?? []) as MetaTemplate[];
}

// ── Criação de template ──────────────────────────────────────
// Submete direto pela API para o cliente não precisar entrar na Business
// Manager. A aprovação continua sendo da Meta: nasce PENDING.

export type TemplateDraft = {
  name: string;
  language: string;
  category: "MARKETING" | "UTILITY";
  headerText?: string;
  body: string;
  footerText?: string;
  buttons?: Array<{ type: "QUICK_REPLY"; text: string } | { type: "URL"; text: string; url: string }>;
  /** Valor de exemplo para cada {{n}} do corpo, na ordem. */
  bodyExamples?: string[];
  headerExample?: string;
};

/** Números das variáveis {{n}} na ordem em que aparecem, sem repetição. */
export function templateVariables(text: string): number[] {
  const found = [...text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  return [...new Set(found)].sort((a, b) => a - b);
}

/**
 * Valida o rascunho ANTES de enviar. A Meta recusa por detalhes chatos (nome
 * com maiúscula, variável sem exemplo, numeração fora de ordem) e a rejeição
 * demora — é melhor barrar aqui com uma mensagem clara.
 */
export function validateTemplateDraft(draft: TemplateDraft): string[] {
  const errors: string[] = [];

  if (!/^[a-z0-9_]{1,512}$/.test(draft.name)) {
    errors.push(
      "O nome só aceita letras minúsculas, números e underscore (ex.: abertura_socio_v1).",
    );
  }
  if (!draft.body?.trim()) errors.push("O corpo da mensagem é obrigatório.");
  if (draft.body && draft.body.length > 1024) {
    errors.push("O corpo passa de 1024 caracteres.");
  }
  if (draft.headerText && draft.headerText.length > 60) {
    errors.push("O cabeçalho passa de 60 caracteres.");
  }
  if (draft.footerText && draft.footerText.length > 60) {
    errors.push("O rodapé passa de 60 caracteres.");
  }

  const vars = templateVariables(draft.body ?? "");
  // A Meta exige numeração começando em 1 e sem pular número.
  vars.forEach((n, i) => {
    if (n !== i + 1) {
      errors.push(
        `As variáveis precisam ser sequenciais a partir de {{1}} — encontrei {{${n}}} na posição ${i + 1}.`,
      );
    }
  });
  const examples = draft.bodyExamples ?? [];
  if (vars.length > 0 && examples.filter((e) => e?.trim()).length < vars.length) {
    errors.push(
      `Cada variável precisa de um exemplo: há ${vars.length} variável(is) e ${examples.filter((e) => e?.trim()).length} exemplo(s). Sem isso a Meta recusa.`,
    );
  }

  const headerVars = templateVariables(draft.headerText ?? "");
  if (headerVars.length > 1) errors.push("O cabeçalho aceita no máximo uma variável.");
  if (headerVars.length === 1 && !draft.headerExample?.trim()) {
    errors.push("A variável do cabeçalho precisa de um exemplo.");
  }

  if ((draft.buttons?.length ?? 0) > 3) errors.push("Máximo de 3 botões.");
  for (const button of draft.buttons ?? []) {
    if (!button.text?.trim()) errors.push("Botão sem texto.");
    if (button.text && button.text.length > 25) errors.push(`Botão "${button.text}" passa de 25 caracteres.`);
    if (button.type === "URL" && !/^https?:\/\//.test(button.url ?? "")) {
      errors.push("Botão de link precisa de uma URL começando com http(s)://.");
    }
  }

  return errors;
}

function draftToComponents(draft: TemplateDraft): MetaTemplateComponent[] {
  const components: MetaTemplateComponent[] = [];

  if (draft.headerText?.trim()) {
    const headerVars = templateVariables(draft.headerText);
    components.push({
      type: "HEADER",
      format: "TEXT",
      text: draft.headerText,
      ...(headerVars.length === 1 && draft.headerExample
        ? { example: { header_text: [draft.headerExample] } }
        : {}),
    });
  }

  const vars = templateVariables(draft.body);
  components.push({
    type: "BODY",
    text: draft.body,
    // O formato é uma matriz: uma linha de exemplos por conjunto de variáveis.
    ...(vars.length > 0
      ? { example: { body_text: [vars.map((_, i) => draft.bodyExamples?.[i] ?? "exemplo")] } }
      : {}),
  });

  if (draft.footerText?.trim()) {
    components.push({ type: "FOOTER", text: draft.footerText });
  }
  if (draft.buttons?.length) {
    components.push({
      type: "BUTTONS",
      buttons: draft.buttons.map((b) =>
        b.type === "URL"
          ? { type: "URL", text: b.text, url: b.url }
          : { type: "QUICK_REPLY", text: b.text },
      ),
    });
  }

  return components;
}

/** Rascunho no formato da API de modelos do gateway. */
function toGatewayDraft(draft: TemplateDraft): chatrun.ChatrunTemplateDraft {
  const vars = templateVariables(draft.body);
  const headerVars = templateVariables(draft.headerText ?? "");
  return {
    name: draft.name,
    category: draft.category,
    language: draft.language,
    body_text: draft.body,
    ...(vars.length ? { example_values: vars.map((_, i) => draft.bodyExamples?.[i] ?? "exemplo") } : {}),
    ...(draft.footerText?.trim() ? { footer_text: draft.footerText } : {}),
    ...(draft.headerText?.trim()
      ? {
          header: {
            format: "TEXT" as const,
            text: draft.headerText,
            ...(headerVars.length === 1 && draft.headerExample ? { example: draft.headerExample } : {}),
          },
        }
      : {}),
    ...(draft.buttons?.length
      ? {
          buttons: draft.buttons.map((b) =>
            b.type === "URL"
              ? {
                  type: "URL" as const,
                  text: b.text,
                  url: b.url,
                  // Link dinâmico ({{1}} no fim) precisa de um exemplo completo.
                  ...(b.url.includes("{{1}}") ? { example: b.url.replace("{{1}}", "exemplo") } : {}),
                }
              : { type: "QUICK_REPLY" as const, text: b.text },
          ),
        }
      : {}),
  };
}

export async function createTemplate(
  creds: MetaCredentials,
  draft: TemplateDraft,
): Promise<{ id: string; status: string; category: string }> {
  const cid = creds.chatrunConnectionId;
  if (cid) {
    const r = await viaChatrun(() => chatrun.createTemplate(cid, toGatewayDraft(draft)));
    return {
      id: String(r.id ?? ""),
      status: String(r.status ?? "PENDING"),
      category: String(r.category ?? draft.category),
    };
  }
  if (!creds.wabaId) throw new MetaApiError(400, "WABA ID não configurado");

  const body = await graphFetch(creds, `/${creds.wabaId}/message_templates`, {
    method: "POST",
    body: JSON.stringify({
      name: draft.name,
      language: draft.language,
      category: draft.category,
      components: draftToComponents(draft),
    }),
  });

  return {
    id: String(body.id ?? ""),
    status: String(body.status ?? "PENDING"),
    category: String(body.category ?? draft.category),
  };
}

export async function deleteTemplate(creds: MetaCredentials, name: string): Promise<void> {
  const cid = creds.chatrunConnectionId;
  if (cid) {
    await viaChatrun(() => chatrun.deleteTemplate(cid, name));
    return;
  }
  if (!creds.wabaId) throw new MetaApiError(400, "WABA ID não configurado");
  await graphFetch(
    creds,
    `/${creds.wabaId}/message_templates?name=${encodeURIComponent(name)}`,
    { method: "DELETE" },
  );
}

// ── Webhook: validação de assinatura HMAC-SHA256 ─────────────
export function verifyWebhookSignature(
  appSecret: string,
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex");
  const received = signatureHeader.slice("sha256=".length);
  if (expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

// ── Tipos do payload do webhook ──────────────────────────────
export type MetaWebhookMessage = {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type?: string; caption?: string };
  audio?: { id: string; mime_type?: string };
  document?: { id: string; mime_type?: string; filename?: string; caption?: string };
  video?: { id: string; mime_type?: string; caption?: string };
  sticker?: { id: string; mime_type?: string };
  reaction?: { message_id: string; emoji?: string };
  // Clique em botão de Quick Reply de um template (ex.: campanha).
  button?: { text: string; payload?: string };
  // Clique em botão/lista de uma mensagem interativa.
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
  // Presente quando a mensagem é uma resposta (reply) a outra: id = wamid citado.
  context?: { id?: string; from?: string };
};

export type MetaWebhookStatus = {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  recipient_id: string;
  errors?: Array<{ code: number; title: string }>;
};

export type MetaWebhookValue = {
  metadata?: { phone_number_id: string; display_phone_number: string };
  /** Coexistência: o que a loja mandou pelo app do celular (campo smb_message_echoes). */
  message_echoes?: Array<{
    from: string;
    to: string;
    id: string;
    type: string;
    text?: { body: string };
  }>;
  contacts?: Array<{ profile: { name: string }; wa_id: string }>;
  messages?: MetaWebhookMessage[];
  statuses?: MetaWebhookStatus[];
};
