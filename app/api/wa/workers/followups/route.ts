// Worker da cadência de follow-up — cron a cada 15 minutos.
//
// Quem não respondeu ao disparo recebe mais um toque, com outro ângulo, e
// depois sai da fila. Quem respondeu teve a cadência cancelada no inbound —
// receber "só passando para lembrar" depois de já ter conversado é o jeito
// mais rápido de queimar o número.

import { NextRequest, NextResponse } from "next/server";
import type { Types } from "mongoose";
import dbConnect from "@/lib/mongodb";
import {
  WaCampaign,
  WaCampaignRecipient,
  WaContact,
  WaConversation,
  WaFollowup,
  type IWaContact,
  type WaHeaderMedia,
} from "@wa/models/wa";
import { sendAndLogTemplate } from "@wa/lib/send";
import { isWithinSendWindow, type SendWindow } from "@wa/lib/send-window";
import { wabaCredentialsOf } from "@wa/lib/channels";
import { formaDoTemplate, listTemplates, type FormaDoTemplate } from "@wa/lib/meta";
import { advanceConversationStage } from "@wa/lib/conversation-stage";
import {
  defaultParamMap,
  emptyParamPositions,
  resolveParams,
  type ParamMapItem,
} from "@wa/lib/campaign-params";
import { linkDaMidia, midiaDoDono } from "@wa/lib/midia-saida";
import { siteUrl } from "@wa/lib/site-url";
import { extrasDoEnvio, textoDoTemplate, type MidiaDoEnvio } from "@wa/lib/template-envio";

export const maxDuration = 300;

const BATCH = 50;
const SPACING_MS = 400;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await dbConnect();
  const due = await WaFollowup.find({ status: "pending", runAfter: { $lte: new Date() } })
    .sort({ runAfter: 1 })
    .limit(BATCH);

  let sent = 0;
  let cancelled = 0;
  let outsideWindow = 0;

  // Uma leitura de templates por WABA (CNV ou loja) por rodada: o texto real
  // da mensagem (em vez de "[template x]") e o que o template pede além do
  // corpo (variáveis, cabeçalho, link dinâmico).
  const formasPorLoja = new Map<string, Map<string, FormaDoTemplate>>();
  async function formasDe(tenantId: string | null): Promise<Map<string, FormaDoTemplate>> {
    const chave = tenantId ?? "cnv";
    const pronto = formasPorLoja.get(chave);
    if (pronto) return pronto;
    const formas = new Map<string, FormaDoTemplate>();
    try {
      const creds = await wabaCredentialsOf(tenantId);
      if (creds) {
        for (const t of await listTemplates(creds)) {
          if (t.status === "APPROVED" || !formas.has(t.name)) formas.set(t.name, formaDoTemplate(t));
        }
      }
    } catch {
      // Sem a lista o follow-up de template simples ainda sai; só o histórico
      // fica menos claro.
    }
    formasPorLoja.set(chave, formas);
    return formas;
  }

  // Uma leitura por campanha em vez de uma por follow-up.
  type Campanha = SendWindow & {
    status: string;
    templates: string[];
    delays: number[];
    paramsMap: ParamMapItem[];
    headerMedia: WaHeaderMedia | null;
  };
  const campanhas = new Map<string, Campanha>();
  for (const id of new Set(due.map((f) => f.campaignId).filter(Boolean))) {
    const c = await WaCampaign.findById(id).lean();
    if (c) {
      campanhas.set(String(id), {
        status: c.status,
        send_start: c.sendStart,
        send_end: c.sendEnd,
        send_days: c.sendDays,
        timezone: c.timezone,
        templates: c.followupTemplates ?? [],
        delays: c.followupDelaysHours ?? [],
        paramsMap: (c.paramsMap ?? []) as ParamMapItem[],
        headerMedia: c.headerMedia ?? null,
      });
    }
  }

  /**
   * Parâmetros do toque: o follow-up é outro template, mas fala com a mesma
   * pessoa. Com o mesmo número de variáveis, reaproveita o que o disparo
   * mandou; senão, resolve nome/empresa/cidade do contato. Cabeçalho de mídia
   * usa o arquivo da campanha (se for do mesmo tipo) e link dinâmico, o valor
   * do disparo para o mesmo botão. Faltou algo: falha com o motivo.
   */
  async function montarToque(
    followup: { conversationId: Types.ObjectId; campaignId?: Types.ObjectId },
    forma: FormaDoTemplate,
    contact: IWaContact,
    campanha: Campanha | null,
    tenantId: string | null,
  ) {
    const disparo =
      followup.campaignId != null
        ? await WaCampaignRecipient.findOne({
            campaignId: followup.campaignId,
            conversationId: followup.conversationId,
          })
            .select("params headerParams buttonParams")
            .lean()
        : null;
    let bodyParams: string[] = [];
    if (forma.bodyVars > 0) {
      bodyParams =
        disparo?.params?.length === forma.bodyVars
          ? disparo.params
          : resolveParams(
              campanha?.paramsMap.length === forma.bodyVars ? campanha.paramsMap : defaultParamMap(forma.bodyVars),
              {
                phone: contact.phone,
                contactName: contact.name ?? null,
                company: contact.company ?? null,
                city: contact.city ?? null,
                state: contact.state ?? null,
              },
              { companyFallback: tenantId ? null : undefined },
            );
      const vazias = emptyParamPositions(bodyParams);
      if (vazias.length > 0) {
        throw new Error(`variável ${vazias.map((n) => `{{${n}}}`).join(", ")} do follow-up ficaria vazia`);
      }
    }
    let midia: MidiaDoEnvio | null = null;
    if (campanha?.headerMedia && (await midiaDoDono(campanha.headerMedia.midiaId, tenantId))) {
      midia = {
        link: linkDaMidia(siteUrl(), campanha.headerMedia.midiaId),
        tipo: campanha.headerMedia.tipo,
        filename: campanha.headerMedia.filename ?? null,
      };
    }
    const headerTexto =
      disparo?.headerParams?.[0] ?? (forma.headerVars > 0 ? (contact.name?.trim().split(/\s+/)[0] ?? null) : null);
    const extras = extrasDoEnvio(forma, { headerTexto, midia, botoes: disparo?.buttonParams ?? [] });
    return { bodyParams, extras, texto: textoDoTemplate(forma, bodyParams, headerTexto) };
  }

  for (const followup of due) {
    // Follow-up fora do horário fica pendente e sai quando a janela abrir —
    // lembrete às 3h da manhã é pior que lembrete nenhum.
    const campanha = followup.campaignId ? campanhas.get(String(followup.campaignId)) : null;
    // Campanha cancelada não manda mais nada; pausada segura o toque até
    // alguém retomar (a pausa costuma ser para corrigir alguma coisa).
    if (campanha?.status === "cancelled") {
      followup.status = "cancelled";
      await followup.save();
      cancelled++;
      continue;
    }
    if (campanha?.status === "paused") {
      outsideWindow++;
      continue;
    }
    if (campanha && !isWithinSendWindow(campanha)) {
      outsideWindow++;
      continue;
    }

    const conv = await WaConversation.findById(followup.conversationId);

    // Rede de segurança: o inbound já cancela, mas se algo escapou, quem
    // respondeu ou saiu do funil não recebe mais toque.
    // "Respondeu" é ter escrito depois do toque agendado: com o público dos
    // contatos da loja, quase todo mundo já tinha escrito alguma vez antes.
    const respondeuDepois =
      conv?.lastInboundAt != null && new Date(conv.lastInboundAt).getTime() > new Date(followup.createdAt).getTime();
    const jaEngajou =
      !conv ||
      respondeuDepois ||
      conv.status === "closed" ||
      conv.status === "waiting_human" ||
      conv.status === "human_active" ||
      conv.outcome != null;
    if (jaEngajou) {
      followup.status = "cancelled";
      await followup.save();
      cancelled++;
      continue;
    }

    const contact = await WaContact.findById(conv.contactId);
    if (!contact || contact.optOut) {
      followup.status = "cancelled";
      await followup.save();
      cancelled++;
      continue;
    }

    if (!followup.templateName) {
      followup.status = "failed";
      followup.error = "sem template configurado";
      await followup.save();
      continue;
    }

    try {
      const tenantId = conv.tenantId ?? null;
      const forma = (await formasDe(tenantId)).get(followup.templateName);
      // Sem a lista de templates, sai como antes (só funciona com template simples).
      const toque = forma ? await montarToque(followup, forma, contact, campanha ?? null, tenantId) : null;
      await sendAndLogTemplate({
        conversationId: String(followup.conversationId),
        to: contact.phone,
        templateName: followup.templateName,
        bodyParams: toque?.bodyParams,
        headerParams: toque?.extras.headerParams,
        buttonUrlParams: toque?.extras.buttonUrlParams,
        renderedText: toque?.texto,
      });
      followup.status = "sent";
      await followup.save();
      sent++;

      // Próximo toque, se a campanha ainda tiver ângulo na fila.
      if (campanha) {
        const nextStep = followup.step + 1;
        const nextTemplate = campanha.templates[nextStep - 1];
        if (nextTemplate) {
          await WaFollowup.create({
            conversationId: followup.conversationId,
            campaignId: followup.campaignId,
            step: nextStep,
            templateName: nextTemplate,
            runAfter: new Date(Date.now() + (campanha.delays[nextStep - 1] ?? 120) * 3600_000),
          }).catch(() => {});
        } else {
          // Fim da cadência: sem resposta em nenhum toque.
          await WaConversation.updateOne(
            { _id: followup.conversationId },
            { outcome: "sem_resposta" },
          );
          await advanceConversationStage(String(followup.conversationId), "perdido");
        }
      }
    } catch (err) {
      followup.status = "failed";
      followup.error = err instanceof Error ? err.message.slice(0, 300) : String(err);
      await followup.save();
    }

    await new Promise((r) => setTimeout(r, SPACING_MS));
  }

  return NextResponse.json({ sent, cancelled, outsideWindow, due: due.length });
}
