// Envio manual pela Central — move a conversa para human_active e cancela
// jobs de IA pendentes (regra de ouro: nunca IA e humano ao mesmo tempo).

import { NextRequest, NextResponse } from "next/server";
import { requireScope, sameTenant, type Scope } from "@wa/lib/scope";
import dbConnect from "@/lib/mongodb";
import { WaContact, WaConversation } from "@wa/models/wa";
import { sendAndLogText } from "@wa/lib/send";
import { assumirAoResponder, autorDoEscopo, wamidCitado } from "@wa/lib/central";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let user: Scope;
  try {
    user = await requireScope();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    text?: string;
    /** Mensagem da conversa que esta resposta cita (id nosso, não o wamid). */
    replyToId?: string | null;
  };
  const text = (body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "Mensagem vazia" }, { status: 400 });

  await dbConnect();
  const conv = await WaConversation.findById(id);
  if (!conv || !sameTenant(user, conv)) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  const contact = await WaContact.findById(conv.contactId);
  if (!contact) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 });

  const replyTo = await wamidCitado(id, body.replyToId);

  try {
    await sendAndLogText({
      conversationId: id,
      to: contact.phone,
      text,
      sender: "human",
      replyTo,
      author: autorDoEscopo(user),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao enviar" },
      { status: 500 },
    );
  }

  // Respondeu à mão: a conversa é dele, e a espera do SLA acaba aqui.
  await assumirAoResponder(conv, user.email);

  return NextResponse.json({ ok: true });
}
