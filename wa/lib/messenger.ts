// Messenger da Página do Facebook — login do Facebook, escolha da Página e
// mensagens. Portado do Chatrun (src/lib/server/messenger.ts, 088), só com o
// que o atendimento usa (sem carrossel e sem iscas de comentário). Fetch
// puro, no molde do instagram.ts; credenciais POR CANAL.
//
// O token guardado no canal é DA PÁGINA, tirado de um token de usuário de
// longa duração, e por isso não vence: só cai se a pessoa trocar a senha,
// tirar o app ou perder o acesso à Página. Não há worker de renovação.
//
// Mesma regra de envio do Instagram: só se escreve para quem mandou
// mensagem, dentro de 24h — ou até 7 dias com a tag HUMAN_AGENT, que é só
// para gente (a equipe), nunca para a IA.

import { MetaApiError, viaChatrun } from "@wa/lib/meta";
import * as chatrun from "@wa/lib/chatrun";

const FB_GRAPH_VERSION = "v21.0";
const FB_GRAPH = `https://graph.facebook.com/${FB_GRAPH_VERSION}`;

export type FbCreds = {
  pageId: string;
  token: string;
  /** Página conectada pelo Chatrun: o Messenger sai pela API do gateway. */
  chatrunConnectionId?: string | null;
};

/** O que o login pede. Com o "Login do Facebook para Empresas" quem manda é
 *  a configuração (MESSENGER_LOGIN_CONFIG_ID); esta lista vale para o login
 *  clássico e documenta o que a configuração precisa ter. */
export const FB_SCOPES = [
  "pages_show_list",
  "pages_messaging",
  "pages_manage_metadata",
  "pages_read_engagement",
  "business_management",
];

export function fbAppCreds(): { appId: string; appSecret: string } {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    throw new MetaApiError(500, "META_APP_ID/META_APP_SECRET ausentes no env");
  }
  return { appId, appSecret };
}

/** O deploy tem o que o login do Facebook precisa? (o painel avisa se não) */
export function messengerReady(): boolean {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

async function fbFetch(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${FB_GRAPH}${path}`, {
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
      err?.message ?? `Messenger API ${res.status}`,
      err?.code ?? null,
    );
  }
  return body;
}

type SendResult = { external_id: string };

/** RESPONSE = dentro das 24h. Fora delas, só a equipe e com a tag (7 dias). */
export function messagingTypeOf(humanAgent?: boolean) {
  return humanAgent
    ? { messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" }
    : { messaging_type: "RESPONSE" };
}

// ── Envio ────────────────────────────────────────────────────
export async function fbSendText(
  creds: FbCreds,
  psid: string,
  text: string,
  opts?: { humanAgent?: boolean },
): Promise<SendResult> {
  const cid = creds.chatrunConnectionId;
  if (cid) {
    const wamid = await viaChatrun(() =>
      chatrun.sendMessage({
        connectionId: cid,
        to: `fb:${psid}`,
        type: "text",
        text,
        humanAgent: opts?.humanAgent,
      }),
    );
    return { external_id: wamid };
  }
  const body = await fbFetch(creds.token, `/${creds.pageId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      recipient: { id: psid },
      message: { text },
      ...messagingTypeOf(opts?.humanAgent),
    }),
  });
  return { external_id: String(body.message_id ?? "") };
}

/** "Digitando..." — best-effort, nunca derruba o atendimento. Pelo Chatrun,
 *  marca como vista a conversa da última mensagem recebida e mostra
 *  "digitando" (o gateway precisa do id dessa mensagem). */
export async function fbTypingOn(creds: FbCreds, psid: string, lastInboundMid?: string | null): Promise<void> {
  if (creds.chatrunConnectionId) {
    if (lastInboundMid) await chatrun.markRead(creds.chatrunConnectionId, lastInboundMid).catch(() => {});
    return;
  }
  try {
    await fbFetch(creds.token, `/${creds.pageId}/messages`, {
      method: "POST",
      body: JSON.stringify({ recipient: { id: psid }, sender_action: "typing_on" }),
    });
  } catch {
    // ignora
  }
}

/** Os dois vistos para a pessoa: alguém (ou a IA) recebeu. Best-effort. */
export async function fbMarkSeen(creds: FbCreds, psid: string): Promise<void> {
  try {
    await fbFetch(creds.token, `/${creds.pageId}/messages`, {
      method: "POST",
      body: JSON.stringify({ recipient: { id: psid }, sender_action: "mark_seen" }),
    });
  } catch {
    // ignora
  }
}

/** Reação: a API do Messenger, como a do Instagram, só garante "love". */
export async function fbReact(creds: FbCreds, psid: string, messageId: string): Promise<void> {
  if (creds.chatrunConnectionId) {
    throw new MetaApiError(422, "Reação no Messenger não está disponível pelo Chatrun.");
  }
  await fbFetch(creds.token, `/${creds.pageId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      recipient: { id: psid },
      sender_action: "react",
      payload: { message_id: messageId, reaction: "love" },
    }),
  });
}

/** Nome de quem escreveu (só depois que a pessoa mandou mensagem). */
export async function fbGetProfile(creds: FbCreds, psid: string): Promise<{ name: string | null }> {
  try {
    const data = await fbFetch(creds.token, `/${psid}?fields=first_name,last_name,name`);
    const name =
      (data.name as string | undefined) ??
      [data.first_name, data.last_name].filter(Boolean).join(" ").trim();
    return { name: name || null };
  } catch {
    return { name: null };
  }
}

// ── Webhook da Página ─────────────────────────────────────────
// Sem esta inscrição a Meta não manda nada da Página para o webhook (é o
// subscribed_apps da WABA, só que por Página).
export const FB_WEBHOOK_FIELDS = [
  "messages",
  "messaging_postbacks",
  "message_echoes",
  "message_deliveries",
  "message_reads",
  "message_reactions",
];

/** Campos que a Meta diz aceitar na mensagem de erro ("must be one of {...}"). */
export function acceptedFieldsFromError(message: string): string[] {
  const inside = message.match(/must be one of \{([^}]*)/);
  if (!inside) return [];
  return inside[1]
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
}

export async function fbSubscribePage(creds: FbCreds): Promise<string[]> {
  const subscribe = async (fields: string[]) => {
    const params = new URLSearchParams({ subscribed_fields: fields.join(",") });
    await fbFetch(creds.token, `/${creds.pageId}/subscribed_apps?${params.toString()}`, {
      method: "POST",
    });
    return fields;
  };
  try {
    return await subscribe(FB_WEBHOOK_FIELDS);
  } catch (err) {
    // Mesmo cuidado do Instagram: se a Meta recusar algum campo, fica com os
    // que ela aceita. Sem "messages" não há canal, e aí o erro sobe.
    const accepted = acceptedFieldsFromError(err instanceof Error ? err.message : String(err));
    const usable = FB_WEBHOOK_FIELDS.filter((f) => accepted.includes(f));
    return await subscribe(usable.length ? usable : ["messages", "messaging_postbacks", "message_echoes"]);
  }
}

export async function fbUnsubscribePage(creds: FbCreds): Promise<void> {
  try {
    await fbFetch(creds.token, `/${creds.pageId}/subscribed_apps`, { method: "DELETE" });
  } catch {
    // a Página pode já ter tirado o app
  }
}

// ── Login do Facebook ────────────────────────────────────────
export function fbAuthorizeUrl(state: string, redirectUri: string): string {
  const { appId } = fbAppCreds();
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
  });
  // Login do Facebook para Empresas: a configuração define as permissões.
  const configId = process.env.MESSENGER_LOGIN_CONFIG_ID;
  if (configId) params.set("config_id", configId);
  else params.set("scope", FB_SCOPES.join(","));
  return `https://www.facebook.com/${FB_GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

async function facebookToken(params: Record<string, string>): Promise<string> {
  const res = await fetch(`${FB_GRAPH}/oauth/access_token?${new URLSearchParams(params)}`);
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    error?: { message?: string };
  };
  if (!res.ok || !data.access_token) {
    throw new MetaApiError(res.status, data.error?.message ?? "O Facebook recusou a autorização");
  }
  return data.access_token;
}

/** Código do login → token de usuário de longa duração (60 dias). É dele que
 *  sai o token da Página, e o token da Página tirado assim não vence. */
export async function fbExchangeCode(code: string, redirectUri: string): Promise<{ userToken: string }> {
  const { appId, appSecret } = fbAppCreds();
  const short = await facebookToken({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  });
  const long = await facebookToken({
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: short,
  });
  return { userToken: long };
}

export async function fbMe(userToken: string): Promise<{ id: string; name: string | null }> {
  const data = await fbFetch(userToken, "/me?fields=id,name");
  return { id: String(data.id ?? ""), name: (data.name as string | undefined) ?? null };
}

export type FacebookPage = {
  id: string;
  name: string;
  token: string;
  pictureUrl: string | null;
  /** Pode mandar mensagem pela Página (tarefa MESSAGING ou MANAGE). */
  canMessage: boolean;
};

/** Uma Página do /me/accounts. Sem lista de tarefas (login de empresa) vale
 *  como podendo atender: quem decide é a configuração do login. */
export function pageFromGraph(p: Record<string, unknown>): FacebookPage {
  const tasks = (p.tasks as string[] | undefined) ?? [];
  const picture = p.picture as { data?: { url?: string } } | undefined;
  return {
    id: String(p.id),
    name: String(p.name ?? "Página"),
    token: String(p.access_token ?? ""),
    pictureUrl: picture?.data?.url ?? null,
    canMessage: !tasks.length || tasks.includes("MESSAGING") || tasks.includes("MANAGE"),
  };
}

/** Páginas que a pessoa autorizou no login, com o token de cada uma. */
export async function fbMyPages(userToken: string): Promise<FacebookPage[]> {
  const pages: FacebookPage[] = [];
  let path: string | null = "/me/accounts?fields=id,name,access_token,tasks,picture{url}&limit=100";
  for (let round = 0; path && round < 5; round++) {
    const data = await fbFetch(userToken, path);
    for (const p of (data.data as Array<Record<string, unknown>> | undefined) ?? []) {
      pages.push(pageFromGraph(p));
    }
    const next = (data.paging as { next?: string } | undefined)?.next;
    path = next ? next.replace(/^https:\/\/graph\.facebook\.com\/v[\d.]+/, "") : null;
  }
  return pages.filter((p) => p.token);
}
