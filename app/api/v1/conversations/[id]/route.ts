// API pública — uma conversa com histórico e a situação do cliente na CNV.

import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@wa/lib/api-keys";
import dbConnect from "@/lib/mongodb";
import { WaContact, WaConversation, WaMessage } from "@wa/models/wa";
import { getDossier } from "@wa/lib/dossier";
import { apiError } from "@wa/lib/public-api";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    await requireApiKey(req);
    const { id } = await params;

    await dbConnect();
    const conv = await WaConversation.findById(id).lean();
    if (!conv) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });

    const contact = await WaContact.findById(conv.contactId);
    const messages = await WaMessage.find({ conversationId: id })
      .sort({ createdAt: 1 })
      .limit(200)
      .lean();

    return NextResponse.json({
      conversation: {
        id: String(conv._id),
        status: conv.status,
        stage: conv.stage,
        outcome: conv.outcome ?? null,
        transferReason: conv.transferReason ?? null,
        assignedTo: conv.assignedTo ?? null,
        campaignId: conv.campaignId ? String(conv.campaignId) : null,
        lastMessageAt: conv.lastMessageAt ?? null,
        lastInboundAt: conv.lastInboundAt ?? null,
        createdAt: conv.createdAt,
      },
      contact: contact
        ? {
            id: String(contact._id),
            phone: contact.phone,
            name: contact.name ?? null,
            email: contact.email ?? null,
            company: contact.company ?? null,
            document: contact.document ?? null,
            optOut: contact.optOut,
          }
        : null,
      customer: contact ? await getDossier(contact) : null,
      messages: messages.map((m) => ({
        id: String(m._id),
        direction: m.direction,
        sender: m.sender,
        text: m.content ?? null,
        type: m.mediaType,
        status: m.status ?? null,
        createdAt: m.createdAt,
      })),
    });
  } catch (err) {
    return apiError(err);
  }
}
