// Worker de disparo — cron da Vercel (1/min).
//
// Três freios, nesta ordem: agendamento (ainda não começou), janela de
// trabalho (fora do horário) e limite diário. A Meta faz pacing de template de
// marketing e derruba a nota de qualidade do número se a rajada vier grande
// demais — o ritmo aqui não é burocracia, é o que mantém o número vivo.
//
// Concorrência: o cron não espera a rodada anterior terminar. Defesas contra
// envio em dobro (ver wa/lib/campaign-queue.ts):
//   1. Cada destinatário é reservado (pending → sending) antes do envio, e só
//      uma rodada consegue. Se a rodada cair, ele NÃO volta para a fila: vira
//      "failed" com o aviso de conferir na conversa.
//   2. A reserva confere se o número já recebeu o mesmo modelo da mesma loja
//      nas últimas 24h, em qualquer campanha.
//   3. Falha DEPOIS de a Meta aceitar (gravar a mensagem, a conversa) não
//      desfaz o "enviado": a mensagem saiu.
//   4. A rodada tem orçamento de tempo para terminar antes da próxima.
//
// Problema que vale para a campanha inteira (WhatsApp desconectado, arquivo do
// cabeçalho vencido, template recusado pela Meta) pausa a campanha com o
// motivo em `lastError`, em vez de queimar a lista destinatário por
// destinatário ou ficar "Enviando" para sempre.

import { NextRequest, NextResponse } from "next/server";
import type { Types } from "mongoose";
import dbConnect from "@/lib/mongodb";
import {
  WaCampaign,
  WaCampaignRecipient,
  WaContact,
  WaConversation,
  WaFollowup,
  WaMessage,
  type IWaCampaign,
} from "@wa/models/wa";
import { WaTarget } from "@wa/models/base";
import { whatsappChannelOf } from "@wa/lib/channels";
import { MetaApiError, sendTemplate, type TemplateHeaderParam } from "@wa/lib/meta";
import { canonicalPhone } from "@wa/lib/phone";
import { isWithinSendWindow } from "@wa/lib/send-window";
import { renderTemplateBody } from "@wa/lib/campaign-params";
import { startOfDayIso } from "@wa/lib/dates";
import { linkDaMidia, midiaDoDono } from "@wa/lib/midia-saida";
import { siteUrl } from "@wa/lib/site-url";
import {
  devolverParaFila,
  encerrarEnviosInterrompidos,
  marcarEnviado,
  marcarFalha,
  pularDestinatario,
  reservarDestinatario,
} from "@wa/lib/campaign-queue";

export const maxDuration = 300;

// O cron roda a cada 60s. A rodada termina antes disso para que duas não se
// sobreponham: a reserva já garante que ninguém recebe em dobro, isto
// preserva o ritmo combinado com a Meta.
const RUN_BUDGET_MS = 55_000;

/** Erros do gateway que valem para o número inteiro, não para a pessoa. */
const GATEWAY_PARA_CAMPANHA = new Set(["connection_not_ready", "not_linked", "send_disabled", "not_configured", "connection_not_found"]);
/** Erros da Meta que valem para o template inteiro (ou para o token). O
 *  132005 (texto longo demais) fica de fora: depende das variáveis daquela
 *  pessoa, e pausar faria a campanha travar sempre no mesmo destinatário. */
const META_PARA_CAMPANHA = new Set([190, 132000, 132001, 132007, 132012, 132015, 132016]);

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/** Com o código da Meta na frente: a tela de campanha traduz o motivo. */
function mensagemDoErro(err: unknown): string {
  if (err instanceof MetaApiError) {
    return err.code && !err.message.includes(String(err.code)) ? `${err.code}: ${err.message}` : err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

async function pausar(campaignId: Types.ObjectId, motivo: string): Promise<void> {
  await WaCampaign.updateOne(
    { _id: campaignId, status: { $in: ["running", "scheduled"] } },
    { $set: { status: "paused", lastError: motivo.slice(0, 500) } },
  );
}

const NOME_DO_TIPO: Record<string, string> = { image: "imagem", video: "vídeo", document: "documento" };

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await dbConnect();
  const deadline = Date.now() + RUN_BUDGET_MS;

  // Quem rodou há mais tempo vai primeiro: com o orçamento da rodada, a
  // primeira campanha da lista não pode monopolizar o minuto.
  const campaigns = await WaCampaign.find({ status: { $in: ["running", "scheduled"] } })
    .sort({ lastRunAt: 1, createdAt: 1 })
    .lean<IWaCampaign[]>();

  let totalSent = 0;
  let outsideWindow = 0;
  let waitingSchedule = 0;
  let dailyCapped = 0;
  let paused = 0;
  let interrompidos = 0;

  for (const campaign of campaigns) {
    if (Date.now() >= deadline) break;
    // Cada campanha sai pelo WhatsApp da loja dona (null = CNV).
    const tenantId = campaign.tenantId ?? null;

    // 1. Agendamento: ainda não chegou a hora.
    if (campaign.scheduledAt && new Date(campaign.scheduledAt).getTime() > Date.now()) {
      waitingSchedule++;
      continue;
    }
    if (campaign.status === "scheduled") {
      await WaCampaign.updateOne({ _id: campaign._id, status: "scheduled" }, { $set: { status: "running" } });
    }

    // Rodada anterior que caiu no meio do envio.
    interrompidos += await encerrarEnviosInterrompidos(campaign._id);

    // 2. Janela de trabalho. A campanha continua "running" e retoma sozinha.
    const window = {
      send_start: campaign.sendStart,
      send_end: campaign.sendEnd,
      send_days: campaign.sendDays,
      timezone: campaign.timezone,
    };
    if (!isWithinSendWindow(window)) {
      outsideWindow++;
      continue;
    }

    // 3. Limite diário (quem está a caminho da Meta também conta).
    let restanteHoje = Number.POSITIVE_INFINITY;
    if (campaign.dailyLimit > 0) {
      const inicioDoDia = new Date(startOfDayIso(campaign.timezone || "America/Sao_Paulo"));
      const enviadosHoje = await WaCampaignRecipient.countDocuments({
        campaignId: campaign._id,
        $or: [{ sentAt: { $gte: inicioDoDia } }, { status: "sending" }],
      });
      restanteHoje = campaign.dailyLimit - enviadosHoje;
      if (restanteHoje <= 0) {
        dailyCapped++;
        continue;
      }
    }

    // 4. Número conectado. Sem ele, pausa com o motivo: a campanha ficaria
    // "Enviando" para sempre sem mandar nada.
    const channel = await whatsappChannelOf(tenantId).catch(() => null);
    const creds = channel?.whatsapp;
    if (!creds) {
      await pausar(
        campaign._id,
        "WhatsApp desconectado: reconecte o número na Configuração e retome a campanha.",
      );
      paused++;
      continue;
    }

    // 5. Cabeçalho de mídia: o arquivo é o mesmo para a campanha inteira. Sem
    // ele a Meta recusa todos os envios (132012), então é melhor pausar.
    let headerMidia: TemplateHeaderParam | null = null;
    if (campaign.headerMedia?.midiaId) {
      const midia = await midiaDoDono(campaign.headerMedia.midiaId, tenantId);
      if (!midia) {
        await pausar(
          campaign._id,
          `O arquivo do cabeçalho (${NOME_DO_TIPO[campaign.headerMedia.tipo] ?? "mídia"}) venceu ou foi apagado. Crie a campanha de novo com o arquivo.`,
        );
        paused++;
        continue;
      }
      headerMidia = {
        type: campaign.headerMedia.tipo,
        link: linkDaMidia(siteUrl(), campaign.headerMedia.midiaId),
        filename: campaign.headerMedia.filename ?? midia.filename ?? null,
      };
    }

    const espacamentoMs = Math.max(0, (campaign.throttleSeconds ?? 4) * 1000);
    const cabeNaRodada =
      espacamentoMs > 0 ? Math.max(1, Math.floor((deadline - Date.now()) / espacamentoMs)) : Infinity;
    const porRodada = Math.min(campaign.throttlePerRun || 10, restanteHoje, cabeNaRodada);

    const batch = await WaCampaignRecipient.find({ campaignId: campaign._id, status: "pending" })
      .sort({ _id: 1 })
      .limit(porRodada)
      .lean();

    if (batch.length === 0) {
      // Sem pendentes e ninguém no meio do envio: concluída.
      const enviando = await WaCampaignRecipient.exists({ campaignId: campaign._id, status: "sending" });
      if (!enviando) {
        await WaCampaign.updateOne(
          { _id: campaign._id, status: { $in: ["running", "scheduled"] } },
          { $set: { status: "completed", lastRunAt: new Date() } },
        );
      }
      continue;
    }

    // Campanhas da mesma loja com o mesmo modelo: a checagem de "já recebeu"
    // da reserva olha todas elas.
    const mesmoModelo = await WaCampaign.find({ tenantId, templateName: campaign.templateName }).distinct("_id");

    for (const recipient of batch) {
      if (Date.now() >= deadline) break;
      // Pausada ou cancelada no meio da rodada: para aqui, não no fim do lote.
      if (!(await WaCampaign.exists({ _id: campaign._id, status: "running" }))) break;

      const phone = canonicalPhone(recipient.phone);

      // Opt-out pode ter chegado depois de a campanha ser montada.
      const jaExiste = await WaContact.findOne({ tenantId, phone }).select("optOut").lean();
      if (jaExiste?.optOut) {
        await pularDestinatario(recipient, "opt-out");
        continue;
      }

      const { reserva } = await reservarDestinatario(recipient._id, mesmoModelo);
      if (reserva !== "reservado") continue;

      // Contato e conversa ANTES do envio: se a Meta aceitar e algo falhar
      // depois, a conversa já existe para a resposta cair nela.
      let contactId: Types.ObjectId;
      let conversationId: Types.ObjectId;
      try {
        const contact = await WaContact.findOneAndUpdate(
          { tenantId, phone },
          {
            $setOnInsert: {
              phone,
              tenantId,
              source: campaign.source === "cnpja" ? "cnpja" : campaign.source === "csv" ? "csv" : "manual",
            },
            $set: {
              ...(recipient.name ? { name: recipient.name } : {}),
              ...(recipient.targetId ? { targetId: recipient.targetId } : {}),
            },
          },
          { new: true, upsert: true },
        );
        contactId = contact._id as Types.ObjectId;
        // Conversa que nasce do disparo começa em "abordado"; a resposta do
        // cliente é o que a leva para "em conversa".
        const conversation = await WaConversation.findOneAndUpdate(
          { contactId: contact._id },
          {
            $setOnInsert: {
              contactId: contact._id,
              tenantId,
              ...(channel?.id ? { channelId: channel.id } : {}),
              status: "ai_active",
              stage: "abordado",
              stageChangedAt: new Date(),
            },
          },
          { new: true, upsert: true },
        );
        conversationId = conversation._id as Types.ObjectId;
      } catch (err) {
        // Nada saiu: volta para a fila e tenta na próxima rodada.
        console.error("[campanha] contato/conversa", String(recipient._id), err);
        await devolverParaFila(recipient);
        continue;
      }

      const params = recipient.params ?? [];
      const headerParams: TemplateHeaderParam[] = headerMidia
        ? [headerMidia]
        : recipient.headerParams?.[0]
          ? [{ type: "text", text: recipient.headerParams[0] }]
          : [];

      let externalId: string;
      try {
        ({ external_id: externalId } = await sendTemplate(
          creds,
          phone,
          campaign.templateName,
          campaign.templateLanguage || "pt_BR",
          params,
          {
            headerParams,
            buttonUrlParams: (recipient.buttonParams ?? []).map((b) => ({ index: b.index, value: b.value })),
            clientRef: `camp:${String(recipient._id)}`,
          },
        ));
      } catch (err) {
        const motivo = mensagemDoErro(err);
        if (err instanceof MetaApiError && err.gatewayCode === "rate_limited") {
          // O gateway segurou pelo ritmo do número: nada saiu, tenta depois.
          await devolverParaFila(recipient);
          break;
        }
        if (
          err instanceof MetaApiError &&
          ((err.gatewayCode && GATEWAY_PARA_CAMPANHA.has(err.gatewayCode)) ||
            (err.code != null && META_PARA_CAMPANHA.has(err.code)))
        ) {
          // Vale para a campanha inteira: este volta para a fila como estava e
          // a campanha pausa com o motivo, em vez de falhar a lista toda.
          await devolverParaFila(recipient);
          await pausar(campaign._id, `Campanha pausada: ${motivo}`);
          paused++;
          break;
        }
        await marcarFalha(recipient, motivo);
        if (espacamentoMs > 0) await new Promise((r) => setTimeout(r, espacamentoMs));
        continue;
      }

      // A Meta aceitou. Daqui em diante nada desfaz o "enviado".
      await marcarEnviado(recipient, { externalId, conversationId });
      totalSent++;

      try {
        // O texto REAL que a pessoa recebeu. É o que a Central exibe e o que a
        // IA lê como sua própria fala anterior — com um rótulo no lugar, ela
        // não saberia o que foi oferecido e responderia no vácuo.
        const corpo = campaign.templateBody
          ? renderTemplateBody(campaign.templateBody, params)
          : `[campanha "${campaign.name}" — template ${campaign.templateName}]`;
        const titulo = campaign.templateHeaderText
          ? campaign.templateHeaderText.replace(/\{\{1\}\}/g, recipient.headerParams?.[0] ?? "")
          : null;
        const textoEnviado = campaign.headerMedia
          ? `[${NOME_DO_TIPO[campaign.headerMedia.tipo] ?? "mídia"}]\n${corpo}`
          : titulo
            ? `*${titulo}*\n${corpo}`
            : corpo;

        await WaConversation.updateOne(
          { _id: conversationId },
          {
            $set: {
              campaignId: campaign._id,
              lastMessageAt: new Date(),
              lastMessagePreview: textoEnviado.slice(0, 120),
            },
          },
        );
        // Abordar de novo quem estava encerrado é recomeçar, como no envio
        // manual (wa/lib/outreach.ts): a IA volta a responder e o follow-up
        // não é cancelado por uma conversa que já tinha acabado.
        await WaConversation.updateOne(
          { _id: conversationId, status: "closed" },
          {
            $set: { status: "ai_active", outcome: null, waitingSince: null },
            $unset: { transferReason: 1, assignedTo: 1 },
          },
        );
        await WaMessage.create({
          conversationId,
          direction: "outbound",
          sender: "system",
          content: textoEnviado,
          mediaType: "template",
          externalId: externalId || undefined,
          status: "sent",
        });

        if (recipient.targetId) {
          await WaTarget.updateOne({ _id: recipient.targetId }, { status: "sent" });
        }

        // Agenda o 1º follow-up. Se o cliente responder antes, o inbound
        // cancela — "só passando para lembrar" depois de já ter conversado é o
        // jeito mais rápido de queimar o número.
        const templates = campaign.followupTemplates ?? [];
        if (templates.length > 0) {
          const delays = campaign.followupDelaysHours ?? [48];
          await WaFollowup.create({
            conversationId,
            campaignId: campaign._id,
            step: 1,
            templateName: templates[0],
            runAfter: new Date(Date.now() + (delays[0] ?? 48) * 3600_000),
          }).catch(() => {
            // Já existe um pendente para esta conversa (índice único parcial).
          });
        }
      } catch (err) {
        console.error("[campanha] enviada, mas o registro falhou", String(campaign._id), String(contactId), err);
      }

      if (espacamentoMs > 0) await new Promise((r) => setTimeout(r, espacamentoMs));
    }

    await WaCampaign.updateOne({ _id: campaign._id }, { $set: { lastRunAt: new Date() } });
  }

  return NextResponse.json({
    campaigns: campaigns.length,
    sent: totalSent,
    outsideWindow,
    waitingSchedule,
    dailyCapped,
    paused,
    interrupted: interrompidos,
  });
}
