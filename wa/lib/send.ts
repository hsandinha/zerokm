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
import {
  sendText,
  sendMedia,
  markReadWithTyping,
  sendTemplate,
  sendReaction,
  type TemplateButtonUrlParam,
  type TemplateHeaderParam,
  type WhatsAppMediaType,
} from "@wa/lib/meta";
import { igReact, igSendText, igTypingOn } from "@wa/lib/instagram";
import { fbReact, fbSendText, fbTypingOn } from "@wa/lib/messenger";
import { sendSms } from "@wa/lib/sms";
import { emitEvent } from "@wa/lib/webhooks";

const DAY_MS = 24 * 3600_000;

/** Quem da equipe mandou (a Central, a mensagem programada). Vira
 *  authorEmail/authorName na mensagem: o balão mostra o nome e os relatórios
 *  contam por atendente. */
export type AutorDaMensagem = { email: string; name?: string | null };

function camposDoAutor(sender: string, author: AutorDaMensagem | null | undefined) {
  const email = author?.email?.toLowerCase().trim();
  if (sender !== "human" || !email) return {};
  return { authorEmail: email, ...(author?.name?.trim() ? { authorName: author.name.trim() } : {}) };
}

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
  /** wamid da mensagem citada. Só o WhatsApp mostra a citação; nos outros
   *  canais a resposta sai normal (e a Central ainda guarda o vínculo). */
  replyTo?: string | null;
  author?: AutorDaMensagem | null;
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
    ({ external_id } = await sendText(channel.whatsapp, params.to, params.text, params.replyTo));
  }

  await WaMessage.create({
    conversationId: params.conversationId,
    direction: "outbound",
    sender: params.sender,
    content: params.text,
    mediaType: "text",
    externalId: external_id || undefined,
    status: "sent",
    ...camposDoAutor(params.sender, params.author),
    ...(via ? { via } : {}),
    ...(params.replyTo ? { contextExternalId: params.replyTo } : {}),
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

/** Prévia da conversa na fila para uma mídia (a legenda, quando houver). */
const PREVIA_DA_MIDIA: Record<WhatsAppMediaType, string> = {
  image: "📷 Foto",
  video: "🎬 Vídeo",
  audio: "🎤 Áudio",
  document: "📄 Documento",
  sticker: "Figurinha",
};

/**
 * Mídia por link público (o arquivo anexado na Central, já guardado em
 * wa/lib/midia-saida.ts, ou a foto do catálogo). Só no WhatsApp: o Direct, o
 * Messenger e o SMS daqui ainda mandam só texto.
 */
export async function sendAndLogMedia(params: {
  conversationId: string;
  to: string;
  link: string;
  type: WhatsAppMediaType;
  caption?: string | null;
  filename?: string | null;
  sender: "ai" | "human" | "system";
  replyTo?: string | null;
  /** WaMidiaSaida, quando o arquivo é nosso (a Central mostra por ele). */
  midiaId?: string | null;
  author?: AutorDaMensagem | null;
}): Promise<string> {
  const { channel } = await conversationChannel(params.conversationId);
  if (channel.kind !== "whatsapp") {
    throw new Error("Anexo só sai pelo WhatsApp por enquanto. Neste canal, mande o texto.");
  }
  if (!channel.whatsapp) throw new Error("WABA não configurado (token/phone_number_id)");

  const caption = params.caption?.trim() || undefined;
  const { external_id } = await sendMedia(
    channel.whatsapp,
    params.to,
    params.link,
    params.type,
    caption,
    params.filename ?? undefined,
    params.replyTo,
  );

  await WaMessage.create({
    conversationId: params.conversationId,
    direction: "outbound",
    sender: params.sender,
    content: caption,
    mediaType: params.type,
    externalId: external_id || undefined,
    status: "sent",
    ...camposDoAutor(params.sender, params.author),
    ...(params.midiaId ? { midiaId: params.midiaId } : { mediaUrl: params.link }),
    ...(params.filename ? { filename: params.filename } : {}),
    ...(params.replyTo ? { contextExternalId: params.replyTo } : {}),
  });
  await WaConversation.updateOne(
    { _id: params.conversationId },
    {
      lastMessageAt: new Date(),
      lastMessagePreview: (caption ?? params.filename ?? PREVIA_DA_MIDIA[params.type]).slice(0, 120),
    },
  );

  await emitEvent(
    "mensagem.enviada",
    {
      message: {
        text: caption ?? null,
        type: params.type,
        sender: params.sender,
        externalId: external_id || null,
      },
    },
    { conversationId: params.conversationId },
  );
  return external_id;
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
  /** Cabeçalho: {{1}} do texto ou o arquivo do cabeçalho de mídia. Opcional:
   *  template sem isso continua igual (ver wa/lib/template-envio.ts). */
  headerParams?: TemplateHeaderParam[];
  /** Final da URL dos botões de link dinâmico. */
  buttonUrlParams?: TemplateButtonUrlParam[];
  author?: AutorDaMensagem | null;
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
    { headerParams: params.headerParams, buttonUrlParams: params.buttonUrlParams },
  );

  await WaMessage.create({
    conversationId: params.conversationId,
    direction: "outbound",
    sender: params.sender ?? "system",
    content: params.renderedText ?? `[template ${params.templateName}]`,
    mediaType: "template",
    externalId: external_id || undefined,
    status: "sent",
    ...camposDoAutor(params.sender ?? "system", params.author),
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
    if (channel.fb) await fbTypingOn(channel.fb, fbRecipientOf(params.to), params.lastInboundExternalId);
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

/**
 * A equipe pode mandar mensagem livre agora? A mesma regra que a Central usa
 * para travar o campo: WhatsApp, 24h desde a última do cliente; Direct e
 * Messenger, 7 dias (tag de atendimento humano); SMS, sempre. Barrar aqui
 * evita gravar um anexo que a Meta vai recusar de qualquer jeito.
 */
export function podeMandarLivre(
  kind: string,
  lastInboundAt: Date | string | null | undefined,
): boolean {
  if (kind === "sms") return true;
  if (!lastInboundAt) return false;
  const limite = kind === "instagram" || kind === "messenger" ? 7 * DAY_MS : DAY_MS;
  return Date.now() - new Date(lastInboundAt).getTime() < limite;
}
