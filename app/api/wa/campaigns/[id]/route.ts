// Detalhe de uma campanha: contadores do funil, lista de destinatários com
// status e motivo da falha, e as ações de controle (iniciar, pausar, cancelar).

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requirePanelUser } from "@wa/lib/auth";
import dbConnect from "@/lib/mongodb";
import { WaCampaign, WaCampaignRecipient } from "@wa/models/wa";
import { describeWindow, isWithinSendWindow } from "@wa/lib/send-window";
import { startOfDayIso } from "@wa/lib/dates";

const MAX_LISTA = 300;

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    await requirePanelUser();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  await dbConnect();

  const c = await WaCampaign.findById(id).lean();
  if (!c) return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });

  const filtro = req.nextUrl.searchParams.get("status");
  const query: Record<string, unknown> = { campaignId: c._id };
  if (filtro && filtro !== "todos") query.status = filtro;

  const [porStatus, recipients, totalNoFiltro, enviadosHoje] = await Promise.all([
    WaCampaignRecipient.aggregate<{ _id: string; n: number }>([
      { $match: { campaignId: c._id } },
      { $group: { _id: "$status", n: { $sum: 1 } } },
    ]),
    WaCampaignRecipient.find(query).sort({ sentAt: -1, _id: 1 }).limit(MAX_LISTA).lean(),
    WaCampaignRecipient.countDocuments(query),
    WaCampaignRecipient.countDocuments({
      campaignId: c._id,
      sentAt: { $gte: new Date(startOfDayIso(c.timezone)) },
    }),
  ]);

  const counts: Record<string, number> = {};
  for (const g of porStatus) counts[String(g._id)] = g.n;

  const window = {
    send_start: c.sendStart,
    send_end: c.sendEnd,
    send_days: c.sendDays,
    timezone: c.timezone,
  };

  return NextResponse.json({
    campaign: {
      id: String(c._id),
      name: c.name,
      templateName: c.templateName,
      templateLanguage: c.templateLanguage,
      templateBody: c.templateBody ?? null,
      templateCategory: c.templateCategory ?? null,
      status: c.status,
      source: c.source,
      filters: c.filters ?? null,
      scheduledAt: c.scheduledAt ?? null,
      sendStart: c.sendStart,
      sendEnd: c.sendEnd,
      sendDays: c.sendDays,
      timezone: c.timezone,
      windowLabel: describeWindow(window),
      windowOpenNow: isWithinSendWindow(window),
      dailyLimit: c.dailyLimit,
      sentToday: enviadosHoje,
      throttleSeconds: c.throttleSeconds,
      followupTemplates: c.followupTemplates,
      followupDelaysHours: c.followupDelaysHours,
      paramsMap: c.paramsMap ?? [],
      total: c.total,
      sent: c.sent,
      delivered: c.delivered,
      read: c.read,
      failed: c.failed,
      replied: c.replied,
      skipped: c.skipped,
      createdAt: c.createdAt,
      createdBy: c.createdBy ?? null,
    },
    counts: {
      pending: counts.pending ?? 0,
      sent: counts.sent ?? 0,
      delivered: counts.delivered ?? 0,
      read: counts.read ?? 0,
      failed: counts.failed ?? 0,
      replied: counts.replied ?? 0,
      skipped: counts.skipped ?? 0,
    },
    recipients: recipients.map((r) => ({
      id: String(r._id),
      name: r.name ?? null,
      phone: r.phone,
      status: r.status,
      attempt: r.attempt,
      sentAt: r.sentAt ?? null,
      error: r.error ?? null,
      conversationId: r.conversationId ? String(r.conversationId) : null,
    })),
    exibidos: recipients.length,
    totalNoFiltro,
  });
}

/** Controle do disparo. Cancelar é definitivo: o que não saiu não sai mais. */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await requireAdmin();
  } catch (err) {
    const status = (err as { status?: number }).status ?? 403;
    return NextResponse.json({ error: "Acesso restrito a administradores" }, { status });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { action?: string };

  await dbConnect();
  const campaign = await WaCampaign.findById(id);
  if (!campaign) return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });
  if (campaign.status === "completed" || campaign.status === "cancelled") {
    return NextResponse.json({ error: `Campanha já ${campaign.status}` }, { status: 400 });
  }

  switch (body.action) {
    case "iniciar":
      campaign.status =
        campaign.scheduledAt && campaign.scheduledAt.getTime() > Date.now()
          ? "scheduled"
          : "running";
      break;
    case "pausar":
      campaign.status = "paused";
      break;
    case "retomar":
      campaign.status = "running";
      break;
    case "cancelar": {
      campaign.status = "cancelled";
      const restantes = await WaCampaignRecipient.updateMany(
        { campaignId: campaign._id, status: "pending" },
        { status: "skipped", error: "campanha cancelada" },
      );
      campaign.skipped += restantes.modifiedCount;
      break;
    }
    default:
      return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  }

  await campaign.save();
  return NextResponse.json({ ok: true, status: campaign.status });
}
