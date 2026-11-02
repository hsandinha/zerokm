// Envio de mensagem + persistência (mensagem outbound e estado da conversa).
// O canal sai da própria conversa: a mesma chamada responde no WhatsApp ou no
// Direct do Instagram, e quem chama (IA, Central, API) não precisa saber qual.

import dbConnect from "@/lib/mongodb";
import { WaConversation, WaMessage } from "@wa/models/wa";
import { channelForConversation, igRecipientOf, type ResolvedChannel } from "@wa/lib/channels";
import { sendText, markReadWithTyping, sendTemplate, sendReaction } from "@wa/lib/meta";
import { igReact, igSendText, igTypingOn } from "@wa/lib/instagram";
import { emitEvent } from "@wa/lib/webhooks";

const DAY_MS = 24 * 3600_000;

async function conversationChannel(conversationId: string): Promise<{
  channel: ResolvedChannel;
  lastInboundAt: Date | null;
}> {
  await dbConnect();
  const conv = await WaConversation.findById(conversationId).select("channelId lastInboundAt").lean();
  return {
    channel: await channelForConversation(conv ?? {}),
    lastInboundAt: conv?.lastInboundAt ?? null,
  };
}

/** O Direct não interpreta *negrito* nem _itálico_ do WhatsApp: vira texto puro. */
export function plainForInstagram(text: string): string {
  return text.replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,!?:;]|$)/g, "$1$2");
}

export async function sendAndLogText(params: {
  conversationId: string;
  to: string; // telefone canônico +55... ou "ig:<IGSID>"
  text: string;
  sender: "ai" | "human" | "system";
}): Promise<boolean> {
  const { channel, lastInboundAt } = await conversationChannel(params.conversationId);

  let external_id: string;
  if (channel.kind === "instagram") {
    if (!channel.ig) throw new Error("Instagram desconectado — reconecte a conta na Configuração");
    // Entre 24h e 7 dias só a equipe fala, com a tag de atendimento humano.
    const foraDas24h =
      !lastInboundAt || Date.now() - new Date(lastInboundAt).getTime() >= DAY_MS;
    ({ external_id } = await igSendText(
      channel.ig,
      igRecipientOf(params.to),
      plainForInstagram(params.text),
      { humanAgent: params.sender === "human" && foraDas24h },
    ));
  } else {
    if (!channel.whatsapp) throw new Error("WABA não configurado (token/phone_number_id)");
    ({ external_id } = await sendText(channel.whatsapp, params.to, params.text));
  }

  await WaMessage.create({
    conversationId: params.conversationId,
    direction: "outbound",
    sender: params.sender,
    content: params.text,
    mediaType: "text",
    externalId: external_id || undefined,
    status: "sent",
  });
  await WaConversation.updateOne(
    { _id: params.conversationId },
    {
      lastMessageAt: new Date(),
      lastMessagePreview: params.text.slice(0, 120),
    },
  );

  await emitEvent(
    "mensagem.enviada",
    {
      message: {
        text: params.text,
        type: "text",
        sender: params.sender,
        externalId: external_id || null,
      },
    },
    { conversationId: params.conversationId },
  );
  return true;
}

/** Template — único caminho permitido fora da janela de 24h da Meta. */
export async function sendAndLogTemplate(params: {
  conversationId: string;
  to: string;
  templateName: string;
  language?: string;
  bodyParams?: string[];
  /** Texto já renderizado. Sem ele fica o rótulo, e a IA perde o contexto do
   *  que foi dito — a mensagem de abertura sumiria da Central. */
  renderedText?: string;
  /** Cadência e campanha são "system"; template escolhido na Central é "human". */
  sender?: "system" | "human";
}): Promise<string> {
  const { channel } = await conversationChannel(params.conversationId);
  if (channel.kind !== "whatsapp") {
    throw new Error("Template só existe no WhatsApp — no Instagram, responda dentro da janela");
  }
  const creds = channel.whatsapp;
  if (!creds) throw new Error("WABA não configurado (token/phone_number_id)");

  const { external_id } = await sendTemplate(
    creds,
    params.to,
    params.templateName,
    params.language ?? "pt_BR",
    params.bodyParams ?? [],
  );

  await WaMessage.create({
    conversationId: params.conversationId,
    direction: "outbound",
    sender: params.sender ?? "system",
    content: params.renderedText ?? `[template ${params.templateName}]`,
    mediaType: "template",
    externalId: external_id || undefined,
    status: "sent",
  });
  await WaConversation.updateOne(
    { _id: params.conversationId },
    {
      lastMessageAt: new Date(),
      lastMessagePreview: (params.renderedText ?? params.templateName).slice(0, 120),
    },
  );

  await emitEvent(
    "mensagem.enviada",
    {
      message: {
        text: params.renderedText ?? null,
        type: "template",
        templateName: params.templateName,
        sender: params.sender ?? "system",
        externalId: external_id || null,
      },
    },
    { conversationId: params.conversationId },
  );
  return external_id;
}

/** Marca a última mensagem recebida como lida + indicador "digitando" (best-effort). */
export async function showTyping(params: {
  conversationId: string;
  to: string;
  lastInboundExternalId: string;
}) {
  const { channel } = await conversationChannel(params.conversationId);
  if (channel.kind === "instagram") {
    if (channel.ig) await igTypingOn(channel.ig, igRecipientOf(params.to));
    return;
  }
  if (channel.whatsapp) await markReadWithTyping(channel.whatsapp, params.lastInboundExternalId);
}

/** Reação a uma mensagem do cliente. O Instagram só aceita ❤️ pela API. */
export async function reactOnChannel(params: {
  conversationId: string;
  to: string;
  messageExternalId: string;
  emoji: string;
}): Promise<string> {
  const { channel } = await conversationChannel(params.conversationId);
  if (channel.kind === "instagram") {
    if (!channel.ig) throw new Error("Instagram desconectado");
    await igReact(channel.ig, igRecipientOf(params.to), params.messageExternalId);
    return "❤️";
  }
  if (!channel.whatsapp) throw new Error("WABA não configurado");
  await sendReaction(channel.whatsapp, params.to, params.messageExternalId, params.emoji);
  return params.emoji;
}

/**
 * A janela de 24h da Meta conta a partir da ÚLTIMA mensagem recebida. Fora
 * dela só passa template — texto livre é rejeitado pela API, e é por isso que
 * a cadência de follow-up precisa saber a diferença.
 */
export function isWithin24hWindow(lastInboundAt: Date | string | null | undefined): boolean {
  if (!lastInboundAt) return false;
  return Date.now() - new Date(lastInboundAt).getTime() < DAY_MS;
}
