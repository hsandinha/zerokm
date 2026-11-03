// Tipos comuns do canal SMS (Zenvia e Comtele) — portado do Chatrun
// (sms-erro.ts e os eventos de zenvia.ts, 107/115). Arquivo sem banco e sem
// fetch: os dois provedores e o webhook dependem dele, e ele de ninguém.
//
// Diferença para o Chatrun: lá a conta de SMS era UMA, da plataforma, e as
// unidades compravam créditos. Aqui cada loja paga o próprio disparo: a conta
// do provedor (chave, remetente, agente RCS) é do CANAL da loja.

export type SmsProvider = "zenvia" | "comtele";

/** Conta do provedor da loja, já decifrada (sai do canal em resolveChannel). */
export type SmsCreds = {
  provider: SmsProvider;
  /** Zenvia: X-API-TOKEN; Comtele: x-api-key. */
  token: string;
  /** Zenvia: remetente da conta SMS. */
  sender: string | null;
  /** Comtele: rota de envio (null = a padrão da conta). */
  route: number | null;
  /** Zenvia: agente RCS da marca. Com ele, sai RCS (e a Zenvia cai para SMS). */
  rcsAgentId: string | null;
};

/** Erro do provedor de SMS. `permanent` = não adianta tentar de novo (número
 *  inválido, sem saldo, chave errada). Sem `status`, o erro foi antes de
 *  chamar o provedor (configuração). */
export class SmsError extends Error {
  constructor(
    message: string,
    readonly permanent: boolean,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** Evento de webhook normalizado. A Comtele chega aqui no formato da Zenvia. */
export type SmsEvent =
  | {
      type: "message";
      channel: string;
      id: string;
      from: string;
      to: string;
      text: string;
      /** SMS: id da última mensagem que mandamos para essa pessoa. */
      refId: string | null;
    }
  | {
      type: "status";
      channel: string;
      id: string;
      /** SENT | DELIVERED | READ | NOT_DELIVERED ... (códigos da Zenvia). */
      code: string;
      /** Por onde foi de fato (o RCS cai para SMS sozinho). */
      via: "sms" | "rcs" | null;
      reason: string | null;
    };

/** Status do provedor → status da mensagem na Central. */
export function smsStatusOf(code: string): "sent" | "delivered" | "read" | "failed" | null {
  switch (code) {
    case "SENT":
      return "sent";
    case "DELIVERED":
      return "delivered";
    case "READ":
    case "CLICKED":
      return "read";
    case "NOT_DELIVERED":
    case "REJECTED":
      return "failed";
    default:
      return null;
  }
}

/** Status que já passou deste não volta atrás (o SENT pode chegar depois do
 *  DELIVERED). Chave = status novo; valor = de quais ele pode vir. */
export const SMS_STATUS_FROM: Record<"sent" | "delivered" | "read" | "failed", string[]> = {
  sent: ["queued", "sent"],
  delivered: ["queued", "sent", "delivered"],
  read: ["queued", "sent", "delivered", "read"],
  failed: ["queued", "sent", "delivered", "read", "failed"],
};

/** Telefone só com dígitos e o 55 (formato dos dois provedores). */
export function smsDigits(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return d.length <= 11 ? `55${d}` : d;
}

// ── Formulário da conta (POST /api/wa/sms) ───────────────────────────

export type SmsAccountInput = {
  provider: SmsProvider;
  /** null = mantém o token guardado. */
  token: string | null;
  sender: string | null;
  route: number | null;
  rcsAgentId: string | null;
};

const SENDER_RE = /^[\w.@:+-]{1,60}$/;
const RCS_AGENT_RE = /^[\w.@:-]{3,120}$/;

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Confere o formulário da conta de SMS antes de ir ao provedor. Token em
 *  branco só vale quando já há um guardado do MESMO provedor. */
export function validateSmsAccount(
  body: Record<string, unknown>,
  stored: { hasStoredToken: boolean; storedProvider: SmsProvider | null },
): { ok: true; account: SmsAccountInput } | { ok: false; error: string } {
  const provider = body.provider;
  if (provider !== "zenvia" && provider !== "comtele") {
    return { ok: false, error: "Escolha o provedor: Zenvia ou Comtele." };
  }

  const token = text(body.token) || null;
  if (token && (token.length < 8 || token.length > 300 || /\s/.test(token))) {
    return { ok: false, error: "Esse não parece um token de API." };
  }
  if (!token && (!stored.hasStoredToken || stored.storedProvider !== provider)) {
    return {
      ok: false,
      error: provider === "zenvia" ? "Cole o token da API da Zenvia." : "Cole a chave de API da Comtele.",
    };
  }

  const rcsAgentId = text(body.rcsAgentId) || null;
  if (rcsAgentId && provider !== "zenvia") {
    return { ok: false, error: "RCS só pela Zenvia: a Comtele, por ora, só manda SMS." };
  }
  if (rcsAgentId && !RCS_AGENT_RE.test(rcsAgentId)) {
    return { ok: false, error: "Id do agente RCS inválido." };
  }

  let sender: string | null = null;
  let route: number | null = null;
  if (provider === "zenvia") {
    sender = text(body.sender) || null;
    if (sender && !SENDER_RE.test(sender)) {
      return { ok: false, error: "Remetente inválido (o nome da conta SMS na Zenvia, sem espaços)." };
    }
    if (!sender && !rcsAgentId) {
      return { ok: false, error: "Informe o remetente do SMS (o nome da conta SMS na Zenvia)." };
    }
  } else {
    const raw = body.route;
    const value = typeof raw === "number" ? raw : text(raw) ? Number(text(raw)) : null;
    if (value !== null && (!Number.isInteger(value) || value <= 0)) {
      return { ok: false, error: "Rota inválida (número da rota na Comtele)." };
    }
    route = value;
  }

  return { ok: true, account: { provider, token, sender, route, rcsAgentId } };
}
