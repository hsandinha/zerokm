// Campanhas: lista e criação a partir da base, de uma lista avulsa ou dos
// sócios encontrados na Procob.
//
// A regra que não pode quebrar: UM telefone recebe UMA mensagem. E nada sai
// com variável vazia — a Meta recusa a mensagem inteira nesse caso, e só se
// descobriria com a campanha já rodando.

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requirePanelUser } from "@wa/lib/auth";
import dbConnect from "@/lib/mongodb";
import { WaCampaign, WaCampaignRecipient, WaContact } from "@wa/models/wa";
import { WaPartner, WaTarget } from "@wa/models/base";
import { parsePhoneBr } from "@wa/lib/phone";
import { getWabaCredentials } from "@wa/lib/settings";
import { listTemplates, templateVariables } from "@wa/lib/meta";
import {
  defaultParamMap,
  emptyParamPositions,
  resolveParams,
  type ParamMapItem,
} from "@wa/lib/campaign-params";

export const maxDuration = 60;

export async function GET() {
  try {
    // Leitura dos números liberada para o operador; criar e disparar, não.
    await requirePanelUser();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  await dbConnect();
  const campaigns = await WaCampaign.find().sort({ createdAt: -1 }).limit(100).lean();
  return NextResponse.json({
    campaigns: campaigns.map((c) => ({
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
      dailyLimit: c.dailyLimit,
      throttleSeconds: c.throttleSeconds,
      followupTemplates: c.followupTemplates,
      followupDelaysHours: c.followupDelaysHours,
      total: c.total,
      sent: c.sent,
      delivered: c.delivered,
      read: c.read,
      failed: c.failed,
      replied: c.replied,
      skipped: c.skipped,
      createdAt: c.createdAt,
    })),
  });
}

type Linha = {
  phone: string;
  name: string | null;
  params: string[];
  targetId?: string | null;
  partnerId?: string | null;
  attempt?: number;
};

/** Telefones que pediram para sair — conferidos em bloco antes de montar a fila. */
async function optedOutSet(phones: string[]): Promise<Set<string>> {
  if (phones.length === 0) return new Set();
  const rows = await WaContact.find({ phone: { $in: phones }, optOut: true })
    .select("phone")
    .lean();
  return new Set(rows.map((r) => r.phone));
}

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireAdmin();
  } catch (err) {
    const status = (err as { status?: number }).status ?? 403;
    return NextResponse.json({ error: "Acesso restrito a administradores" }, { status });
  }

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    templateName?: string;
    templateLanguage?: string;
    paramsMap?: ParamMapItem[];
    followupTemplates?: string[];
    followupDelaysHours?: number[];
    source?: "cnpja" | "csv" | "manual" | "targets" | "pessoa";
    filters?: { cnae?: string; uf?: string; city?: string };
    targetIds?: string[];
    /** Lista avulsa (CNPJá ou CSV) já resolvida na tela. */
    recipients?: Array<{
      phone: string;
      name?: string | null;
      company?: string | null;
      city?: string | null;
      state?: string | null;
    }>;
    /** Audiência por PESSOA: cada sócio com os celulares a tentar. */
    partners?: Array<{ partnerId: string; phones: string[] }>;
    limit?: number;
    start?: boolean;
    scheduledAt?: string | null;
    sendStart?: string;
    sendEnd?: string;
    sendDays?: number[];
    dailyLimit?: number;
    throttleSeconds?: number;
    timezone?: string;
    importId?: string;
  };

  if (!body.name?.trim()) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });
  if (!body.templateName?.trim()) {
    return NextResponse.json({ error: "Template obrigatório" }, { status: 400 });
  }

  await dbConnect();

  // O template manda no número de variáveis. Sem conferir isto, o disparo
  // falharia na Meta em 100% das mensagens ("number of parameters does not
  // match") — com a campanha já rodando.
  const creds = await getWabaCredentials();
  if (!creds?.wabaId) {
    return NextResponse.json(
      { error: "WABA não configurado — preencha em IA & WABA." },
      { status: 400 },
    );
  }

  let variableCount = 0;
  let templateCategory = "MARKETING";
  let templateBody = "";
  try {
    const templates = await listTemplates(creds);
    const chosen = templates.find((t) => t.name === body.templateName?.trim());
    if (!chosen) {
      return NextResponse.json(
        { error: `Template "${body.templateName}" não existe neste WABA.` },
        { status: 400 },
      );
    }
    if (chosen.status !== "APPROVED") {
      return NextResponse.json(
        {
          error: `O template "${chosen.name}" está ${chosen.status} — só APPROVED pode ser disparado.`,
        },
        { status: 400 },
      );
    }
    templateCategory = chosen.category ?? "MARKETING";
    templateBody = chosen.components?.find((c) => c.type === "BODY")?.text ?? "";
    variableCount = templateVariables(templateBody).length;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao conferir o template na Meta" },
      { status: 400 },
    );
  }

  const paramsMap: ParamMapItem[] = (body.paramsMap ?? []).slice(0, variableCount);
  while (paramsMap.length < variableCount) {
    paramsMap.push(defaultParamMap(variableCount)[paramsMap.length]);
  }

  const porTelefone = new Map<string, Linha>();
  let skippedOptOut = 0;
  let descartadosAntes = 0;
  let source: NonNullable<typeof body.source> = body.source ?? "manual";

  // ── Por pessoa (sócios da Procob) ───────────────────────────
  // A unidade aqui é a PESSOA: o bureau devolve vários celulares e não diz
  // qual está ativo, então a campanha tenta os escolhidos. Os números da mesma
  // pessoa ficam ligados pelo partnerId — quando um responde, o inbound
  // cancela os outros que ainda não saíram.
  if (body.partners?.length) {
    source = "pessoa";
    const partnerIds = body.partners.map((p) => p.partnerId);
    const [partnerRows, targetRows] = await Promise.all([
      WaPartner.find({ _id: { $in: partnerIds } })
        .select("name taxId deceased")
        .lean(),
      WaTarget.find({ partnerId: { $in: partnerIds }, status: { $ne: "suppressed" } })
        .sort({ priority: -1 })
        .lean(),
    ]);
    const partnerById = new Map(partnerRows.map((p) => [String(p._id), p]));
    const targetByPartner = new Map<string, (typeof targetRows)[number]>();
    for (const t of targetRows) {
      const key = String(t.partnerId);
      if (!targetByPartner.has(key)) targetByPartner.set(key, t);
    }

    const todosFones = body.partners.flatMap((p) =>
      p.phones.map((x) => parsePhoneBr(x).e164).filter((x): x is string => Boolean(x)),
    );
    const optOut = await optedOutSet(todosFones);

    for (const entry of body.partners) {
      const partner = partnerById.get(entry.partnerId);
      // Sócio falecido nunca entra: o telefone costuma ser de um familiar.
      if (!partner || partner.deceased) continue;
      const target = targetByPartner.get(entry.partnerId) ?? null;
      let attempt = 0;
      for (const raw of entry.phones) {
        const parsed = parsePhoneBr(raw);
        if (!parsed.valid || !parsed.e164 || parsed.kind !== "movel") continue;
        if (optOut.has(parsed.e164)) {
          skippedOptOut++;
          continue;
        }
        if (porTelefone.has(parsed.e164)) continue;
        attempt++;
        porTelefone.set(parsed.e164, {
          phone: parsed.e164,
          name: partner.name ?? null,
          partnerId: entry.partnerId,
          targetId: target ? String(target._id) : null,
          attempt,
          params: resolveParams(paramsMap, {
            phone: parsed.e164,
            contactName: partner.name ?? null,
            company: target?.legalName ?? null,
            city: target?.city ?? null,
            state: target?.state ?? null,
          }),
        });
      }
    }
  } else if (body.recipients?.length) {
    // ── Lista avulsa (prévia do CNPJá ou CSV) ─────────────────
    source = body.source === "cnpja" ? "cnpja" : "csv";
    const fones = body.recipients
      .map((r) => parsePhoneBr(r.phone).e164)
      .filter((x): x is string => Boolean(x));
    const optOut = await optedOutSet(fones);

    for (const r of body.recipients) {
      const parsed = parsePhoneBr(r.phone);
      if (!parsed.valid || !parsed.e164) {
        descartadosAntes++;
        continue;
      }
      if (optOut.has(parsed.e164)) {
        skippedOptOut++;
        continue;
      }
      if (porTelefone.has(parsed.e164)) continue;
      porTelefone.set(parsed.e164, {
        phone: parsed.e164,
        name: r.name ?? null,
        params: resolveParams(paramsMap, {
          phone: parsed.e164,
          contactName: r.name ?? null,
          company: r.company ?? null,
          city: r.city ?? null,
          state: r.state ?? null,
        }),
      });
    }
  } else {
    // ── Base de empresas (wa_targets prontas) ─────────────────
    source = "targets";
    const query: Record<string, unknown> = {
      status: "ready",
      phone: { $ne: null },
    };
    if (body.targetIds?.length) query._id = { $in: body.targetIds };
    const targets = await WaTarget.find(query)
      .sort({ priority: -1 })
      .limit(Math.min(body.limit ?? 1000, 5000))
      .lean();
    if (targets.length === 0) {
      return NextResponse.json({ error: "Nenhuma empresa pronta para disparo" }, { status: 400 });
    }

    const fones = targets
      .map((t) => parsePhoneBr(t.phone ?? "").e164)
      .filter((x): x is string => Boolean(x));
    const optOut = await optedOutSet(fones);

    for (const target of targets) {
      const parsed = parsePhoneBr(target.phone ?? "");
      if (!parsed.valid || !parsed.e164) {
        descartadosAntes++;
        continue;
      }
      if (optOut.has(parsed.e164)) {
        skippedOptOut++;
        continue;
      }
      // Dedupe por telefone: fica a empresa de maior prioridade (a lista já
      // vem ordenada, então a primeira ocorrência vence).
      if (porTelefone.has(parsed.e164)) continue;
      porTelefone.set(parsed.e164, {
        phone: parsed.e164,
        name: target.contactName ?? target.legalName ?? null,
        targetId: String(target._id),
        params: resolveParams(paramsMap, {
          phone: parsed.e164,
          contactName: target.contactName ?? null,
          company: target.legalName ?? target.tradeName ?? null,
          city: target.city ?? null,
          state: target.state ?? null,
        }),
      });
    }
  }

  // Variável vazia faz a Meta recusar a mensagem inteira: quem ficaria com
  // buraco no texto não entra na fila.
  const linhas = [...porTelefone.values()].filter(
    (r) => emptyParamPositions(r.params).length === 0,
  );
  const skippedEmptyParam = porTelefone.size - linhas.length;
  if (linhas.length === 0) {
    return NextResponse.json(
      {
        error:
          "Nenhum destinatário ficou com todas as variáveis preenchidas. Revise o mapeamento — variável vazia faz a Meta recusar a mensagem.",
      },
      { status: 400 },
    );
  }

  const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
  const isFuture = scheduledAt != null && scheduledAt.getTime() > Date.now();
  const status = body.start ? (isFuture ? "scheduled" : "running") : "draft";
  const throttleSeconds = Math.min(Math.max(body.throttleSeconds ?? 4, 1), 60);

  const campaign = await WaCampaign.create({
    name: body.name.trim(),
    templateName: body.templateName.trim(),
    templateLanguage: body.templateLanguage?.trim() || "pt_BR",
    templateBody,
    templateCategory,
    status,
    source,
    filters: body.filters,
    paramsMap,
    throttlePerRun: Math.max(1, Math.round(60 / throttleSeconds)),
    throttleSeconds,
    dailyLimit: Math.max(0, body.dailyLimit ?? 0),
    scheduledAt,
    followupTemplates: body.followupTemplates ?? [],
    followupDelaysHours: body.followupDelaysHours ?? [48, 120],
    sendStart: body.sendStart || "09:00",
    sendEnd: body.sendEnd || "18:00",
    sendDays: body.sendDays?.length ? body.sendDays : [1, 2, 3, 4, 5],
    timezone: body.timezone || "America/Sao_Paulo",
    importId: body.importId,
    total: linhas.length,
    skipped: skippedOptOut + skippedEmptyParam + descartadosAntes,
    createdBy: user.email,
  });

  for (let i = 0; i < linhas.length; i += 500) {
    await WaCampaignRecipient.insertMany(
      linhas.slice(i, i + 500).map((r) => ({
        campaignId: campaign._id,
        phone: r.phone,
        name: r.name ?? undefined,
        params: r.params,
        targetId: r.targetId ?? undefined,
        partnerId: r.partnerId ?? undefined,
        attempt: r.attempt ?? 1,
      })),
    );
  }

  const targetIds = [...new Set(linhas.map((r) => r.targetId).filter(Boolean))] as string[];
  if (targetIds.length > 0) {
    await WaTarget.updateMany(
      { _id: { $in: targetIds }, status: { $in: ["new", "ready"] } },
      { status: "queued" },
    );
  }

  return NextResponse.json({
    campaignId: String(campaign._id),
    status,
    recipients: linhas.length,
    people: new Set(linhas.map((r) => r.partnerId ?? r.phone)).size,
    skippedOptOut,
    skippedEmptyParam,
    skippedInvalid: descartadosAntes,
    templateCategory,
    source,
  });
}
