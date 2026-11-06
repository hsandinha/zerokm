// Campanhas: lista e criação.
//
// Fontes de público:
//   - Loja: os contatos dela, uma coluna do funil, uma lista colada e um CSV
//     (somados). Contatos e coluna são resolvidos AQUI pelo tenantId.
//   - CNV: além dessas, a prospecção (CNPJá, base de empresas, sócios da
//     Procob). Loja nunca cai nesses caminhos: a base é do CNV.
//
// A regra que não pode quebrar: UM telefone recebe UMA mensagem. E nada sai
// com variável vazia — a Meta recusa a mensagem inteira nesse caso, e só se
// descobriria com a campanha já rodando. Por isso cada destinatário é
// conferido aqui, e quem fica de fora entra na campanha como "pulado" com o
// motivo (a revisão mostra os números antes de criar, com `dryRun`).

import { NextRequest, NextResponse } from "next/server";
import { podeUsar, requireScope, requireScopeAdmin, type Scope } from "@wa/lib/scope";
import dbConnect from "@/lib/mongodb";
import {
  FONTES_DA_LOJA,
  WaCampaign,
  WaCampaignRecipient,
  WaContact,
  type WaCampaignSource,
  type WaHeaderMedia,
} from "@wa/models/wa";
import { WaPartner, WaTarget } from "@wa/models/base";
import { parsePhoneBr } from "@wa/lib/phone";
import { wabaCredentialsOf } from "@wa/lib/channels";
import { formaDoTemplate, headerDeMidia, listTemplates, podeUsarTemplates, tipoDoHeader } from "@wa/lib/meta";
import {
  emptyParamPositions,
  fallbacksDe,
  resolveParam,
  resolveParams,
  sanitizeParamMap,
  type ParamMapItem,
  type RecipientRow,
} from "@wa/lib/campaign-params";
import { midiaDoDono, tipoDaMidia } from "@wa/lib/midia-saida";
import { contatosDaColuna, contatosDaLoja } from "@wa/lib/campaign-audience";
import { FunilError } from "@wa/lib/funil";
import { MAX_PUBLICO, juntarPublico, type PessoaDoPublico } from "@wa/lib/audience/publico";
import { nomeDaMidiaDoHeader } from "@wa/lib/template-envio";

export const maxDuration = 60;

export async function GET() {
  let scope: Scope;
  try {
    // Leitura dos números liberada para o operador; criar e disparar, não.
    scope = await requireScope("campanhas");
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  await dbConnect();
  const campaigns = await WaCampaign.find({ tenantId: scope.tenantId })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
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
      fontes: c.fontes ?? null,
      lastError: c.lastError ?? null,
      headerMedia: c.headerMedia ? { tipo: c.headerMedia.tipo, filename: c.headerMedia.filename ?? null } : null,
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

/** Linha da tela (CSV, lista colada, prévia do CNPJá). */
type LinhaDaTela = {
  phone: string;
  name?: string | null;
  company?: string | null;
  city?: string | null;
  state?: string | null;
  var1?: string | null;
  var2?: string | null;
  var3?: string | null;
};

/** Quem a campanha tenta, antes da conferência de opt-out e variáveis. */
type Candidato = RecipientRow & {
  name: string | null;
  targetId?: string | null;
  partnerId?: string | null;
  attempt?: number;
};

type Pulado = { phone: string; name: string | null; motivo: string };

/** Telefones que pediram para sair — conferidos em bloco antes de montar a fila. */
async function optedOutSet(phones: string[], tenantId: string | null): Promise<Set<string>> {
  if (phones.length === 0) return new Set();
  // Opt-out é por loja: quem pediu para a loja parar não pediu para o CNV.
  const rows = await WaContact.find({ tenantId, phone: { $in: phones }, optOut: true })
    .select("phone")
    .lean();
  return new Set(rows.map((r) => r.phone));
}

function texto(v: unknown, max = 200): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

/**
 * Linha da tela saneada, com o telefone validado. Fixo fica de fora na lista
 * da loja (o cliente final usa celular). Na prospecção do CNV, não: o
 * telefone da Receita costuma ser fixo e muita empresa usa o WhatsApp
 * Business nele, como o ramo da base de empresas já aceitava.
 */
function daTela(
  r: LinhaDaTela,
  origem: "csv" | "colar",
  aceitaFixo = false,
): PessoaDoPublico | { invalido: string } {
  if (!r || typeof r !== "object") return { invalido: "" };
  const parsed = parsePhoneBr(typeof r?.phone === "string" ? r.phone : "");
  if (!parsed.valid || !parsed.e164 || (parsed.kind === "fixo" && !aceitaFixo)) {
    return { invalido: String(r?.phone ?? "").slice(0, 40) };
  }
  return {
    phone: parsed.e164,
    name: texto(r.name),
    company: texto(r.company),
    city: texto(r.city),
    state: texto(r.state, 2),
    var1: texto(r.var1),
    var2: texto(r.var2),
    var3: texto(r.var3),
    origem,
  };
}

type Body = {
  name?: string;
  templateName?: string;
  templateLanguage?: string;
  paramsMap?: ParamMapItem[];
  /** Cabeçalho de texto com {{1}}: de onde vem o valor. */
  headerParamsMap?: ParamMapItem[];
  /** Botões de link dinâmico: o índice do botão e de onde vem o final da URL. */
  buttonParamsMap?: Array<ParamMapItem & { index: number }>;
  /** Arquivo do cabeçalho de mídia (POST /api/wa/campaigns/midia). */
  headerMedia?: { midiaId?: string } | null;
  followupTemplates?: string[];
  followupDelaysHours?: number[];
  source?: WaCampaignSource;
  filters?: { cnae?: string; uf?: string; city?: string };
  targetIds?: string[];
  /** Lista avulsa já resolvida na tela (prévia do CNPJá, CSV do CNV). */
  recipients?: LinhaDaTela[];
  /** Audiência por PESSOA: cada sócio com os celulares a tentar. */
  partners?: Array<{ partnerId: string; phones: string[] }>;
  /** Público somado (loja e CNV): contatos e coluna resolvidos aqui. */
  publico?: {
    contatos?: { janela24h?: boolean; origem?: string | null } | null;
    coluna?: { id?: string } | null;
    colados?: LinhaDaTela[];
    csv?: LinhaDaTela[];
    /** Telefones desmarcados na lista da tela. */
    excluir?: string[];
  } | null;
  limit?: number;
  start?: boolean;
  /** Só confere e devolve os números (a revisão da tela), sem criar nada. */
  dryRun?: boolean;
  scheduledAt?: string | null;
  sendStart?: string;
  sendEnd?: string;
  sendDays?: number[];
  dailyLimit?: number;
  throttleSeconds?: number;
  timezone?: string;
  importId?: string;
};

function erro(error: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status });
}

export async function POST(req: NextRequest) {
  let user: Scope;
  try {
    user = await requireScopeAdmin("campanhas");
  } catch (err) {
    const status = (err as { status?: number }).status ?? 403;
    return NextResponse.json({ error: "Acesso restrito a gestores" }, { status });
  }
  const tenantId = user.tenantId;

  const body = (await req.json().catch(() => ({}))) as Body;
  const dryRun = Boolean(body.dryRun);

  if (!dryRun && !body.name?.trim()) return erro("Nome obrigatório");
  if (!body.templateName?.trim()) return erro("Template obrigatório");

  // ── Fonte do público ────────────────────────────────────────
  // Loja usa SÓ as fontes dela. Qualquer outra coisa (base de empresas,
  // Procob, CNPJá, ou nada) é recusada aqui: antes, "targets" ou um pedido sem
  // destinatários caía na base de empresas do CNV.
  const publico = body.publico ?? null;
  const temPublico = Boolean(
    publico && (publico.contatos || publico.coluna?.id || publico.colados?.length || publico.csv?.length),
  );
  if (tenantId) {
    const fonteLegada = body.source ?? null;
    const legadoCsv = !temPublico && fonteLegada === "csv" && (body.recipients?.length ?? 0) > 0;
    if (
      body.partners?.length ||
      body.targetIds?.length ||
      (fonteLegada && !(FONTES_DA_LOJA as readonly string[]).includes(fonteLegada) && fonteLegada !== "misto") ||
      (!temPublico && !legadoCsv)
    ) {
      return erro(
        temPublico || legadoCsv
          ? "Fonte de público indisponível para lojas"
          : "Escolha o público: contatos da loja, uma coluna do funil, uma lista colada ou um CSV.",
      );
    }
  }
  if (publico?.coluna?.id && !podeUsar(user, "funil")) {
    return erro("O funil não está liberado para esta loja.", 403);
  }

  await dbConnect();

  // ── Template ────────────────────────────────────────────────
  // O template manda no número de variáveis, no cabeçalho e nos botões. Sem
  // conferir isto, o disparo falharia na Meta em 100% das mensagens
  // ("number of parameters does not match") — com a campanha já rodando.
  const creds = await wabaCredentialsOf(tenantId);
  if (!podeUsarTemplates(creds)) {
    return erro("WhatsApp não conectado — conecte o número na Configuração.");
  }
  const ondeEsta = tenantId ? "no WhatsApp da loja" : "neste WABA";

  let forma: ReturnType<typeof formaDoTemplate>;
  let templateCategory = "MARKETING";
  let templateLanguage = body.templateLanguage?.trim() || "pt_BR";
  try {
    const templates = await listTemplates(creds);
    const nome = body.templateName.trim();
    const chosen =
      templates.find((t) => t.name === nome && t.language === templateLanguage) ??
      templates.find((t) => t.name === nome);
    if (!chosen) return erro(`Template "${body.templateName}" não existe ${ondeEsta}.`);
    if (chosen.status !== "APPROVED") {
      return erro(`O template "${chosen.name}" está ${chosen.status} — só APPROVED pode ser disparado.`);
    }
    templateCategory = chosen.category ?? "MARKETING";
    templateLanguage = chosen.language || templateLanguage;
    forma = formaDoTemplate(chosen);
  } catch (err) {
    return erro(err instanceof Error ? err.message : "Falha ao conferir o template na Meta");
  }

  if (forma.headerFormat === "LOCATION") {
    return erro("Template com localização no cabeçalho ainda não pode ser disparado por campanha.");
  }

  // Cabeçalho de mídia: o arquivo é obrigatório e precisa ser do tipo do
  // template. Sem ele, a Meta recusa todos os envios.
  let headerMedia: WaHeaderMedia | null = null;
  if (headerDeMidia(forma.headerFormat)) {
    const nome = nomeDaMidiaDoHeader(forma.headerFormat);
    const midiaId = body.headerMedia?.midiaId;
    if (midiaId) {
      const doc = await midiaDoDono(midiaId, tenantId);
      if (!doc) return erro(`O arquivo do cabeçalho venceu ou não existe: anexe ${nome === "imagem" ? "a" : "o"} ${nome} de novo.`);
      const tipo = tipoDaMidia(doc.mime);
      if (tipo !== tipoDoHeader(forma.headerFormat)) {
        return erro(`O cabeçalho deste template pede ${nome}: troque o arquivo.`);
      }
      headerMedia = { midiaId, tipo, filename: doc.filename ?? null, mime: doc.mime };
    } else if (!dryRun) {
      return erro(`Este template tem ${nome} no cabeçalho: anexe o arquivo no passo do template.`);
    }
  }

  const paramsMap = sanitizeParamMap(body.paramsMap, forma.bodyVars);
  const headerParamsMap = forma.headerVars > 0 ? sanitizeParamMap(body.headerParamsMap, 1) : [];
  const buttonParamsMap = forma.botoesUrl.map((b) => {
    const [item] = sanitizeParamMap(
      [(body.buttonParamsMap ?? []).find((x) => Number(x?.index) === b.index) ?? { type: "fixed", value: "" }],
      1,
    );
    return { index: b.index, ...item };
  });
  const fallbacks = fallbacksDe(tenantId);

  // ── Candidatos ──────────────────────────────────────────────
  const candidatos = new Map<string, Candidato>();
  const fontes = new Set<string>();
  let invalidos = 0;
  const amostraInvalidos: string[] = [];
  let duplicados = 0;
  let excluidos = 0;
  let semCelular = 0;
  let truncado = false;
  let source: WaCampaignSource = body.source ?? "manual";
  const filters: Record<string, unknown> = {};

  const anotarInvalido = (raw: string) => {
    invalidos++;
    if (amostraInvalidos.length < 20) amostraInvalidos.push(raw);
  };

  if (temPublico && publico) {
    // ── Público somado (contatos, coluna, lista colada, CSV) ──
    const listas: PessoaDoPublico[][] = [];
    try {
      if (publico.contatos) {
        const r = await contatosDaLoja(tenantId, {
          janela24h: Boolean(publico.contatos.janela24h),
          origem: publico.contatos.origem ?? null,
        });
        listas.push(r.pessoas);
        semCelular += r.semCelular;
        truncado ||= r.truncado;
        fontes.add("contatos");
        if (publico.contatos.janela24h) filters.janela24h = true;
        if (publico.contatos.origem) filters.origem = publico.contatos.origem;
      }
      if (publico.coluna?.id) {
        const r = await contatosDaColuna(tenantId, publico.coluna.id);
        listas.push(r.pessoas);
        semCelular += r.semCelular;
        truncado ||= r.truncado;
        fontes.add("coluna");
        filters.colunaId = r.coluna.id;
        filters.colunaNome = r.coluna.name;
      }
    } catch (err) {
      if (err instanceof FunilError) return erro(err.message, err.status);
      throw err;
    }
    for (const [origem, linhas] of [
      ["colar", publico.colados ?? []],
      ["csv", publico.csv ?? []],
    ] as const) {
      if (!linhas.length) continue;
      const boas: PessoaDoPublico[] = [];
      for (const linha of linhas.slice(0, MAX_PUBLICO * 2)) {
        const p = daTela(linha, origem);
        if ("invalido" in p) anotarInvalido(p.invalido);
        else boas.push(p);
      }
      listas.push(boas);
      fontes.add(origem);
    }
    const junto = juntarPublico(listas, (publico.excluir ?? []).filter((x) => typeof x === "string"));
    duplicados += junto.duplicados;
    excluidos = junto.excluidos;
    if (junto.pessoas.length > MAX_PUBLICO) {
      return erro(`Público acima de ${MAX_PUBLICO.toLocaleString("pt-BR")} pessoas: divida em mais de uma campanha.`);
    }
    for (const p of junto.pessoas) {
      candidatos.set(p.phone, {
        phone: p.phone,
        name: p.name ?? null,
        contactName: p.name ?? null,
        company: p.company ?? null,
        city: p.city ?? null,
        state: p.state ?? null,
        var1: p.var1 ?? null,
        var2: p.var2 ?? null,
        var3: p.var3 ?? null,
      });
    }
    const lista = [...fontes];
    source = lista.length === 1 ? (lista[0] as WaCampaignSource) : "misto";
  } else if (!tenantId && body.partners?.length) {
    // ── Por pessoa (sócios da Procob, só CNV) ─────────────────
    // A unidade aqui é a PESSOA: o bureau devolve vários celulares e não diz
    // qual está ativo, então a campanha tenta os escolhidos. Os números da
    // mesma pessoa ficam ligados pelo partnerId — quando um responde, o
    // inbound cancela os outros que ainda não saíram.
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
    for (const entry of body.partners) {
      const partner = partnerById.get(entry.partnerId);
      // Sócio falecido nunca entra: o telefone costuma ser de um familiar.
      if (!partner || partner.deceased) continue;
      const target = targetByPartner.get(entry.partnerId) ?? null;
      let attempt = 0;
      for (const raw of entry.phones) {
        const parsed = parsePhoneBr(raw);
        if (!parsed.valid || !parsed.e164 || parsed.kind !== "movel") {
          anotarInvalido(raw);
          continue;
        }
        if (candidatos.has(parsed.e164)) {
          duplicados++;
          continue;
        }
        attempt++;
        candidatos.set(parsed.e164, {
          phone: parsed.e164,
          name: partner.name ?? null,
          contactName: partner.name ?? null,
          partnerId: entry.partnerId,
          targetId: target ? String(target._id) : null,
          attempt,
          company: target?.legalName ?? null,
          city: target?.city ?? null,
          state: target?.state ?? null,
        });
      }
    }
  } else if (body.recipients?.length) {
    // ── Lista avulsa (prévia do CNPJá ou CSV) ─────────────────
    source = !tenantId && body.source === "cnpja" ? "cnpja" : "csv";
    for (const r of body.recipients.slice(0, MAX_PUBLICO * 2)) {
      const p = daTela(r, "csv", !tenantId);
      if ("invalido" in p) {
        anotarInvalido(p.invalido);
        continue;
      }
      if (candidatos.has(p.phone)) {
        duplicados++;
        continue;
      }
      candidatos.set(p.phone, { ...p, name: p.name ?? null, contactName: p.name ?? null });
    }
    if (source === "cnpja" && body.filters) {
      Object.assign(filters, { cnae: body.filters.cnae, uf: body.filters.uf, city: body.filters.city });
    }
  } else if (!tenantId) {
    // ── Base de empresas (wa_targets prontas, só CNV) ─────────
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
    if (targets.length === 0) return erro("Nenhuma empresa pronta para disparo");
    for (const target of targets) {
      const parsed = parsePhoneBr(target.phone ?? "");
      if (!parsed.valid || !parsed.e164) {
        anotarInvalido(target.phone ?? "");
        continue;
      }
      // Dedupe por telefone: fica a empresa de maior prioridade (a lista já
      // vem ordenada, então a primeira ocorrência vence).
      if (candidatos.has(parsed.e164)) {
        duplicados++;
        continue;
      }
      candidatos.set(parsed.e164, {
        phone: parsed.e164,
        name: target.contactName ?? target.legalName ?? null,
        contactName: target.contactName ?? null,
        targetId: String(target._id),
        company: target.legalName ?? target.tradeName ?? null,
        city: target.city ?? null,
        state: target.state ?? null,
      });
    }
  } else {
    return erro("Escolha o público da campanha.");
  }

  // ── Conferência de cada um ──────────────────────────────────
  // Opt-out e variável vazia ficam de fora AGORA, com o motivo: a revisão mostra
  // os números, e a campanha guarda cada um como "pulado".
  const optOut = await optedOutSet([...candidatos.keys()], tenantId);
  const linhas: Array<
    Candidato & { params: string[]; headerParams: string[]; buttonParams: Array<{ index: number; value: string }> }
  > = [];
  const pulados: Pulado[] = [];
  let skippedOptOut = 0;
  let skippedEmptyParam = 0;
  for (const c of candidatos.values()) {
    if (optOut.has(c.phone)) {
      skippedOptOut++;
      pulados.push({ phone: c.phone, name: c.name, motivo: "opt-out: pediu para não receber" });
      continue;
    }
    const params = resolveParams(paramsMap, c, fallbacks);
    const headerParams = resolveParams(headerParamsMap, c, fallbacks);
    const buttonParams = buttonParamsMap.map((b) => ({ index: b.index, value: resolveParam(b, c, fallbacks) }));
    const vazias = [
      ...emptyParamPositions(params).map((n) => `{{${n}}}`),
      ...(headerParams.some((v) => !v.trim()) ? ["cabeçalho"] : []),
      ...buttonParams.filter((b) => !b.value.trim()).map(() => "link do botão"),
    ];
    if (vazias.length > 0) {
      skippedEmptyParam++;
      pulados.push({ phone: c.phone, name: c.name, motivo: `variável vazia: ${vazias.join(", ")}` });
      continue;
    }
    linhas.push({ ...c, params, headerParams, buttonParams });
  }

  const resumo = {
    recipients: linhas.length,
    people: new Set(linhas.map((r) => r.partnerId ?? r.phone)).size,
    skippedOptOut,
    skippedEmptyParam,
    skippedInvalid: invalidos,
    duplicates: duplicados,
    excluded: excluidos,
    withoutMobile: semCelular,
    truncated: truncado,
    invalidSample: amostraInvalidos,
    skippedSample: pulados.slice(0, 50),
    templateCategory,
    source,
  };

  if (dryRun) return NextResponse.json({ dryRun: true, ...resumo });

  if (linhas.length === 0) {
    return erro(
      skippedOptOut > 0 && skippedEmptyParam === 0
        ? "Todos os destinatários pediram para não receber mensagens (opt-out)."
        : "Nenhum destinatário ficou com todas as variáveis preenchidas. Revise o mapeamento — variável vazia faz a Meta recusar a mensagem.",
      400,
      resumo,
    );
  }

  const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
  const isFuture = scheduledAt != null && scheduledAt.getTime() > Date.now();
  const status = body.start ? (isFuture ? "scheduled" : "running") : "draft";
  const throttleSeconds = Math.min(Math.max(body.throttleSeconds ?? 4, 1), 60);

  const campaign = await WaCampaign.create({
    tenantId,
    name: body.name!.trim(),
    templateName: body.templateName.trim(),
    templateLanguage,
    templateBody: forma.body,
    templateHeaderText: forma.headerText ?? undefined,
    templateCategory,
    status,
    source,
    fontes: fontes.size > 0 ? [...fontes] : undefined,
    filters: Object.keys(filters).length > 0 ? filters : undefined,
    paramsMap,
    headerParamsMap,
    buttonParamsMap,
    headerMedia,
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
    // Total = quem vai receber + quem ficou de fora com motivo: o progresso e
    // a lista do detalhe contam as mesmas pessoas.
    total: linhas.length + pulados.length,
    skipped: pulados.length,
    createdBy: user.email,
  });

  const docs = [
    ...linhas.map((r) => ({
      campaignId: campaign._id,
      tenantId,
      phone: r.phone,
      name: r.name ?? undefined,
      params: r.params,
      headerParams: r.headerParams,
      buttonParams: r.buttonParams,
      targetId: r.targetId ?? undefined,
      partnerId: r.partnerId ?? undefined,
      attempt: r.attempt ?? 1,
    })),
    ...pulados.map((p) => ({
      campaignId: campaign._id,
      tenantId,
      phone: p.phone,
      name: p.name ?? undefined,
      status: "skipped" as const,
      error: p.motivo,
    })),
  ];
  for (let i = 0; i < docs.length; i += 500) {
    await WaCampaignRecipient.insertMany(docs.slice(i, i + 500));
  }

  const targetIds = [...new Set(linhas.map((r) => r.targetId).filter(Boolean))] as string[];
  if (targetIds.length > 0) {
    await WaTarget.updateMany(
      { _id: { $in: targetIds }, status: { $in: ["new", "ready"] } },
      { status: "queued" },
    );
  }

  return NextResponse.json({ campaignId: String(campaign._id), status, ...resumo });
}
