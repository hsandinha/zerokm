// API pública — conversas.
//   GET /api/v1/conversations?status=&stage=&since=&limit=

import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@wa/lib/api-keys";
import dbConnect from "@/lib/mongodb";
import { WaContact, WaConversation } from "@wa/models/wa";
import { apiError, clampLimit } from "@wa/lib/public-api";
import { isStage } from "@wa/lib/stages";

const STATUSES = new Set(["ai_active", "waiting_human", "human_active", "closed"]);

export async function GET(req: NextRequest) {
  try {
    await requireApiKey(req);
    const sp = req.nextUrl.searchParams;

    await dbConnect();
    const query: Record<string, unknown> = {};
    const status = sp.get("status");
    if (status && STATUSES.has(status)) query.status = status;
    const stage = sp.get("stage");
    if (stage && isStage(stage)) query.stage = stage;
    const since = sp.get("since");
    if (since && !Number.isNaN(Date.parse(since))) {
      query.lastMessageAt = { $gte: new Date(since) };
    }

    const conversations = await WaConversation.find(query)
      .sort({ lastMessageAt: -1 })
      .limit(clampLimit(sp.get("limit")))
      .lean();
    const contacts = await WaContact.find({
      _id: { $in: conversations.map((c) => c.contactId) },
    })
      .select("phone name company")
      .lean();
    const byId = new Map(contacts.map((c) => [String(c._id), c]));

    return NextResponse.json({
      conversations: conversations.map((c) => {
        const contact = byId.get(String(c.contactId));
        return {
          id: String(c._id),
          status: c.status,
          stage: c.stage,
          outcome: c.outcome ?? null,
          transferReason: c.transferReason ?? null,
          assignedTo: c.assignedTo ?? null,
          campaignId: c.campaignId ? String(c.campaignId) : null,
          lastMessageAt: c.lastMessageAt ?? null,
          lastInboundAt: c.lastInboundAt ?? null,
          preview: c.lastMessagePreview ?? null,
          createdAt: c.createdAt,
          contact: contact
            ? {
                id: String(contact._id),
                phone: contact.phone,
                name: contact.name ?? null,
                company: contact.company ?? null,
              }
            : null,
        };
      }),
    });
  } catch (err) {
    return apiError(err);
  }
}
