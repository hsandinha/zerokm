// Fila da Central: conversas ordenadas pela última mensagem, mais os
// contadores de cada filtro (uma agregação só).

import { NextRequest, NextResponse } from "next/server";
import { requirePanelUser, type PanelUser } from "@wa/lib/auth";
import dbConnect from "@/lib/mongodb";
import { WaContact, WaConversation } from "@wa/models/wa";
import { getSettings } from "@wa/lib/settings";
import { conversationCounts } from "@wa/lib/inbox";
import { SLA_MINUTES, isSlaViolated, type ConversationStatus } from "@wa/lib/stages";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  let user: PanelUser;
  try {
    user = await requirePanelUser();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const filtro = sp.get("status");
  const limit = Math.min(Number(sp.get("limit") ?? 300), 500);

  await dbConnect();
  const query: Record<string, unknown> = {};
  if (filtro === "minhas") {
    query.assignedTo = user.email;
    query.status = { $ne: "closed" };
  } else if (filtro === "sla") {
    query.status = "waiting_human";
    query.waitingSince = { $lt: new Date(Date.now() - SLA_MINUTES * 60_000) };
  } else if (filtro && filtro !== "todas") {
    query.status = filtro;
  }

  const [conversations, counts, settings] = await Promise.all([
    WaConversation.find(query).sort({ lastMessageAt: -1 }).limit(limit).lean(),
    conversationCounts(user.email),
    getSettings().catch(() => null),
  ]);

  const contacts = await WaContact.find({
    _id: { $in: conversations.map((c) => c.contactId) },
  }).lean();
  const byId = new Map(contacts.map((c) => [String(c._id), c]));

  return NextResponse.json({
    conversations: conversations.map((c) => {
      const contact = byId.get(String(c.contactId));
      const waitingSince = c.waitingSince ? new Date(c.waitingSince).toISOString() : null;
      return {
        id: String(c._id),
        status: c.status,
        outcome: c.outcome ?? null,
        transferReason: c.transferReason ?? null,
        lastMessageAt: c.lastMessageAt ?? null,
        // Sem lastInboundAt o contato nunca escreveu (só recebeu o template da
        // campanha) — e é o que decide se dá para responder com texto livre.
        lastInboundAt: c.lastInboundAt ?? null,
        preview: c.lastMessagePreview ?? null,
        unread: c.unreadCount ?? 0,
        stage: c.stage,
        assignedTo: c.assignedTo ?? null,
        waitingSince,
        slaViolated: isSlaViolated(c.status as ConversationStatus, waitingSince),
        campaignId: c.campaignId ? String(c.campaignId) : null,
        contact: {
          id: contact ? String(contact._id) : null,
          phone: contact?.phone ?? "",
          name: contact?.name ?? null,
          company: contact?.company ?? null,
          registered: Boolean(contact?.userId || contact?.firebaseUid),
          optOut: contact?.optOut ?? false,
        },
      };
    }),
    counts,
    channel: { phone: settings?.wabaDisplayPhone ?? null },
    me: user.email,
  });
}
