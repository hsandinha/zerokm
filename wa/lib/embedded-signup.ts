// Embedded Signup (Cadastro Incorporado da Meta) — como a loja conecta o
// próprio número de WhatsApp, portado do Chatrun (src/lib/server/meta-es.ts).
// No modelo Tech Provider a loja autoriza o app da plataforma num popup da
// Meta; aqui ficam a troca do code pelo token da loja, a inscrição do webhook
// na WABA dela e o registro do número.
//
// Diferença para o Chatrun: lá a conexão vinha por um convite assinado (a
// página abria em outro domínio). Aqui é a própria sessão do gestor na
// zerokm que diz de qual loja é o número.

const GRAPH_VERSION = "v26.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export class EmbeddedSignupError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function appCreds() {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    throw new EmbeddedSignupError(500, "META_APP_ID/META_APP_SECRET ausentes no env");
  }
  return { appId, appSecret };
}

async function graphJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = body?.error as { message?: string } | undefined;
    throw new EmbeddedSignupError(res.status, err?.message ?? `Meta API ${res.status}`);
  }
  return body;
}

/** code do popup → token de integração da loja (assina todos os envios dela). */
export async function exchangeCodeForToken(code: string): Promise<string> {
  const { appId, appSecret } = appCreds();
  const params = new URLSearchParams({ client_id: appId, client_secret: appSecret, code });
  const body = await graphJson(`${GRAPH}/oauth/access_token?${params}`);
  const token = body.access_token as string | undefined;
  if (!token) throw new EmbeddedSignupError(500, "Meta não devolveu access_token");
  return token;
}

/**
 * Em quais WABAs o token foi autorizado. O caminho normal é o postMessage do
 * popup (waba_id e phone_number_id), mas extensão ou bloqueador de rastreador
 * cortam essa mensagem sem erro nenhum — o token sabe a mesma coisa por um
 * caminho que nenhum navegador atravessa.
 */
export async function discoverWabaIds(businessToken: string): Promise<string[]> {
  const { appId, appSecret } = appCreds();
  const params = new URLSearchParams({
    input_token: businessToken,
    access_token: `${appId}|${appSecret}`,
  });
  const body = await graphJson(`${GRAPH}/debug_token?${params}`);
  const data = body.data as
    | { granular_scopes?: Array<{ scope?: string; target_ids?: string[] }> }
    | undefined;
  const ids = (data?.granular_scopes ?? [])
    .filter(
      (s) => s.scope === "whatsapp_business_management" || s.scope === "whatsapp_business_messaging",
    )
    .flatMap((s) => s.target_ids ?? []);
  return [...new Set(ids)];
}

/** Números da WABA (quando o popup não disse qual foi escolhido). */
export async function listPhoneNumbers(
  wabaId: string,
  businessToken: string,
): Promise<Array<{ id: string; display: string | null }>> {
  const body = await graphJson(`${GRAPH}/${wabaId}/phone_numbers?fields=id,display_phone_number`, {
    headers: { Authorization: `Bearer ${businessToken}` },
  });
  const data = Array.isArray(body.data) ? (body.data as Array<Record<string, unknown>>) : [];
  return data.map((d) => ({
    id: String(d.id ?? ""),
    display: typeof d.display_phone_number === "string" ? d.display_phone_number : null,
  }));
}

/** Inscreve o app na WABA: sem isto, nenhuma mensagem da loja chega. */
export async function subscribeAppToWaba(wabaId: string, businessToken: string): Promise<void> {
  await graphJson(`${GRAPH}/${wabaId}/subscribed_apps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${businessToken}` },
  });
}

/**
 * Registra o número na Cloud API. Falha aqui não derruba a conexão (número
 * recém-verificado às vezes demora minutos): o canal fica em "error" e o
 * "Conectar" de novo resolve.
 */
export async function registerPhone(
  phoneNumberId: string,
  businessToken: string,
): Promise<{ ok: boolean; error?: string }> {
  const pin = process.env.META_REGISTER_PIN || "000000";
  try {
    await graphJson(`${GRAPH}/${phoneNumberId}/register`, {
      method: "POST",
      headers: { Authorization: `Bearer ${businessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", pin }),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Para de receber os eventos daquela WABA (best-effort, na desconexão). */
export async function unsubscribeAppFromWaba(wabaId: string, businessToken: string): Promise<void> {
  await graphJson(`${GRAPH}/${wabaId}/subscribed_apps`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${businessToken}` },
  }).catch(() => {});
}

export function embeddedSignupConfig(): { appId: string; configId: string } | null {
  const appId = process.env.META_APP_ID;
  const configId = process.env.META_ES_CONFIG_ID;
  return appId && configId ? { appId, configId } : null;
}
