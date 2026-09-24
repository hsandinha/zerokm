// Pipeline de atendimento: as conversas agrupadas por etapa, com o que o
// vendedor precisa ver no cartão (empresa, situação do cadastro, campanha).
//
// Cada coluna traz as mais recentes; o total real vem dos contadores — em base
// grande a coluna "abordado" teria milhares de cartões.

import { NextRequest, NextResponse } from "next/server";
import { requirePanelUser } from "@wa/lib/auth";
import dbConnect from "@/lib/mongodb";
import { WaContact, WaConversation } from "@wa/models/wa";
import { conversationCounts } from "@wa/lib/inbox";
import { setConversationStage } from "@wa/lib/conversation-stage";
import { daysAgoIso, startOfMonthIso } from "@wa/lib/dates";
import { OPEN_STAGES, STAGES, STALLED_DAYS, isStage } from "@wa/lib/stages";

export const dynamic = "force-dynamic";

const PER_COLUMN: Record<string, number> = { abordado: 30, perdido: 40 };

export async function GET() {
  try {
    await requirePanelUser();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  await dbConnect();
  const stalledCutoff = new Date(daysAgoIso(STALLED_DAYS));
  const month = new Date(startOfMonthIso());

  const [columns, counts, stalled, wonMonth] = await Promise.all([
    Promise.all(
      STAGES.map((s) =>
        WaConversation.find({ stage: s.id })
          .sort({ stageChangedAt: -1 })
          .limit(PER_COLUMN[s.id] ?? 80)
          .lean(),
      ),
    ),
    conversationCounts(null),
    WaConversation.countDocuments({
      stage: { $in: OPEN_STAGES },
      lastMessageAt: { $lt: stalledCutoff },
    }),
    WaConversation.countDocuments({ stage: "ganho", stageChangedAt: { $gte: month } }),
  ]);

  const rows = columns.flat();
  const contacts = await WaContact.find({ _id: { $in: rows.map((r) => r.contactId) } }).lean();
  const byId = new Map(contacts.map((c) => [String(c._id), c]));

  const items = rows.map((row) => {
    const contact = byId.get(String(row.contactId));
    return {
      id: String(row._id),
      stage: row.stage,
      status: row.status,
      outcome: row.outcome ?? null,
      transferReason: row.transferReason ?? null,
      lastMessageAt: row.lastMessageAt ?? null,
      lastInboundAt: row.lastInboundAt ?? null,
      stageChangedAt: row.stageChangedAt,
      assignedTo: row.assignedTo ?? null,
      campaignId: row.campaignId ? String(row.campaignId) : null,
      unread: row.unreadCount ?? 0,
      preview: row.lastMessagePreview ?? null,
      name: contact?.name ?? null,
      phone: contact?.phone ?? "",
      company: contact?.company ?? null,
      city: contact?.city ?? null,
      state: contact?.state ?? null,
      document: contact?.document ?? null,
      registered: Boolean(contact?.userId || contact?.firebaseUid),
      stalled:
        OPEN_STAGES.includes(row.stage) &&
        row.lastMessageAt != null &&
        new Date(row.lastMessageAt) < stalledCutoff,
    };
  });

  const open = OPEN_STAGES.reduce((acc, s) => acc + (counts.stages[s] ?? 0), 0);

  return NextResponse.json({
    items,
    stageCounts: counts.stages,
    kpis: { open, stalled, wonMonth },
    perColumn: STAGES.reduce<Record<string, number>>((acc, s) => {
      acc[s.id] = PER_COLUMN[s.id] ?? 80;
      return acc;
    }, {}),
  });
}

/** Movimento manual do kanban — o único jeito de marcar "assinante" à mão. */
export async function PATCH(req: NextRequest) {
  let user;
  try {
    user = await requirePanelUser();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { id?: string; stage?: string };
  if (!body.id || !isStage(body.stage)) {
    return NextResponse.json({ error: "id/etapa inválidos" }, { status: 400 });
  }

  try {
    await setConversationStage(body.id, body.stage, user.email);
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao mover" },
      { status },
    );
  }
  return NextResponse.json({ ok: true, stage: body.stage });
}
