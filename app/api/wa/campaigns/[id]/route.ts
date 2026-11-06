// Detalhe de uma campanha: contadores do funil, lista de destinatários com
// status e motivo da falha, e as ações de controle (iniciar, pausar, cancelar).

import { NextRequest, NextResponse } from "next/server";
import { requireScope, requireScopeAdmin, sameTenant, type Scope } from "@wa/lib/scope";
import dbConnect from "@/lib/mongodb";
import { WaCampaign, WaCampaignRecipient, WaConversation, WaFollowup } from "@wa/models/wa";
import { WaMidiaSaida } from "@wa/models/midia";
import { describeWindow, isWithinSendWindow } from "@wa/lib/send-window";
import { startOfDayIso } from "@wa/lib/dates";
import { encerrarEnviosInterrompidos } from "@wa/lib/campaign-queue";

const MAX_LISTA = 300;

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  let scope: Scope;
  try {
    scope = await requireScope("campanhas");
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  await dbConnect();

  const c = await WaCampaign.findById(id).lean();
  if (!c || !sameTenant(scope, c)) return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });

  // O worker só roda campanha ativa: numa pausada ou cancelada, o que ficou
  // no meio de uma rodada que caiu é encerrado aqui, para não ficar "Enviando".
  if (!["running", "scheduled"].includes(c.status)) {
    await encerrarEnviosInterrompidos(c._id);
  }

  const filtro = req.nextUrl.searchParams.get("status");
  const query: Record<string, unknown> = { campaignId: c._id };
  if (filtro && filtro !== "todos") query.status = filtro;

  // "Por que não chegou": os motivos de TODAS as falhas (e dos pulados), não
  // só dos 300 da lista. A tela junta os códigos da Meta pelo significado.
  const motivosDe = (status: string) =>
    WaCampaignRecipient.aggregate<{ _id: string | null; n: number }>([
      { $match: { campaignId: c._id, status } },
      { $group: { _id: "$error", n: { $sum: 1 } } },
      { $sort: { n: -1 } },
      { $limit: 50 },
    ]);

  const [porStatus, recipients, totalNoFiltro, enviadosHoje, motivosFalha, motivosPulados] = await Promise.all([
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
    motivosDe("failed"),
    motivosDe("skipped"),
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
      lastError: c.lastError ?? null,
      fontes: c.fontes ?? null,
      filters: c.filters ?? null,
      headerMedia: c.headerMedia ? { tipo: c.headerMedia.tipo, filename: c.headerMedia.filename ?? null } : null,
      templateHeaderText: c.templateHeaderText ?? null,
    },
    motivos: {
      falhas: motivosFalha.map((m) => ({ motivo: m._id ?? "sem motivo informado", n: m.n })),
      pulados: motivosPulados.map((m) => ({ motivo: m._id ?? "sem motivo informado", n: m.n })),
    },
    counts: {
      pending: counts.pending ?? 0,
      sending: counts.sending ?? 0,
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
  let scope: Scope;
  try {
    scope = await requireScopeAdmin("campanhas");
  } catch (err) {
    const status = (err as { status?: number }).status ?? 403;
    return NextResponse.json({ error: "Acesso restrito a administradores" }, { status });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { action?: string };

  await dbConnect();
  const campaign = await WaCampaign.findById(id);
  if (!campaign || !sameTenant(scope, campaign)) return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });
  if (campaign.status === "completed" || campaign.status === "cancelled") {
    return NextResponse.json({ error: `Campanha já ${campaign.status}` }, { status: 400 });
  }

  switch (body.action) {
    case "iniciar":
      campaign.status =
        campaign.scheduledAt && campaign.scheduledAt.getTime() > Date.now()
          ? "scheduled"
          : "running";
      // O motivo da última pausa automática deixa de valer: se ainda for
      // verdade, o worker pausa de novo e grava outra vez.
      campaign.lastError = null;
      break;
    case "pausar":
      campaign.status = "paused";
      break;
    case "retomar":
      campaign.status = "running";
      campaign.lastError = null;
      break;
    case "cancelar": {
      campaign.status = "cancelled";
      const restantes = await WaCampaignRecipient.updateMany(
        { campaignId: campaign._id, status: "pending" },
        { status: "skipped", error: "campanha cancelada" },
      );
      // $inc, não soma em memória: o worker pode estar contando pulados
      // (opt-out, repetido) agora, e o save gravaria um valor velho por cima.
      // O save abaixo só grava o status, que é o único campo alterado aqui.
      if (restantes.modifiedCount > 0) {
        await WaCampaign.updateOne({ _id: campaign._id }, { $inc: { skipped: restantes.modifiedCount } });
      }
      // Cancelar é definitivo: quem já recebeu o 1º toque não recebe os próximos.
      await WaFollowup.updateMany({ campaignId: campaign._id, status: "pending" }, { status: "cancelled" });
      break;
    }
    default:
      return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  }

  await campaign.save();
  return NextResponse.json({ ok: true, status: campaign.status });
}

/** Campanhas que podem ser apagadas: as que não estão (nem vão estar) enviando. */
const APAGAVEIS = ["draft", "completed", "cancelled", "failed"];

/**
 * Apaga a campanha e os destinatários dela. Só rascunho, concluída, cancelada
 * ou com falha: apagar uma que está enviando deixaria o worker sem saber o que
 * já saiu. A cadência que ainda esperava é cancelada (sem a campanha, o
 * follow-up sairia sem janela de horário).
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  let scope: Scope;
  try {
    scope = await requireScopeAdmin("campanhas");
  } catch (err) {
    const status = (err as { status?: number }).status ?? 403;
    return NextResponse.json({ error: "Acesso restrito a gestores" }, { status });
  }

  const { id } = await params;
  await dbConnect();
  const campaign = await WaCampaign.findById(id);
  if (!campaign || !sameTenant(scope, campaign)) {
    return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });
  }
  if (!APAGAVEIS.includes(campaign.status)) {
    return NextResponse.json(
      { error: "Pause e cancele a campanha antes de apagar: ela ainda pode enviar." },
      { status: 400 },
    );
  }

  await WaFollowup.updateMany({ campaignId: campaign._id, status: "pending" }, { status: "cancelled" });
  await WaCampaignRecipient.deleteMany({ campaignId: campaign._id });
  await WaConversation.updateMany({ campaignId: campaign._id }, { $unset: { campaignId: "" } });
  if (campaign.headerMedia?.midiaId) {
    await WaMidiaSaida.deleteOne({ _id: campaign.headerMedia.midiaId, tenantId: scope.tenantId }).catch(() => {});
  }
  await campaign.deleteOne();
  return NextResponse.json({ ok: true });
}
