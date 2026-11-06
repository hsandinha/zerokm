// Instagram API with Instagram Login — Direct (mensagens), OAuth e perfil.
// Portado do Chatrun (src/lib/server/instagram.ts), só com o que o
// atendimento usa. Fetch puro, como meta.ts; credenciais POR CANAL.
//
// Regra da Meta que vale lembrar em todo envio: só se pode escrever para quem
// já mandou mensagem, dentro de 24h — ou até 7 dias com a tag HUMAN_AGENT,
// que é só para gente (a equipe), nunca para a IA.

import { MetaApiError, viaChatrun } from "@wa/lib/meta";
import * as chatrun from "@wa/lib/chatrun";

const IG_GRAPH_VERSION = "v21.0";
const IG_GRAPH = `https://graph.instagram.com/${IG_GRAPH_VERSION}`;

export type IgCreds = {
  userId: string;
  token: string;
  /** Conta conectada pelo Chatrun: o Direct sai pela API do gateway. */
  chatrunConnectionId?: string | null;
};

export const IG_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
];

/** App do Instagram (produto "Instagram" do app da Meta). Cai no app da Meta
 *  quando for o mesmo app. */
export function igAppCreds(): { appId: string; appSecret: string } {
  const appId = process.env.INSTAGRAM_APP_ID ?? process.env.META_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET ?? process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    throw new MetaApiError(500, "INSTAGRAM_APP_ID/INSTAGRAM_APP_SECRET ausentes no env");
  }
  return { appId, appSecret };
}

async function igFetch(
  token: string,
  url: string,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = body?.error as { message?: string; code?: number } | undefined;
    throw new MetaApiError(
      res.status,
      err?.message ?? `Instagram API ${res.status}`,
      err?.code ?? null,
    );
  }
  return body;
}

type SendResult = { external_id: string };

// ── Envio ────────────────────────────────────────────────────
export async function igSendText(
  creds: IgCreds,
  recipientId: string,
  text: string,
  opts?: { humanAgent?: boolean },
): Promise<SendResult> {
  const cid = creds.chatrunConnectionId;
  if (cid) {
    // Pelo gateway vale a janela de 24 h (fora dela, 422 outside_24h_window).
    const wamid = await viaChatrun(() =>
      chatrun.sendMessage({ connectionId: cid, to: `ig:${recipientId}`, type: "text", text }),
    );
    return { external_id: wamid };
  }
  const body = await igFetch(creds.token, `${IG_GRAPH}/${creds.userId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
      // Fora das 24h só a equipe pode falar, e só com esta tag (7 dias).
      ...(opts?.humanAgent ? { messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" } : {}),
    }),
  });
  return { external_id: String(body.message_id ?? "") };
}

/** Indicador "digitando..." — best-effort, nunca derruba o atendimento. */
export async function igTypingOn(creds: IgCreds, recipientId: string): Promise<void> {
  // O gateway não tem "digitando" no Instagram.
  if (creds.chatrunConnectionId) return;
  try {
    await igFetch(creds.token, `${IG_GRAPH}/${creds.userId}/messages`, {
      method: "POST",
      body: JSON.stringify({ recipient: { id: recipientId }, sender_action: "typing_on" }),
    });
  } catch {
    // ignora
  }
}

/** Reação: o Instagram só aceita "love" pela API. */
export async function igReact(
  creds: IgCreds,
  recipientId: string,
  messageId: string,
): Promise<void> {
  if (creds.chatrunConnectionId) {
    throw new MetaApiError(422, "Reação no Direct não está disponível pelo Chatrun.");
  }
  await igFetch(creds.token, `${IG_GRAPH}/${creds.userId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      recipient: { id: recipientId },
      sender_action: "react",
      payload: { message_id: messageId, reaction: "love" },
    }),
  });
}

// Campos de webhook que a conta profissional precisa inscrever no app. É o
// `subscribed_apps` da WABA, só que por conta: sem esta chamada a Meta não
// manda nada desta conta para o webhook.
//
// O endpoint por conta aceita uma lista MENOR que o painel do app, e um campo
// desconhecido derruba a chamada inteira ("must be one of {...}") — foi o que
// quebrou a primeira conexão real no Chatrun. Por isso a função se ajusta ao
// que a API disser que aceita.
export const IG_WEBHOOK_FIELDS = [
  "messages",
  "messaging_postbacks",
  "messaging_seen",
  "messaging_referral",
  "message_reactions",
  "message_echoes",
];

function allowedFieldsFromError(message: string): string[] {
  const inside = message.match(/must be one of \{([^}]*)/);
  if (!inside) return [];
  return inside[1]
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
}

export async function igSubscribeApp(creds: IgCreds): Promise<string[]> {
  const subscribe = async (fields: string[]) => {
    const params = new URLSearchParams({ subscribed_fields: fields.join(",") });
    await igFetch(creds.token, `${IG_GRAPH}/me/subscribed_apps?${params.toString()}`, {
      method: "POST",
    });
    return fields;
  };

  try {
    return await subscribe(IG_WEBHOOK_FIELDS);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const allowed = allowedFieldsFromError(message);
    const usable = IG_WEBHOOK_FIELDS.filter((f) => allowed.includes(f));
    // Sem "messages" não existe Direct; com ele já dá para atender.
    return await subscribe(usable.length ? usable : ["messages"]);
  }
}

/** Nome/usuário de quem escreveu (só depois que a pessoa mandou mensagem). */
export async function igGetProfile(
  creds: IgCreds,
  igsid: string,
): Promise<{ name: string | null; username: string | null }> {
  try {
    const data = await igFetch(creds.token, `${IG_GRAPH}/${igsid}?fields=name,username`);
    return {
      name: (data.name as string | undefined) ?? null,
      username: (data.username as string | undefined) ?? null,
    };
  } catch {
    return { name: null, username: null };
  }
}

// ── OAuth (Instagram Login) ──────────────────────────────────
export function igAuthorizeUrl(state: string, redirectUri: string): string {
  const { appId } = igAppCreds();
  const params = new URLSearchParams({
    enable_fb_login: "0",
    // Obriga a entrar com a conta PROFISSIONAL do Instagram (não a pessoal).
    force_reauth: "true",
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: IG_SCOPES.join(","),
    state,
  });
  return `https://www.instagram.com/oauth/authorize?${params.toString()}`;
}

export async function igExchangeCode(
  code: string,
  redirectUri: string,
): Promise<{ accessToken: string; userId: string }> {
  const { appId, appSecret } = igAppCreds();
  const form = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });
  const res = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    user_id?: string | number;
    error_message?: string;
    error?: { message?: string };
  };
  if (!res.ok || !data.access_token) {
    throw new MetaApiError(
      res.status,
      data.error_message ?? data.error?.message ?? "Instagram recusou o código de autorização",
    );
  }
  return { accessToken: data.access_token, userId: String(data.user_id ?? "") };
}

export async function igLongLivedToken(
  shortToken: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const { appSecret } = igAppCreds();
  const params = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: appSecret,
    access_token: shortToken,
  });
  const res = await fetch(`https://graph.instagram.com/access_token?${params}`);
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };
  if (!res.ok || !data.access_token) {
    throw new MetaApiError(res.status, data.error?.message ?? "Falha ao obter token de longa duração");
  }
  return { accessToken: data.access_token, expiresIn: data.expires_in ?? 60 * 86400 };
}

export async function igRefreshToken(
  longToken: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const params = new URLSearchParams({
    grant_type: "ig_refresh_token",
    access_token: longToken,
  });
  const res = await fetch(`https://graph.instagram.com/refresh_access_token?${params}`);
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };
  if (!res.ok || !data.access_token) {
    throw new MetaApiError(res.status, data.error?.message ?? "Falha ao renovar o token");
  }
  return { accessToken: data.access_token, expiresIn: data.expires_in ?? 60 * 86400 };
}

/** Conta profissional dona do token. `user_id` é o id usado nas mensagens. */
export async function igMe(
  token: string,
): Promise<{ userId: string; username: string | null; name: string | null }> {
  const data = await igFetch(token, `${IG_GRAPH}/me?fields=user_id,username,name`);
  return {
    userId: String(data.user_id ?? data.id ?? ""),
    username: (data.username as string | undefined) ?? null,
    name: (data.name as string | undefined) ?? null,
  };
}
