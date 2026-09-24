// Pipeline de mensagem recebida: contato → conversa → mensagem → fila da IA
// (com debounce). Portado do whatsappsocila, single-tenant e em Mongo.

import dbConnect from "@/lib/mongodb";
import {
  WaAiJob,
  WaCampaign,
  WaCampaignRecipient,
  WaContact,
  WaConversation,
  WaFollowup,
  WaMessage,
} from "@wa/models/wa";
import { canonicalPhone } from "@wa/lib/phone";
import { emitEvent } from "@wa/lib/webhooks";
import { advanceConversationStage } from "@wa/lib/conversation-stage";

const OPT_OUT_WORDS = [
  "parar",
  "sair",
  "cancelar",
  "descadastrar",
  "stop",
  "não receber mensagens",
  "nao receber mensagens",
];
const AI_DEBOUNCE_SECONDS = 10;

// Conversa parada com humano (waiting_human/human_active) volta para a IA
// quando o cliente escreve depois deste silêncio. É um funil de vendas:
// respondemos 24/7, sem janela de horário comercial.
const AI_REACTIVATION_SILENCE_MS = 3600_000; // 1h

export type NormalizedInbound = {
  from: string; // dígitos, ex 5531999999999
  contactName?: string | null;
  type: string;
  text?: string | null;
  externalId: string;
  mediaCaption?: string | null;
  mediaId?: string | null;
  reaction?: { targetExternalId: string; emoji: string } | null;
};

export async function processInbound(msg: NormalizedInbound) {
  await dbConnect();
  const phone = canonicalPhone(msg.from);
  const textContent = msg.text ?? msg.mediaCaption ?? null;

  // 0. Reação: não vira mensagem — reflete o emoji na mensagem alvo e sai.
  if (msg.type === "reaction" && msg.reaction) {
    await WaMessage.updateOne(
      { externalId: msg.reaction.targetExternalId },
      { reaction: msg.reaction.emoji || null },
    ).catch(() => {});
    return;
  }

  // Dedupe por wamid
  const existing = await WaMessage.findOne({ externalId: msg.externalId }).select("_id");
  if (existing) return;

  // 1. Contato
  const contact = await WaContact.findOneAndUpdate(
    { phone },
    {
      $setOnInsert: { phone, source: "whatsapp" },
      ...(msg.contactName ? { $set: { name: msg.contactName } } : {}),
    },
    { new: true, upsert: true },
  );

  // 2. Conversa (uma por contato)
  const conversationExisted = await WaConversation.exists({ contactId: contact._id });
  let conversation = await WaConversation.findOneAndUpdate(
    { contactId: contact._id },
    {
      $setOnInsert: {
        contactId: contact._id,
        status: "ai_active",
        stage: "conversa",
        stageChangedAt: new Date(),
      },
    },
    { new: true, upsert: true },
  );
  if (!conversationExisted) {
    await emitEvent(
      "conversa.criada",
      { origin: "inbound" },
      { conversationId: String(conversation._id) },
    );
  }

  // 2b. Atribuição de campanha: resposta em até 7 dias após um disparo.
  if (!conversation.campaignId) {
    const recipient = await WaCampaignRecipient.findOne({
      phone,
      status: { $in: ["sent", "delivered", "read"] },
      sentAt: { $gte: new Date(Date.now() - 7 * 86400000) },
    }).sort({ sentAt: -1 });
    if (recipient) {
      conversation.campaignId = recipient.campaignId;
      await conversation.save();
      await WaCampaignRecipient.updateOne(
        { _id: recipient._id },
        { status: "replied", conversationId: conversation._id },
      );
      await WaCampaign.updateOne({ _id: recipient.campaignId }, { $inc: { replied: 1 } });

      // Campanha por pessoa: o bureau devolve vários celulares do mesmo sócio
      // e não diz qual está ativo. Respondeu em um, os outros que ainda não
      // saíram são cancelados — falar oito vezes com quem já respondeu é o
      // caminho mais curto para virar spam.
      if (recipient.partnerId) {
        const cancelados = await WaCampaignRecipient.updateMany(
          {
            partnerId: recipient.partnerId,
            status: "pending",
            _id: { $ne: recipient._id },
          },
          { status: "skipped", error: "a pessoa já respondeu em outro número" },
        );
        if (cancelados.modifiedCount > 0) {
          await WaCampaign.updateOne(
            { _id: recipient.campaignId },
            { $inc: { skipped: cancelados.modifiedCount } },
          );
        }
      }
    }
  }

  // Respondeu: a cadência agendada perde a razão de existir.
  await WaFollowup.updateMany(
    { conversationId: conversation._id, status: "pending" },
    { status: "cancelled" },
  );

  // Conversa fechada ou esquecida com humano → IA reassume.
  const silenceMs = Date.now() - new Date(conversation.lastMessageAt ?? 0).getTime();
  const staleAtHuman =
    (conversation.status === "waiting_human" || conversation.status === "human_active") &&
    silenceMs >= AI_REACTIVATION_SILENCE_MS;
  if (conversation.status === "closed" || staleAtHuman) {
    conversation = (await WaConversation.findOneAndUpdate(
      { _id: conversation._id },
      { status: "ai_active", transferReason: null },
      { new: true },
    ))!;
  }

  // 3. Grava a mensagem
  await WaMessage.create({
    conversationId: conversation._id,
    direction: "inbound",
    sender: "contact",
    content: textContent ?? undefined,
    mediaType: msg.type === "text" ? "text" : msg.type,
    mediaId: msg.mediaId || undefined,
    externalId: msg.externalId,
    status: "delivered",
  }).catch((err) => {
    // Corrida do dedupe (duas entregas simultâneas do mesmo wamid)
    if ((err as { code?: number })?.code !== 11000) throw err;
  });

  const inboundAt = new Date();
  await WaConversation.updateOne(
    { _id: conversation._id },
    {
      lastMessageAt: inboundAt,
      lastInboundAt: inboundAt, // janela de 24h da Meta conta a partir daqui
      lastMessagePreview: (textContent ?? `[${msg.type}]`).slice(0, 120),
      $inc: { unreadCount: 1 },
    },
  );

  // Respondeu: sai de "abordado" e entra no funil de conversa.
  await advanceConversationStage(String(conversation._id), "conversa");
  await emitEvent(
    "mensagem.recebida",
    {
      message: {
        text: textContent,
        type: msg.type,
        externalId: msg.externalId,
      },
    },
    { conversationId: String(conversation._id) },
  );

  const lower = (textContent ?? "").toLowerCase().trim();

  // 4. Opt-out
  if (lower && OPT_OUT_WORDS.includes(lower)) {
    await WaContact.updateOne({ _id: contact._id }, { optOut: true });
    await WaConversation.updateOne(
      { _id: conversation._id },
      { status: "closed", outcome: "opt_out", stage: "perdido", stageChangedAt: new Date(), waitingSince: null },
    );
    // Cadência agendada não pode continuar depois de um pedido de saída.
    await WaFollowup.updateMany(
      { conversationId: conversation._id, status: "pending" },
      { status: "cancelled" },
    );
    await emitEvent(
      "contato.optout",
      { phone: contact.phone, via: "palavra-chave" },
      { conversationId: String(conversation._id) },
    );
    return;
  }

  // Se humano/fila já cuida da conversa, não aciona IA
  if (conversation.status !== "ai_active") return;

  // 5. Enfileira a IA com debounce (junta mensagens picadas). O índice único
  // parcial garante um pendente por conversa; perder a corrida da inserção
  // (11000) significa que outro chegou primeiro — empurra o dele.
  const runAfter = new Date(Date.now() + AI_DEBOUNCE_SECONDS * 1000);
  const bumped = await WaAiJob.findOneAndUpdate(
    { conversationId: conversation._id, status: "pending", runAfter: { $lt: runAfter } },
    { runAfter },
  );
  if (!bumped) {
    await WaAiJob.create({ conversationId: conversation._id, runAfter }).catch(async (err) => {
      if ((err as { code?: number })?.code === 11000) {
        await WaAiJob.updateOne(
          { conversationId: conversation._id, status: "pending", runAfter: { $lt: runAfter } },
          { runAfter },
        );
      } else {
        throw err;
      }
    });
  }
}
