// Pipeline de atendimento: as conversas agrupadas pelas colunas do funil do
// dono (wa/lib/funil.ts), com o que o vendedor precisa ver no cartão.
//
// Cada coluna traz as mais recentes; o total real vem dos contadores. Em base
// grande a coluna "abordado" teria milhares de cartões.

import { NextRequest, NextResponse } from "next/server";
import { requireScope, sameTenant, scopeError, type Scope } from "@wa/lib/scope";
import dbConnect from "@/lib/mongodb";
import { WaContact, WaConversation } from "@wa/models/wa";
import { moverParaColuna } from "@wa/lib/conversation-stage";
import { daysAgoIso, startOfMonthIso } from "@wa/lib/dates";
import { OPEN_STAGES, STALLED_DAYS, type Stage } from "@wa/lib/stages";
import {
  FunilError,
  colunasDo,
  contarPorColuna,
  faltamColunasPadrao,
  filtroDaColuna,
  filtroSemColuna,
} from "@wa/lib/funil";

export const dynamic = "force-dynamic";

/** Cartões por coluna: abordado e perdido enchem rápido e importam menos. */
function porColuna(systemKey: Stage | null): number {
  if (systemKey === "abordado") return 30;
  if (systemKey === "perdido") return 40;
  return 80;
}

export async function GET() {
  let scope: Scope;
  try {
    scope = await requireScope("funil");
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }

  await dbConnect();
  const tenantId = scope.tenantId;
  const colunas = await colunasDo(tenantId);
  const semColuna = filtroSemColuna(colunas);
  const stalledCutoff = new Date(daysAgoIso(STALLED_DAYS));
  const month = new Date(startOfMonthIso());

  const [porCol, orfas, contagem, open, stalled, wonMonth] = await Promise.all([
    Promise.all(
      colunas.map((c) =>
        WaConversation.find({ tenantId, ...filtroDaColuna(c, colunas) })
          .sort({ stageChangedAt: -1 })
          .limit(porColuna(c.systemKey))
          .lean(),
      ),
    ),
    semColuna
      ? WaConversation.find({ tenantId, ...semColuna }).sort({ stageChangedAt: -1 }).limit(80).lean()
      : Promise.resolve([]),
    contarPorColuna(tenantId, colunas),
    WaConversation.countDocuments({ tenantId, stage: { $in: OPEN_STAGES } }),
    WaConversation.countDocuments({
      tenantId,
      stage: { $in: OPEN_STAGES },
      lastMessageAt: { $lt: stalledCutoff },
    }),
    WaConversation.countDocuments({ tenantId, stage: "ganho", stageChangedAt: { $gte: month } }),
  ]);

  const linhas = [
    ...porCol.flatMap((rows, i) => rows.map((row) => ({ row, colunaId: colunas[i].id }))),
    ...orfas.map((row) => ({ row, colunaId: "sem" })),
  ];
  const contacts = await WaContact.find({ _id: { $in: linhas.map((l) => l.row.contactId) } }).lean();
  const byId = new Map(contacts.map((c) => [String(c._id), c]));

  const items = linhas.map(({ row, colunaId }) => {
    const contact = byId.get(String(row.contactId));
    return {
      id: String(row._id),
      colunaId,
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

  return NextResponse.json({
    colunas,
    podeEditar: scope.role === "admin",
    faltamPadrao: faltamColunasPadrao(colunas),
    items,
    contagem,
    kpis: { open, stalled, wonMonth },
    perColumn: Object.fromEntries(colunas.map((c) => [c.id, porColuna(c.systemKey)])),
  });
}

/** Movimento manual do quadro: põe o cartão numa coluna. */
export async function PATCH(req: NextRequest) {
  let user: Scope;
  try {
    user = await requireScope("funil");
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }

  const body = (await req.json().catch(() => ({}))) as { id?: string; colunaId?: string };
  if (!body.id || !body.colunaId) {
    return NextResponse.json({ error: "id/coluna inválidos" }, { status: 400 });
  }

  await dbConnect();
  const own = await WaConversation.findById(body.id).select("tenantId").lean().catch(() => null);
  if (!own || !sameTenant(user, own)) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }
  try {
    const { stage } = await moverParaColuna(body.id, body.colunaId, user.email);
    return NextResponse.json({ ok: true, stage });
  } catch (err) {
    const status = err instanceof FunilError ? err.status : (err as { status?: number }).status ?? 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Falha ao mover" }, { status });
  }
}
