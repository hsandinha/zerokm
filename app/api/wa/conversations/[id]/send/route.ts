// Envio manual pela Central — move a conversa para human_active e cancela
// jobs de IA pendentes (regra de ouro: nunca IA e humano ao mesmo tempo).

import { NextRequest, NextResponse } from "next/server";
import { requirePanelUser, type PanelUser } from "@wa/lib/auth";
import dbConnect from "@/lib/mongodb";
import { WaAiJob, WaContact, WaConversation } from "@wa/models/wa";
import { sendAndLogText } from "@wa/lib/send";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let user: PanelUser;
  try {
    user = await requirePanelUser();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { text?: string };
  const text = (body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "Mensagem vazia" }, { status: 400 });

  await dbConnect();
  const conv = await WaConversation.findById(id);
  if (!conv) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  const contact = await WaContact.findById(conv.contactId);
  if (!contact) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 });

  try {
    await sendAndLogText({ conversationId: id, to: contact.phone, text, sender: "human" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao enviar" },
      { status: 500 },
    );
  }

  // Respondeu à mão: a conversa é dele, e a espera do SLA acaba aqui.
  if (conv.status !== "human_active" || !conv.assignedTo) {
    conv.status = "human_active";
    conv.assignedTo = conv.assignedTo ?? user.email;
    conv.waitingSince = null;
    await conv.save();
  }
  await WaAiJob.updateMany(
    { conversationId: conv._id, status: "pending" },
    { status: "done", lastError: "cancelado: humano respondeu" },
  );

  return NextResponse.json({ ok: true });
}
