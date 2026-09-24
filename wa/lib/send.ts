// Envio de mensagem + persistência (mensagem outbound e estado da conversa).

import dbConnect from "@/lib/mongodb";
import { WaConversation, WaMessage } from "@wa/models/wa";
import { getWabaCredentials } from "@wa/lib/settings";
import { sendText, markReadWithTyping, sendTemplate } from "@wa/lib/meta";
import { emitEvent } from "@wa/lib/webhooks";

export async function sendAndLogText(params: {
  conversationId: string;
  to: string; // telefone canônico +55...
  text: string;
  sender: "ai" | "human" | "system";
}): Promise<boolean> {
  const creds = await getWabaCredentials();
  if (!creds) throw new Error("WABA não configurado (token/phone_number_id)");

  const { external_id } = await sendText(creds, params.to, params.text);

  await dbConnect();
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
  const creds = await getWabaCredentials();
  if (!creds) throw new Error("WABA não configurado (token/phone_number_id)");

  const { external_id } = await sendTemplate(
    creds,
    params.to,
    params.templateName,
    params.language ?? "pt_BR",
    params.bodyParams ?? [],
  );

  await dbConnect();
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
export async function showTyping(lastInboundExternalId: string) {
  const creds = await getWabaCredentials();
  if (!creds) return;
  await markReadWithTyping(creds, lastInboundExternalId);
}

/**
 * A janela de 24h da Meta conta a partir da ÚLTIMA mensagem recebida. Fora
 * dela só passa template — texto livre é rejeitado pela API, e é por isso que
 * a cadência de follow-up precisa saber a diferença.
 */
export function isWithin24hWindow(lastInboundAt: Date | string | null | undefined): boolean {
  if (!lastInboundAt) return false;
  return Date.now() - new Date(lastInboundAt).getTime() < 24 * 3600_000;
}
