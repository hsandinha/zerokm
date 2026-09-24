// Visão geral: o estado da operação agora, o funil dos últimos 30 dias e o
// que a IA fez sozinha. São contagens independentes, então saem em paralelo.

import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { requirePanelUser } from "@wa/lib/auth";
import dbConnect from "@/lib/mongodb";
import {
  WaCampaign,
  WaCampaignRecipient,
  WaContact,
  WaConversation,
  WaFollowup,
  WaMessage,
} from "@wa/models/wa";
import { WaTarget } from "@wa/models/base";
import Payment from "@/models/Payment";
import { conversationCounts } from "@wa/lib/inbox";
import { dayKey, daysAgoIso, startOfDayIso, startOfMonthIso, weekdayLabel } from "@wa/lib/dates";

export const dynamic = "force-dynamic";

/** Pagamentos de quem veio pelo WhatsApp. O recorte é a lista de usuários que
 *  a IA cadastrou (ou vinculou) — é o que separa o funil da IA do resto das
 *  vendas da zerokm. */
async function paymentsFromWhatsapp(userIds: string[], since: Date) {
  if (userIds.length === 0) return [];
  return Payment.aggregate<{ _id: string; n: number; total: number }>([
    { $match: { userId: { $in: userIds.map((id) => new mongoose.Types.ObjectId(id)) }, createdAt: { $gte: since } } },
    { $group: { _id: "$status", n: { $sum: 1 }, total: { $sum: "$amount" } } },
  ]);
}

export async function GET() {
  try {
    await requirePanelUser();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  await dbConnect();
  // Contatos que já viraram cadastro na zerokm — a ponte com os pagamentos.
  const registeredContacts = await WaContact.find({ userId: { $exists: true, $ne: null } })
    .select("userId")
    .lean();
  const userIds = registeredContacts
    .map((c) => c.userId)
    .filter((id): id is string => Boolean(id) && mongoose.isValidObjectId(id));

  const today = new Date(startOfDayIso());
  const yesterday = new Date(startOfDayIso(undefined, 1));
  const d7 = new Date(daysAgoIso(7));
  const d30 = new Date(daysAgoIso(30));
  const month = new Date(startOfMonthIso());

  const [
    counts,
    inboundToday,
    inboundYesterday,
    sent30,
    replied30,
    registered30,
    won30,
    lost30,
    aiReplies30,
    followupsSent30,
    inCadence,
    transfers30,
    targetsReady,
    activeCampaigns,
    closedToday,
    wonMonth,
    payments30,
    paymentsMonth,
    attention,
    weekMessages,
  ] = await Promise.all([
    conversationCounts(null),
    WaMessage.countDocuments({ direction: "inbound", createdAt: { $gte: today } }),
    WaMessage.countDocuments({
      direction: "inbound",
      createdAt: { $gte: yesterday, $lt: today },
    }),
    WaCampaignRecipient.countDocuments({ sentAt: { $gte: d30 } }),
    WaConversation.countDocuments({ lastInboundAt: { $gte: d30 } }),
    WaConversation.countDocuments({
      stage: { $in: ["cadastro", "pagamento", "ganho"] },
      stageChangedAt: { $gte: d30 },
    }),
    WaConversation.countDocuments({ stage: "ganho", stageChangedAt: { $gte: d30 } }),
    WaConversation.countDocuments({ stage: "perdido", stageChangedAt: { $gte: d30 } }),
    WaMessage.countDocuments({ sender: "ai", createdAt: { $gte: d30 } }),
    WaFollowup.countDocuments({ status: "sent", runAfter: { $gte: d30 } }),
    WaFollowup.countDocuments({ status: "pending" }),
    WaMessage.countDocuments({
      sender: "system",
      content: /^— Transferido/,
      createdAt: { $gte: d30 },
    }),
    WaTarget.countDocuments({ status: "ready" }),
    WaCampaign.countDocuments({ status: { $in: ["running", "scheduled"] } }),
    WaConversation.countDocuments({ status: "closed", updatedAt: { $gte: today } }),
    WaConversation.countDocuments({ stage: "ganho", stageChangedAt: { $gte: month } }),
    paymentsFromWhatsapp(userIds, d30),
    paymentsFromWhatsapp(userIds, month),
    WaConversation.find({ status: "waiting_human" })
      .sort({ waitingSince: 1 })
      .limit(6)
      .populate("contactId", "name phone")
      .lean(),
    WaMessage.find({ createdAt: { $gte: d7 } })
      .select("direction sender createdAt")
      .limit(10000)
      .lean(),
  ]);

  // Série dos últimos 7 dias: recebidas × respondidas pela IA.
  const week: Array<{ key: string; label: string; inbound: number; ai: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const iso = startOfDayIso(undefined, i);
    week.push({ key: dayKey(iso), label: weekdayLabel(iso), inbound: 0, ai: 0 });
  }
  const byKey = new Map(week.map((d) => [d.key, d]));
  for (const m of weekMessages) {
    const bucket = byKey.get(dayKey(new Date(m.createdAt).toISOString()));
    if (!bucket) continue;
    if (m.direction === "inbound") bucket.inbound++;
    else if (m.sender === "ai") bucket.ai++;
  }

  const soma = (rows: Array<{ _id: string; n: number; total: number }>, status?: string) =>
    rows
      .filter((r) => !status || r._id === status)
      .reduce((acc, r) => ({ n: acc.n + r.n, total: acc.total + (r.total ?? 0) }), {
        n: 0,
        total: 0,
      });

  return NextResponse.json({
    now: {
      total: counts.total,
      waiting: counts.waiting,
      ai: counts.ai,
      human: counts.human,
      closedToday,
      sla: counts.sla,
      stages: counts.stages,
    },
    today: { inbound: inboundToday, inboundYesterday },
    funnel: {
      sent: sent30,
      replied: replied30,
      registered: registered30,
      payments: soma(payments30).n,
      won: won30,
      lost: lost30,
    },
    ai: {
      replies: aiReplies30,
      followups: followupsSent30,
      inCadence,
      transfers: transfers30,
      registrations: registered30,
    },
    base: { targetsReady, activeCampaigns },
    month: {
      won: wonMonth,
      approved: soma(paymentsMonth, "approved").n,
      revenue: soma(paymentsMonth, "approved").total,
    },
    attention: attention.map((c) => {
      const contact = c.contactId as unknown as { name?: string; phone?: string } | null;
      return {
        id: String(c._id),
        reason: c.transferReason ?? null,
        waitingSince: c.waitingSince ?? null,
        stage: c.stage,
        preview: c.lastMessagePreview ?? null,
        assignedTo: c.assignedTo ?? null,
        name: contact?.name ?? null,
        phone: contact?.phone ?? "",
      };
    }),
    week,
  });
}
