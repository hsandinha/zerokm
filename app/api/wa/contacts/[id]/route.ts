// Contato: dossiê completo e as duas edições que a operação precisa fazer à
// mão — corrigir nome/empresa e ligar ou desligar o opt-out.

import { NextRequest, NextResponse } from "next/server";
import { requirePanelUser, type PanelUser } from "@wa/lib/auth";
import dbConnect from "@/lib/mongodb";
import { WaContact, WaConversation } from "@wa/models/wa";
import { getDossier } from "@wa/lib/dossier";
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
  const contact = await WaContact.findById(id);
  if (!contact) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 });

  const [conversation, dossier] = await Promise.all([
    WaConversation.findOne({ contactId: contact._id }).lean(),
    getDossier(contact),
  ]);

  return NextResponse.json({
    contact: {
      id: String(contact._id),
      phone: contact.phone,
      name: contact.name ?? null,
      email: contact.email ?? null,
      document: contact.document ?? null,
      company: contact.company ?? null,
      city: contact.city ?? null,
      state: contact.state ?? null,
      cnae: contact.cnae ?? null,
      source: contact.source,
      optOut: contact.optOut,
      registered: Boolean(contact.userId || contact.firebaseUid),
      createdAt: contact.createdAt,
    },
    conversation: conversation
      ? {
          id: String(conversation._id),
          status: conversation.status,
          stage: conversation.stage,
          lastMessageAt: conversation.lastMessageAt ?? null,
        }
      : null,
    dossier,
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
    name?: string;
    email?: string;
    company?: string;
    optOut?: boolean;
  };

  await dbConnect();
  const contact = await WaContact.findById(id);
  if (!contact) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 });

  if (body.name !== undefined) contact.name = body.name.trim() || undefined;
  if (body.email !== undefined) contact.email = body.email.trim().toLowerCase() || undefined;
  if (body.company !== undefined) contact.company = body.company.trim() || undefined;

  const optOutMudou = body.optOut !== undefined && body.optOut !== contact.optOut;
  if (body.optOut !== undefined) contact.optOut = body.optOut;
  await contact.save();

  if (optOutMudou && contact.optOut) {
    const conversation = await WaConversation.findOne({ contactId: contact._id });
    await emitEvent(
      "contato.optout",
      { phone: contact.phone, via: `painel (${user.email})` },
      conversation ? { conversationId: String(conversation._id) } : {},
    );
  }

  return NextResponse.json({ ok: true });
}
