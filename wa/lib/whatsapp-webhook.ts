// Processamento do que chega pelo WhatsApp (mensagens, ecos do celular e
// status), no formato do webhook da Meta. Serve as duas portas de entrada:
// o webhook da Meta (/api/webhooks/meta, números com credencial própria) e
// os eventos do Chatrun Conexão (/api/chatrun/eventos, números das lojas
// conectados pelo gateway), que chegam convertidos para este formato.

import dbConnect from "@/lib/mongodb";
import { WaAiJob, WaCampaign, WaCampaignRecipient, WaContact, WaConversation, WaMessage } from "@wa/models/wa";
import { canonicalPhone } from "@wa/lib/phone";
import type { ResolvedChannel } from "@wa/lib/channels";
import type { MetaWebhookValue } from "@wa/lib/meta";
import { processInbound, type NormalizedInbound } from "@wa/lib/inbound";
import { isLocalUrl, siteUrl } from "@wa/lib/site-url";

export function normalize(value: MetaWebhookValue): NormalizedInbound[] {
  const contacts = value.contacts ?? [];
  return (value.messages ?? []).map((m) => {
    const name = contacts.find((c) => c.wa_id === m.from)?.profile?.name ?? null;
    const media = m.image ?? m.audio ?? m.video ?? m.document ?? m.sticker;
    return {
      from: m.from,
      contactName: name,
      type: m.type,
      text:
        m.text?.body ??
        m.button?.text ??
        m.interactive?.button_reply?.title ??
        m.interactive?.list_reply?.title ??
        null,
      externalId: m.id,
      mediaCaption:
        m.image?.caption ?? m.video?.caption ?? m.document?.caption ?? null,
      mediaId: media?.id ?? null,
      reaction: m.reaction
        ? { targetExternalId: m.reaction.message_id, emoji: m.reaction.emoji ?? "" }
        : null,
    };
  });
}

export async function handleStatuses(value: MetaWebhookValue) {
  await dbConnect();
  for (const s of value.statuses ?? []) {
    // O motivo da recusa fica na própria mensagem: sem isso, na Central uma
    // mensagem que a Meta recusou aparece igual a uma entregue, e quem atende
    // não tem como saber que o cliente nunca recebeu aquilo.
    const erro = s.errors?.map((e) => `${e.code}: ${e.title}`).join("; ");
    await WaMessage.updateOne(
      { externalId: s.id },
      { status: s.status, ...(erro ? { error: erro } : {}) },
    ).catch(() => {});

    const recipient = await WaCampaignRecipient.findOne({ externalId: s.id });
    if (recipient) {
      if (s.status === "delivered" && recipient.status === "sent") {
        recipient.status = "delivered";
        await recipient.save();
        await WaCampaign.updateOne({ _id: recipient.campaignId }, { $inc: { delivered: 1 } });
      } else if (s.status === "read" && recipient.status !== "read" && recipient.status !== "replied") {
        const wasDelivered = recipient.status === "delivered";
        recipient.status = "read";
        await recipient.save();
        await WaCampaign.updateOne(
          { _id: recipient.campaignId },
          { $inc: { read: 1, ...(wasDelivered ? {} : { delivered: 1 }) } },
        );
      } else if (s.status === "failed") {
        recipient.status = "failed";
        recipient.error = erro;
        await recipient.save();
        await WaCampaign.updateOne({ _id: recipient.campaignId }, { $inc: { failed: 1 } });
      }
    }
  }
}

/**
 * Coexistência: a loja respondeu pelo app WhatsApp Business do celular. A
 * mensagem não passou pela plataforma — sem isto a IA continuaria falando por
 * cima. Vira mensagem humana na conversa e a IA para (regra de ouro).
 */
export async function handleEchoes(channel: ResolvedChannel, value: MetaWebhookValue) {
  await dbConnect();
  for (const echo of value.message_echoes ?? []) {
    if (await WaMessage.exists({ externalId: echo.id })) continue; // foi a plataforma
    const contact = await WaContact.findOne({
      tenantId: channel.tenantId ?? null,
      phone: canonicalPhone(echo.to),
    });
    if (!contact) continue;
    const conv = await WaConversation.findOne({ contactId: contact._id });
    if (!conv) continue;
    const text = echo.text?.body ?? null;
    await WaMessage.create({
      conversationId: conv._id,
      direction: "outbound",
      sender: "human",
      content: text ?? undefined,
      mediaType: echo.type === "text" ? "text" : echo.type,
      externalId: echo.id,
      status: "sent",
    }).catch((err) => {
      if ((err as { code?: number })?.code !== 11000) throw err;
    });
    await WaConversation.updateOne(
      { _id: conv._id },
      {
        status: "human_active",
        waitingSince: null,
        lastMessageAt: new Date(),
        lastMessagePreview: (text ?? `[${echo.type}]`).slice(0, 120),
      },
    );
    await WaAiJob.updateMany(
      { conversationId: conv._id, status: "pending" },
      { status: "done", lastError: "cancelado: a loja respondeu pelo celular" },
    );
  }
}

/**
 * Um `value` do webhook (uma mudança) já com o canal que recebeu. Devolve se
 * entrou mensagem de cliente, para quem chamou acordar o worker da IA.
 */
export async function processWhatsappValue(
  channel: ResolvedChannel,
  value: MetaWebhookValue,
): Promise<{ hadInbound: boolean }> {
  let hadInbound = false;
  for (const msg of normalize(value)) {
    try {
      await processInbound(channel, msg);
      hadInbound = true;
    } catch (err) {
      console.error("[whatsapp] processInbound falhou:", err);
    }
  }
  if (value.message_echoes?.length) {
    await handleEchoes(channel, value).catch((err) => console.error("[whatsapp] ecos falharam:", err));
  }
  if (value.statuses?.length) {
    await handleStatuses(value).catch((err) => console.error("[whatsapp] statuses falhou:", err));
  }
  return { hadInbound };
}

/**
 * Acorda o worker de IA sem esperar (o cron de 1min é a rede de segurança).
 * A base sai de `siteUrl(req)`, que prefere o host que ATENDEU esta
 * requisição: ler NEXT_PUBLIC_SITE_URL direto já mandou a chamada para
 * `localhost` em produção, e aí a IA só respondia no minuto seguinte.
 */
export function wakeAiWorker(req: Request): void {
  if (!process.env.CRON_SECRET) return;
  const base = siteUrl(req);
  if (isLocalUrl(base)) return;
  fetch(`${base}/api/wa/workers/ai`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  }).catch(() => {});
}
