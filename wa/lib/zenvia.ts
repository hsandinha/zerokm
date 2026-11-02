// Zenvia — envio de SMS e RCS e leitura dos webhooks. Portado do Chatrun
// (src/lib/server/zenvia.ts, 107). API v2
// (https://zenvia.github.io/zenvia-openapi-spec/v2/).
//
// No Chatrun a conta era da plataforma (ZENVIA_API_TOKEN). Aqui é da loja: o
// token, o remetente e o agente RCS vêm do canal SMS dela. O webhook também
// é por canal (/api/webhooks/sms/<canal>/<segredo>) e a assinatura é criada
// com o token da loja quando ela salva a conta.
//
// RCS: com o agente da marca a mensagem vai para /channels/rcs e a própria
// Zenvia manda SMS quando o aparelho não tem RCS. Quem diz por onde foi é o
// status (channelData.rcs.realChannel).

import { SmsError, smsDigits, type SmsEvent } from "@wa/lib/sms-types";

const BASE = () => (process.env.ZENVIA_API_URL || "https://api.zenvia.com").replace(/\/$/, "");

type ZenviaErrorBody = {
  code?: string;
  message?: string;
  details?: Array<{ code?: string; path?: string; message?: string }>;
};

async function call(token: string, path: string, init: { method: string; body?: unknown }): Promise<unknown> {
  if (!token) throw new SmsError("Conta da Zenvia sem token.", true);
  const res = await fetch(`${BASE()}/v2${path}`, {
    method: init.method,
    headers: { "X-API-TOKEN": token, "Content-Type": "application/json", Accept: "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(15_000),
  });
  const raw = await res.text();
  let json: unknown = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const e = (json ?? {}) as ZenviaErrorBody;
    const detail = e.details?.map((d) => d.message).filter(Boolean).join("; ");
    const why = res.status === 401 ? "token recusado" : e.message || `HTTP ${res.status}`;
    // 4xx (menos 429) não melhora tentando de novo: número inválido, conta
    // sem saldo, remetente errado.
    throw new SmsError(
      `Zenvia: ${why}${detail ? ` (${detail})` : ""}`,
      res.status >= 400 && res.status < 500 && res.status !== 429,
      res.status,
    );
  }
  return json;
}

/** Manda um texto por SMS ou RCS. Devolve o id da mensagem na Zenvia. */
export async function zenviaSendText(p: {
  token: string;
  channel: "sms" | "rcs";
  /** SMS: o remetente da conta; RCS: o id do agente. */
  from: string | null;
  to: string;
  text: string;
}): Promise<{ id: string }> {
  if (!p.from) {
    throw new SmsError(
      p.channel === "rcs" ? "Canal sem agente RCS." : "Conta da Zenvia sem remetente de SMS.",
      true,
    );
  }
  const content =
    p.channel === "sms"
      ? { type: "text", text: p.text, encodingStrategy: "AUTO" }
      : { type: "text", text: p.text };
  const r = (await call(p.token, `/channels/${p.channel}/messages`, {
    method: "POST",
    body: { from: p.from, to: smsDigits(p.to), contents: [content] },
  })) as { id?: string } | null;
  if (!r?.id) throw new Error("Zenvia não devolveu o id da mensagem.");
  return { id: r.id };
}

export type ZenviaSubscription = {
  id: string;
  eventType: string;
  criteria?: { channel?: string; direction?: string };
  webhook?: { url?: string };
  status?: string;
};

/** Assinaturas de webhook da conta. Também serve para conferir o token. */
export async function zenviaSubscriptions(token: string): Promise<ZenviaSubscription[]> {
  const r = await call(token, "/subscriptions", { method: "GET" });
  return Array.isArray(r) ? (r as ZenviaSubscription[]) : [];
}

/** Assina os eventos de SMS e RCS (mensagem recebida e status) no endereço
 *  do canal. Idempotente: pula o que já está assinado nesse endereço. */
export async function zenviaSubscribe(token: string, url: string): Promise<string[]> {
  const existing = await zenviaSubscriptions(token);
  const created: string[] = [];
  for (const channel of ["sms", "rcs"]) {
    for (const eventType of ["MESSAGE", "MESSAGE_STATUS"]) {
      const already = existing.some(
        (s) =>
          s.eventType === eventType &&
          s.criteria?.channel === channel &&
          s.webhook?.url === url &&
          s.status !== "INACTIVE",
      );
      if (already) continue;
      await call(token, "/subscriptions", {
        method: "POST",
        body: {
          eventType,
          version: "v2",
          criteria: eventType === "MESSAGE" ? { channel, direction: "IN" } : { channel },
          webhook: { url },
          status: "ACTIVE",
        },
      });
      created.push(`${channel}:${eventType}`);
    }
  }
  return created;
}

/** Tira as assinaturas que apontam para endereços deste canal (desconectar
 *  ou trocar o segredo). Best-effort: o endereço velho já não autentica. */
export async function zenviaUnsubscribe(token: string, urlPrefix: string): Promise<number> {
  let removed = 0;
  try {
    for (const s of await zenviaSubscriptions(token)) {
      if (!s.webhook?.url?.startsWith(urlPrefix)) continue;
      await call(token, `/subscriptions/${encodeURIComponent(s.id)}`, { method: "DELETE" }).catch(() => {});
      removed++;
    }
  } catch {
    // token já inválido: segue
  }
  return removed;
}

// ── Eventos ──────────────────────────────────────────────────────────

type Content = { type?: string; text?: string; fileUrl?: string; fileName?: string; title?: string; payload?: string };

export function parseZenviaEvent(body: unknown): SmsEvent | null {
  if (!body || typeof body !== "object") return null;
  const e = body as {
    type?: string;
    channel?: string;
    direction?: string;
    messageId?: string;
    message?: { id?: string; from?: string; to?: string; contents?: Content[]; idRef?: string };
    messageStatus?: {
      code?: string;
      description?: string;
      causes?: Array<{ reason?: string; details?: string }>;
      channelData?: { rcs?: { realChannel?: string } };
    };
  };
  const channel = (e.channel ?? "").toLowerCase();
  if (e.type === "MESSAGE") {
    if (e.direction && e.direction !== "IN") return null;
    const m = e.message;
    if (!m?.id || !m.from) return null;
    const parts = (m.contents ?? []).map((c) =>
      c.type === "text" || c.type === "replyable_text"
        ? (c.text ?? "")
        : c.type === "file"
          ? `[arquivo${c.fileName ? `: ${c.fileName}` : ""}]`
          : (c.text ?? c.title ?? c.payload ?? `[${c.type ?? "conteúdo"}]`),
    );
    return {
      type: "message",
      channel,
      id: m.id,
      from: m.from.replace(/\D/g, ""),
      to: m.to ?? "",
      text: parts.filter(Boolean).join("\n").trim(),
      refId: m.idRef ?? null,
    };
  }
  if (e.type === "MESSAGE_STATUS") {
    const id = e.message?.id ?? e.messageId;
    const st = e.messageStatus;
    if (!id || !st?.code) return null;
    const real = st.channelData?.rcs?.realChannel;
    return {
      type: "status",
      channel,
      id,
      code: st.code,
      via: real === "sms" || real === "rcs" ? real : channel === "sms" ? "sms" : null,
      reason:
        st.causes?.map((c) => c.reason || c.details).filter(Boolean).join("; ") ||
        st.description ||
        null,
    };
  }
  return null;
}
