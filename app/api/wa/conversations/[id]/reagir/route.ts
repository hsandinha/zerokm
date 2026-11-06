// Reação da equipe a uma mensagem do cliente (só WhatsApp: o Direct e o
// Messenger só aceitam ❤️ pela API, e o SMS não tem reação).

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireScope, scopeError, type Scope } from "@wa/lib/scope";
import { WaContact, WaMessage } from "@wa/models/wa";
import { channelForConversation } from "@wa/lib/channels";
import { MetaApiError } from "@wa/lib/meta";
import { reactOnChannel } from "@wa/lib/send";
import { conversaDoEscopo } from "@wa/lib/central";

/** As mesmas seis do WhatsApp no celular. "" tira a reação. */
const EMOJIS = new Set(["👍", "❤️", "😂", "😮", "😢", "🙏", ""]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let user: Scope;
  try {
    user = await requireScope();
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { messageId?: string; emoji?: string };
  const emoji = String(body.emoji ?? "");
  if (!EMOJIS.has(emoji)) return NextResponse.json({ error: "Reação inválida" }, { status: 400 });
  if (!body.messageId || !mongoose.isValidObjectId(body.messageId)) {
    return NextResponse.json({ error: "Mensagem não encontrada" }, { status: 404 });
  }

  const conv = await conversaDoEscopo(user, id);
  if (!conv) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  const msg = await WaMessage.findOne({ _id: body.messageId, conversationId: conv._id });
  if (!msg?.externalId || msg.direction !== "inbound") {
    return NextResponse.json({ error: "Só dá para reagir a uma mensagem do cliente." }, { status: 400 });
  }
  const channel = await channelForConversation(conv);
  if (channel.kind !== "whatsapp") {
    return NextResponse.json({ error: "Reação só pelo WhatsApp." }, { status: 400 });
  }
  const contact = await WaContact.findById(conv.contactId).select("phone").lean();
  if (!contact) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 });

  try {
    await reactOnChannel({ conversationId: id, to: contact.phone, messageExternalId: msg.externalId, emoji });
  } catch (err) {
    const status = err instanceof MetaApiError ? 502 : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Falha ao reagir" }, { status });
  }
  // A mensagem do cliente guarda a NOSSA reação: o webhook só avisa a dele.
  msg.reaction = emoji || undefined;
  await msg.save();
  return NextResponse.json({ ok: true });
}
