// API pública — enviar texto numa conversa (dentro da janela de 24h).
// Quem escreve por aqui assume a conversa: a IA para de responder.

import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@wa/lib/api-keys";
import dbConnect from "@/lib/mongodb";
import { WaAiJob, WaContact, WaConversation } from "@wa/models/wa";
import { isWithin24hWindow, sendAndLogText } from "@wa/lib/send";
import { apiError } from "@wa/lib/public-api";

export const maxDuration = 30;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const caller = await requireApiKey(req);
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { text?: string };
    const text = body.text?.trim();
    if (!text) return NextResponse.json({ error: "Informe o texto" }, { status: 400 });

    await dbConnect();
    const conv = await WaConversation.findById(id);
    if (!conv) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
    if (!isWithin24hWindow(conv.lastInboundAt)) {
      return NextResponse.json(
        {
          error:
            "Fora da janela de 24h do WhatsApp — use POST /api/v1/conversations/start com um template aprovado",
        },
        { status: 409 },
      );
    }
    const contact = await WaContact.findById(conv.contactId);
    if (!contact) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 });
    if (contact.optOut) return NextResponse.json({ error: "Contato em opt-out" }, { status: 409 });

    if (conv.status !== "human_active") {
      conv.status = "human_active";
      conv.assignedTo = conv.assignedTo ?? `api:${caller.name}`;
      conv.waitingSince = null;
      await conv.save();
      await WaAiJob.updateMany(
        { conversationId: conv._id, status: "pending" },
        { status: "done", lastError: "cancelado: mensagem pela API" },
      );
    }
    await sendAndLogText({ conversationId: id, to: contact.phone, text, sender: "human" });
    return NextResponse.json({ ok: true, conversationId: id });
  } catch (err) {
    return apiError(err);
  }
}
