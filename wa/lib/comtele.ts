// Comtele — SMS pré-pago, sem mensalidade. Portado do Chatrun
// (src/lib/server/comtele.ts, 115). No Chatrun a conta era da plataforma,
// que revendia créditos; aqui cada loja usa a própria chave e paga a Comtele
// direto (sem créditos, sem Asaas).
//
// API Gateway V4 (https://developers.comtele.com.br):
//   POST /messages/sms/send   envio (header x-api-key)
//   GET  /balance             saldo da conta (serve para conferir a chave)
// Webhooks (cadastrados à mão no painel da Comtele, um endereço para os dois):
//   status de entrega (webhookType "Status") e resposta ("Replies").
//
// Correlação: a resposta do envio não traz o id da mensagem. Mandamos o
// nosso id no campo `custom`, que a Comtele devolve em todo status e em toda
// resposta (messageCustom). Ele vira o externalId da mensagem na Central.
//
// O webhook não tem assinatura: quem protege é o segredo no caminho do
// endereço (/api/webhooks/sms/<canal>/<segredo>).

import { SmsError, smsDigits, type SmsEvent } from "@wa/lib/sms-types";

const BASE = () => (process.env.COMTELE_API_URL || "https://api.comtele.com.br").replace(/\/$/, "");

/** Telefone no formato da Comtele: só dígitos, com o 55, como número. */
export function comtelePhone(phone: string): number {
  return Number(smsDigits(phone));
}

type Result<T> = { hasError?: boolean; message?: string | null; errors?: string[] | null; object?: T };

async function call<T>(key: string, path: string, init: { method: string; body?: unknown }): Promise<Result<T>> {
  if (!key) throw new SmsError("Conta da Comtele sem chave de API.", true);
  const res = await fetch(`${BASE()}${path}`, {
    method: init.method,
    headers: { "x-api-key": key, "Content-Type": "application/json", Accept: "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(15_000),
  });
  const raw = await res.text();
  let json: Result<T> | null = null;
  try {
    json = raw ? (JSON.parse(raw) as Result<T>) : null;
  } catch {
    json = null;
  }
  const why = [json?.message, ...(json?.errors ?? [])].filter(Boolean).join("; ");
  if (!res.ok) {
    // 4xx (menos 429) não melhora tentando de novo: chave errada, número
    // inválido, rota que não existe.
    const permanent = res.status >= 400 && res.status < 500 && res.status !== 429;
    const text401 = res.status === 401 ? "chave de API recusada" : "";
    throw new SmsError(`Comtele: ${why || text401 || `HTTP ${res.status}`}`, permanent, res.status);
  }
  // 200 com hasError: a Comtele recusou o pedido (saldo, número, rota). Não saiu.
  if (json?.hasError) throw new SmsError(`Comtele: ${why || "envio recusado"}`, true, res.status);
  return json ?? {};
}

/** Manda um SMS. Sem retorno: a correlação é o `ref` (ver o cabeçalho). */
export async function comteleSendSms(p: {
  key: string;
  route: number | null;
  to: string;
  text: string;
  /** Nosso id da mensagem: volta em todo status e resposta. */
  ref: string;
  /** Rótulo nos relatórios da Comtele. */
  tag?: string | null;
}): Promise<void> {
  const number = comtelePhone(p.to);
  if (!Number.isSafeInteger(number) || String(number).length < 12) {
    throw new SmsError("Número de celular inválido para SMS.", true);
  }
  await call(p.key, "/messages/sms/send", {
    method: "POST",
    body: {
      receivers: [number],
      message: p.text,
      ...(p.route ? { route: p.route } : {}),
      ...(p.tag ? { tag: p.tag.slice(0, 60) } : {}),
      custom: p.ref,
    },
  });
}

/** Saldo da conta na Comtele (em reais). Também confere a chave. */
export async function comteleBalance(key: string): Promise<number | null> {
  const r = await call<{ balance?: number }>(key, "/balance", { method: "GET" });
  const v = Number(r.object?.balance);
  return Number.isFinite(v) ? v : null;
}

// ── Eventos ──────────────────────────────────────────────────────────

/** Status que significam "não chegou". LowBalance é a conta da LOJA sem
 *  saldo na Comtele. */
const FAILURES = new Set([
  "Expired",
  "Failed",
  "Invalid",
  "InvalidNumber",
  "Rejected",
  "Undeliverable",
  "LowBalance",
  "Blocked",
  "Canceled",
  "LimitExceeded",
]);

/** Status da Comtele no código que o processamento já entende (o mesmo da
 *  Zenvia: SENT, DELIVERED, READ, NOT_DELIVERED). */
function codeOf(status: string): string | null {
  if (status === "Sent" || status === "Sending") return "SENT";
  if (status === "Delivered") return "DELIVERED";
  if (status === "Read") return "READ";
  if (FAILURES.has(status)) return "NOT_DELIVERED";
  return null; // Analysis, Created, Processing, Queued: ainda não saiu
}

export type ComteleEvent = { event: SmsEvent | null; lowBalance: boolean };

export function parseComteleEvent(body: unknown): ComteleEvent {
  const nothing = { event: null, lowBalance: false };
  if (!body || typeof body !== "object") return nothing;
  const e = body as {
    webhookType?: string;
    messageId?: string;
    messageStatus?: string;
    messageStatusDetails?: string | null;
    messageCustom?: string | null;
    messageType?: string;
    replySender?: string | null;
    replyContent?: string | null;
    replyTimestamp?: string;
  };
  const via = e.messageType ? (e.messageType === "Sms" ? "sms" : "rcs") : null;

  if (e.webhookType === "Replies") {
    const from = (e.replySender ?? "").replace(/\D/g, "");
    if (!from) return nothing;
    return {
      event: {
        type: "message",
        channel: via ?? "sms",
        // A Comtele não dá id à resposta: original + horário identifica e
        // segura a repetição do mesmo callback.
        id: `cm-r-${e.messageId ?? from}-${e.replyTimestamp ?? ""}`.slice(0, 200),
        from,
        to: "",
        text: (e.replyContent ?? "").trim(),
        refId: e.messageCustom || null,
      },
      lowBalance: false,
    };
  }

  if (e.webhookType === "Status") {
    const ref = e.messageCustom;
    const status = e.messageStatus ?? "";
    const code = codeOf(status);
    // Sem o nosso id não há o que atualizar (mensagem mandada fora daqui).
    if (!ref || !code) return { event: null, lowBalance: status === "LowBalance" };
    return {
      event: {
        type: "status",
        channel: via ?? "sms",
        id: ref,
        code,
        via,
        reason: code === "NOT_DELIVERED" ? e.messageStatusDetails || status : null,
      },
      lowBalance: status === "LowBalance",
    };
  }
  return nothing;
}
