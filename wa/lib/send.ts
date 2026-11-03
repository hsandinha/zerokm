// Envio de mensagem + persistência (mensagem outbound e estado da conversa).
// O canal sai da própria conversa: a mesma chamada responde no WhatsApp, no
// Direct do Instagram, no Messenger ou por SMS/RCS, e quem chama (IA,
// Central, API) não precisa saber qual.

import dbConnect from "@/lib/mongodb";
import { WaConversation, WaMessage } from "@wa/models/wa";
import {
  channelForConversation,
  fbRecipientOf,
  igRecipientOf,
  whatsappChannelOf,
  type ResolvedChannel,
} from "@wa/lib/channels";
import { sendText, markReadWithTyping, sendTemplate, sendReaction } from "@wa/lib/meta";
import { igReact, igSendText, igTypingOn } from "@wa/lib/instagram";
import { fbReact, fbSendText, fbTypingOn } from "@wa/lib/messenger";
import { sendSms } from "@wa/lib/sms";
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

/** O Direct (e o Messenger, e o SMS) não interpreta *negrito* nem _itálico_
 *  do WhatsApp: vira texto puro. */
export function plainForInstagram(text: string): string {
  return text.replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,!?:;]|$)/g, "$1$2");
}

export async function sendAndLogText(params: {
  conversationId: string;
  to: string; // telefone canônico +55..., "ig:<IGSID>" ou "fb:<PSID>"
  text: string;
  sender: "ai" | "human" | "system";
}): Promise<boolean> {
  const { channel, lastInboundAt } = await conversationChannel(params.conversationId);

  let external_id: string;
  let via: "sms" | "rcs" | undefined;
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
  } else if (channel.kind === "messenger") {
    if (!channel.fb) throw new Error("Messenger desconectado — reconecte a Página na Configuração");
    // Mesma regra do Direct: entre 24h e 7 dias, só a equipe, com HUMAN_AGENT.
    const foraDas24h =
      !lastInboundAt || Date.now() - new Date(lastInboundAt).getTime() >= DAY_MS;
    ({ external_id } = await fbSendText(
      channel.fb,
      fbRecipientOf(params.to),
      plainForInstagram(params.text),
      { humanAgent: params.sender === "human" && foraDas24h },
    ));
  } else if (channel.kind === "sms") {
    // SMS não tem janela: a loja paga cada envio e fala quando quiser.
    if (!channel.sms) throw new Error("SMS desconectado — confira a conta do provedor na Configuração");
    ({ external_id, via } = await sendSms(channel.sms, params.to, plainForInstagram(params.text), {
      tag: channel.tenantId,
    }));
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
    ...(via ? { via } : {}),
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
  let { channel } = await conversationChannel(params.conversationId);
  // Conversa que está no SMS é de telefone: o template sai pelo WhatsApp da
  // mesma loja, e a conversa volta para ele (segue o canal do último toque,
  // como no inbound).
  if (channel.kind === "sms") {
    const whatsapp = await whatsappChannelOf(channel.tenantId);
    if (!whatsapp?.whatsapp) {
      throw new Error("Template só existe no WhatsApp — no SMS, mande o texto direto");
    }
    await WaConversation.updateOne(
      { _id: params.conversationId },
      whatsapp.id ? { channelId: whatsapp.id } : { $unset: { channelId: 1 } },
    );
    channel = whatsapp;
  }
  if (channel.kind !== "whatsapp") {
    throw new Error("Template só existe no WhatsApp — no Instagram e no Messenger, responda dentro da janela");
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
  if (channel.kind === "messenger") {
    if (channel.fb) await fbTypingOn(channel.fb, fbRecipientOf(params.to));
    return;
  }
  if (channel.kind === "sms") return; // SMS não tem "digitando"
  if (channel.whatsapp) await markReadWithTyping(channel.whatsapp, params.lastInboundExternalId);
}

/** Reação a uma mensagem do cliente. O Instagram e o Messenger só aceitam ❤️
 *  pela API; o SMS não tem reação. */
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
  if (channel.kind === "messenger") {
    if (!channel.fb) throw new Error("Messenger desconectado");
    await fbReact(channel.fb, fbRecipientOf(params.to), params.messageExternalId);
    return "❤️";
  }
  if (channel.kind === "sms") throw new Error("SMS não tem reação");
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
