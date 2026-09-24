// API pública — contatos.
//   GET  /api/v1/contacts?q=&limit=      lista/busca
//   POST /api/v1/contacts { phone, name, company, email }

import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@wa/lib/api-keys";
import dbConnect from "@/lib/mongodb";
import { WaContact, WaConversation } from "@wa/models/wa";
import { WaTarget } from "@wa/models/base";
import { parsePhoneBr } from "@wa/lib/phone";
import { apiError, clampLimit } from "@wa/lib/public-api";

export async function GET(req: NextRequest) {
  try {
    await requireApiKey(req);
    const sp = req.nextUrl.searchParams;
    const q = (sp.get("q") ?? "").replace(/[,()]/g, " ").trim();

    await dbConnect();
    const query: Record<string, unknown> = {};
    if (q) {
      const digits = q.replace(/\D/g, "");
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      const or: Record<string, unknown>[] = [{ name: rx }, { company: rx }, { email: rx }];
      if (digits.length >= 4) or.push({ phone: new RegExp(digits) });
      query.$or = or;
    }

    const contacts = await WaContact.find(query)
      .sort({ createdAt: -1 })
      .limit(clampLimit(sp.get("limit")))
      .lean();
    const conversations = await WaConversation.find({
      contactId: { $in: contacts.map((c) => c._id) },
    })
      .select("contactId status stage")
      .lean();
    const convByContact = new Map(conversations.map((c) => [String(c.contactId), c]));

    return NextResponse.json({
      contacts: contacts.map((c) => {
        const conv = convByContact.get(String(c._id));
        return {
          id: String(c._id),
          phone: c.phone,
          name: c.name ?? null,
          email: c.email ?? null,
          company: c.company ?? null,
          city: c.city ?? null,
          state: c.state ?? null,
          document: c.document ?? null,
          optOut: c.optOut,
          registered: Boolean(c.userId || c.firebaseUid),
          source: c.source,
          createdAt: c.createdAt,
          conversation: conv
            ? { id: String(conv._id), status: conv.status, stage: conv.stage }
            : null,
        };
      }),
    });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await requireApiKey(req);
    const body = (await req.json().catch(() => ({}))) as {
      phone?: string;
      name?: string;
      company?: string;
      email?: string;
    };
    const parsed = parsePhoneBr(body.phone);
    if (!parsed.valid || !parsed.e164) {
      return NextResponse.json(
        { error: `Telefone inválido${parsed.reason ? ` (${parsed.reason})` : ""}` },
        { status: 400 },
      );
    }

    await dbConnect();
    const existing = await WaContact.findOne({ phone: parsed.e164 }).select("_id").lean();
    if (existing) {
      return NextResponse.json({ id: String(existing._id), phone: parsed.e164, created: false });
    }

    const target = await WaTarget.findOne({ phone: parsed.e164 }).select("_id").lean();
    const created = await WaContact.create({
      phone: parsed.e164,
      name: body.name?.trim() || undefined,
      company: body.company?.trim() || undefined,
      email: body.email?.trim().toLowerCase() || undefined,
      source: "manual",
      targetId: target?._id,
    });
    console.info(`[api/v1] ${caller.name} criou contato ${parsed.e164}`);
    return NextResponse.json(
      { id: String(created._id), phone: parsed.e164, created: true },
      { status: 201 },
    );
  } catch (err) {
    return apiError(err);
  }
}
