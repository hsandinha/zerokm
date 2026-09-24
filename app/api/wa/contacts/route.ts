// Quem já passou pelo número: busca, situação no funil e opt-out.
//
// A busca aceita nome, telefone, e-mail, CNPJ/CPF ou empresa — quem atende
// costuma ter na mão só um desses.

import { NextRequest, NextResponse } from "next/server";
import { requirePanelUser } from "@wa/lib/auth";
import dbConnect from "@/lib/mongodb";
import { WaCampaignRecipient, WaContact, WaConversation } from "@wa/models/wa";
import { onlyDigits } from "@wa/lib/documento";
import { parsePhoneBr } from "@wa/lib/phone";

export const dynamic = "force-dynamic";

const PAGE = 50;

export async function GET(req: NextRequest) {
  try {
    await requirePanelUser();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const busca = (sp.get("q") ?? "").trim();
  const filtro = sp.get("filtro") ?? "todos";
  const page = Math.max(1, Number(sp.get("page") ?? 1));

  await dbConnect();
  const query: Record<string, unknown> = {};

  if (busca) {
    const digits = onlyDigits(busca);
    const rx = new RegExp(busca.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const or: Record<string, unknown>[] = [{ name: rx }, { email: rx }, { company: rx }];
    if (digits.length >= 3) {
      or.push({ document: new RegExp(digits) });
      or.push({ phone: new RegExp(digits) });
      // Telefone digitado com máscara ou sem DDI ainda tem que achar.
      const parsed = parsePhoneBr(busca);
      if (parsed.valid && parsed.e164) or.push({ phone: parsed.e164 });
    }
    query.$or = or;
  }

  if (filtro === "cadastrados") query.userId = { $exists: true, $ne: null };
  else if (filtro === "sem_cadastro") query.userId = { $in: [null, undefined] };
  else if (filtro === "optout") query.optOut = true;

  const [contacts, total] = await Promise.all([
    WaContact.find(query)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * PAGE)
      .limit(PAGE)
      .lean(),
    WaContact.countDocuments(query),
  ]);

  const ids = contacts.map((c) => c._id);
  const [conversations, campaignCounts] = await Promise.all([
    WaConversation.find({ contactId: { $in: ids } })
      .select("contactId status stage lastMessageAt unreadCount")
      .lean(),
    WaCampaignRecipient.aggregate<{ _id: string; n: number }>([
      { $match: { phone: { $in: contacts.map((c) => c.phone) } } },
      { $group: { _id: "$phone", n: { $sum: 1 } } },
    ]),
  ]);
  const convByContact = new Map(conversations.map((c) => [String(c.contactId), c]));
  const campaignsByPhone = new Map(campaignCounts.map((c) => [c._id, c.n]));

  return NextResponse.json({
    contacts: contacts.map((c) => {
      const conv = convByContact.get(String(c._id));
      return {
        id: String(c._id),
        phone: c.phone,
        name: c.name ?? null,
        email: c.email ?? null,
        document: c.document ?? null,
        company: c.company ?? null,
        city: c.city ?? null,
        state: c.state ?? null,
        source: c.source,
        optOut: c.optOut,
        registered: Boolean(c.userId || c.firebaseUid),
        createdAt: c.createdAt,
        conversation: conv
          ? {
              id: String(conv._id),
              status: conv.status,
              stage: conv.stage,
              lastMessageAt: conv.lastMessageAt ?? null,
              unread: conv.unreadCount ?? 0,
            }
          : null,
        campaigns: campaignsByPhone.get(c.phone) ?? 0,
      };
    }),
    total,
    page,
    pageSize: PAGE,
  });
}
