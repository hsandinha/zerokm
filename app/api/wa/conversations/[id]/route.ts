// Detalhe da conversa (histórico + dossiê do cliente) e mudança de estado:
// assumir, devolver para a IA, encerrar, mover de etapa, atribuir.

import { NextRequest, NextResponse } from "next/server";
import { requirePanelUser, type PanelUser } from "@wa/lib/auth";
import dbConnect from "@/lib/mongodb";
import { WaAiJob, WaCampaign, WaContact, WaConversation, WaMessage } from "@wa/models/wa";
import { getDossier } from "@wa/lib/dossier";
import { isStage } from "@wa/lib/stages";
import { setConversationStage } from "@wa/lib/conversation-stage";
import { emitEvent } from "@wa/lib/webhooks";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requirePanelUser();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  await dbConnect();

  const conversation = await WaConversation.findById(id).lean();
  if (!conversation) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }

  const contactDoc = await WaContact.findById(conversation.contactId);
  const [messages, campaign] = await Promise.all([
    WaMessage.find({ conversationId: id }).sort({ createdAt: 1 }).limit(200).lean(),
    conversation.campaignId
      ? WaCampaign.findById(conversation.campaignId).select("name").lean()
      : Promise.resolve(null),
  ]);

  // Zera o não lido ao abrir
  await WaConversation.updateOne({ _id: id }, { unreadCount: 0 });

  const dossier = contactDoc ? await getDossier(contactDoc) : null;

  return NextResponse.json({
    conversation: {
      id: String(conversation._id),
      status: conversation.status,
      outcome: conversation.outcome ?? null,
      transferReason: conversation.transferReason ?? null,
      lastInboundAt: conversation.lastInboundAt ?? null,
      lastMessageAt: conversation.lastMessageAt ?? null,
      stage: conversation.stage,
      stageChangedAt: conversation.stageChangedAt,
      assignedTo: conversation.assignedTo ?? null,
      waitingSince: conversation.waitingSince ?? null,
      createdAt: conversation.createdAt,
      campaign: campaign ? { id: String(campaign._id), name: campaign.name } : null,
    },
    contact: contactDoc
      ? {
          id: String(contactDoc._id),
          phone: contactDoc.phone,
          name: contactDoc.name ?? null,
          email: contactDoc.email ?? null,
          document: contactDoc.document ?? null,
          company: contactDoc.company ?? null,
          city: contactDoc.city ?? null,
          state: contactDoc.state ?? null,
          optOut: contactDoc.optOut,
          registered: Boolean(contactDoc.userId || contactDoc.firebaseUid),
        }
      : null,
    dossier,
    messages: messages.map((m) => ({
      id: String(m._id),
      direction: m.direction,
      sender: m.sender,
      content: m.content ?? null,
      mediaType: m.mediaType,
      mediaId: m.mediaId ?? null,
      status: m.status ?? null,
      error: m.error ?? null,
      reaction: m.reaction ?? null,
      createdAt: m.createdAt,
    })),
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  let user: PanelUser;
  try {
    user = await requirePanelUser();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    stage?: string;
    email?: string | null;
  };

  await dbConnect();
  const patch: Record<string, unknown> = {};
  let event: "conversa.atribuida" | "conversa.resolvida" | null = null;

  switch (body.action) {
    case "assumir":
      patch.status = "human_active";
      patch.assignedTo = user.email;
      // Assumiu: a espera acabou e o SLA para de correr.
      patch.waitingSince = null;
      event = "conversa.atribuida";
      break;
    case "devolver":
      patch.status = "ai_active";
      patch.transferReason = null;
      patch.assignedTo = null;
      patch.waitingSince = null;
      break;
    case "encerrar":
      patch.status = "closed";
      patch.waitingSince = null;
      event = "conversa.resolvida";
      break;
    case "etapa":
      if (!isStage(body.stage)) {
        return NextResponse.json({ error: "Etapa inválida" }, { status: 400 });
      }
      try {
        await setConversationStage(id, body.stage, user.email);
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Falha ao mover" },
          { status: 500 },
        );
      }
      return NextResponse.json({ ok: true });
    case "atribuir":
      patch.assignedTo = body.email ? String(body.email).toLowerCase() : null;
      event = body.email ? "conversa.atribuida" : null;
      break;
    default:
      return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  }

  const updated = await WaConversation.findByIdAndUpdate(id, patch, { new: true });
  if (!updated) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });

  // Regra de ouro: nunca IA e humano ao mesmo tempo.
  if (patch.status === "human_active" || patch.status === "closed") {
    await WaAiJob.updateMany(
      { conversationId: id, status: "pending" },
      { status: "done", lastError: `cancelado: ${body.action}` },
    );
  }

  if (event) {
    await emitEvent(
      event,
      { by: user.email, assignedTo: patch.assignedTo ?? null },
      { conversationId: id },
    );
  }
  return NextResponse.json({ ok: true, status: updated.status });
}
