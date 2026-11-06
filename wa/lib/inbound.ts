// Pipeline de mensagem recebida: contato → conversa → mensagem → fila da IA
// (com debounce). Portado do whatsappsocila (Chatrun) e em Mongo. Serve todos
// os canais: o WhatsApp, o Direct do Instagram, o Messenger e o SMS entram
// aqui já normalizados.

import dbConnect from "@/lib/mongodb";
import { WaAiJob, WaContact, WaConversation, WaFollowup, WaMessage } from "@wa/models/wa";
import { WaChannel } from "@wa/models/channel";
import { contactKeyFor, type ResolvedChannel } from "@wa/lib/channels";
import { emitEvent } from "@wa/lib/webhooks";
import { advanceConversationStage } from "@wa/lib/conversation-stage";
import { atribuirRespostaDeCampanha } from "@wa/lib/campaign-reply";
import { mensagemParaEquipe } from "@wa/lib/fila";
import { registrarOrigem } from "@wa/lib/origem-loja";
import type { OrigemRecebida } from "@wa/lib/origem";
import { sincronizarOptOutNoGateway } from "@wa/lib/chatrun-bloqueio";

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
  from: string; // dígitos, ex 5531999999999 — no Instagram o IGSID, no Messenger o PSID
  contactName?: string | null;
  igUsername?: string | null;
  type: string;
  text?: string | null;
  externalId: string;
  mediaCaption?: string | null;
  mediaId?: string | null;
  reaction?: { targetExternalId: string; emoji: string } | null;
  /** O cliente respondeu citando esta mensagem (wamid). */
  contextExternalId?: string | null;
  /** Nome do documento que o cliente mandou. */
  filename?: string | null;

  /** Anúncio de clique para mensagem que trouxe o cliente (referral). */
  anuncio?: OrigemRecebida | null;
};

export async function processInbound(channel: ResolvedChannel, msg: NormalizedInbound) {
  await dbConnect();
  const kind = channel.kind;
  const instagram = kind === "instagram";
  const messenger = kind === "messenger";
  // "ig:<id>", "fb:<id>" ou o telefone canônico (WhatsApp e SMS: mesmo contato).
  const phone = contactKeyFor(kind, msg.from);
  // Contato e conversa são da loja dona do canal (null = CNV).
  const tenantId = channel.tenantId ?? null;
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
    { tenantId, phone },
    {
      $setOnInsert: {
        phone,
        tenantId,
        source: kind,
        ...(instagram ? { igUserId: msg.from } : {}),
        ...(messenger ? { fbPsid: msg.from } : {}),
      },
      ...(msg.contactName || msg.igUsername
        ? {
            $set: {
              ...(msg.contactName ? { name: msg.contactName } : {}),
              ...(msg.igUsername ? { igUsername: msg.igUsername } : {}),
            },
          }
        : {}),
    },
    { new: true, upsert: true },
  );

  // 2. Conversa (uma por contato — e o contato do Instagram é outro contato)
  const conversationExisted = await WaConversation.exists({ contactId: contact._id });
  let conversation = await WaConversation.findOneAndUpdate(
    { contactId: contact._id },
    {
      $setOnInsert: {
        contactId: contact._id,
        tenantId,
        ...(channel.id ? { channelId: channel.id } : {}),
        status: "ai_active",
        stage: "conversa",
        stageChangedAt: new Date(),
      },
    },
    { new: true, upsert: true },
  );
  // Telefone com WhatsApp e SMS é UM contato com UMA conversa. Ela segue o
  // canal por onde o cliente escreveu por último, para a resposta sair por
  // onde ele está: escreveu por SMS, a conversa passa para o canal SMS;
  // voltou a escrever no WhatsApp, volta para o WhatsApp. Sem SMS no meio,
  // nada muda (o WhatsApp continua como sempre foi).
  if (conversationExisted && (kind === "sms" || kind === "whatsapp")) {
    const current = conversation.channelId ? String(conversation.channelId) : null;
    if (current !== channel.id) {
      const currentKind = current
        ? (await WaChannel.findById(current).select("kind").lean())?.kind
        : "whatsapp";
      if (kind === "sms" || currentKind === "sms") {
        conversation = (await WaConversation.findOneAndUpdate(
          { _id: conversation._id },
          channel.id ? { channelId: channel.id } : { $unset: { channelId: 1 } },
          { new: true },
        ))!;
      }
    }
  }
  if (!conversationExisted) {
    await emitEvent(
      "conversa.criada",
      { origin: "inbound", channel: channel.kind },
      { conversationId: String(conversation._id) },
    );
  }

  // 2b. Atribuição de campanha: resposta em até 7 dias após um disparo.
  // Campanha é disparo de template, e template só existe no WhatsApp. Não
  // depende do campaignId da conversa: o worker grava esse campo ao disparar,
  // e por isso o "respondeu" nunca contava (ver wa/lib/campaign-reply.ts).
  if (kind === "whatsapp") {
    await atribuirRespostaDeCampanha({ tenantId, phone, conversationId: conversation._id }).catch((err) => {
      // Métrica não pode derrubar o atendimento: a mensagem segue para a IA.
      console.error("[inbound] atribuição de campanha falhou", err);
    });
  }

  // Respondeu: a cadência agendada perde a razão de existir.
  await WaFollowup.updateMany(
    { conversationId: conversation._id, status: "pending" },
    { status: "cancelled" },
  );

  // Respondeu: o follow-up da coluna do funil recomeça do primeiro toque
  // (wa/lib/funil-followup.ts). Só escreve se havia contagem.
  await WaConversation.updateOne(
    { _id: conversation._id, followupCount: { $gt: 0 } },
    { $set: { followupCount: 0 } },
  );

  // Cliente que volta a uma conversa encerrada começa um atendimento novo,
  // sem o vendedor do ciclo anterior (folga, saiu da loja): senão a fila da
  // equipe nasceria com ele e só ele seria avisado (wa/lib/fila.ts).
  if (conversation.status === "closed" && conversation.assignedTo) {
    await WaConversation.updateOne({ _id: conversation._id, status: "closed" }, { assignedTo: null });
  }

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
    ...(msg.contextExternalId ? { contextExternalId: msg.contextExternalId } : {}),
    ...(msg.filename ? { filename: msg.filename.slice(0, 200) } : {}),
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

  // Origem do lead: o anúncio fica na conversa e no contato (best-effort).
  if (msg.anuncio) {
    await registrarOrigem({ tenantId, contactId: contact._id, conversationId: conversation._id, origem: msg.anuncio }).catch(
      (err) => console.error("[inbound] origem do anúncio não gravada", err),
    );
  }

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
    // Instagram/Messenger: o gateway também precisa saber (isca de comentário).
    await sincronizarOptOutNoGateway(contact, true, "palavra-chave");
    return;
  }

  // Conversa que já está com a equipe: avisa o responsável (push) e, fora do
  // horário da loja, responde com a mensagem automática (wa/lib/fila.ts).
  if (conversation.status !== "ai_active") {
    await mensagemParaEquipe(String(conversation._id)).catch((err) => {
      console.error("[inbound] operação da equipe falhou", err);
    });
  }

  // Se humano/fila já cuida da conversa, não aciona IA
  if (conversation.status !== "ai_active") return;

  // SMS: a IA não responde (cada mensagem é paga, e a fala da IA é longa
  // demais para SMS). Vai direto para a fila da equipe, como no Chatrun.
  if (kind === "sms") {
    await WaConversation.updateOne(
      { _id: conversation._id },
      { status: "waiting_human", transferReason: "Respondeu por SMS", waitingSince: new Date() },
    );
    return;
  }

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
