// Worker de disparo — cron da Vercel (1/min).
//
// Três freios, nesta ordem: agendamento (ainda não começou), janela de
// trabalho (fora do horário) e limite diário. A Meta faz pacing de template de
// marketing e derruba a nota de qualidade do número se a rajada vier grande
// demais — o ritmo aqui não é burocracia, é o que mantém o número vivo.

import { NextRequest, NextResponse } from "next/server";
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
import { getWabaCredentials } from "@wa/lib/settings";
import { sendTemplate } from "@wa/lib/meta";
import { canonicalPhone } from "@wa/lib/phone";
import { isWithinSendWindow } from "@wa/lib/send-window";
import { renderTemplateBody } from "@wa/lib/campaign-params";
import { startOfDayIso } from "@wa/lib/dates";

export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await dbConnect();
  const creds = await getWabaCredentials();
  if (!creds) return NextResponse.json({ error: "WABA não configurado" }, { status: 200 });

  const campaigns = await WaCampaign.find({ status: { $in: ["running", "scheduled"] } });

  let totalSent = 0;
  let outsideWindow = 0;
  let waitingSchedule = 0;
  let dailyCapped = 0;

  for (const campaign of campaigns) {
    // 1. Agendamento: ainda não chegou a hora.
    if (campaign.scheduledAt && campaign.scheduledAt.getTime() > Date.now()) {
      waitingSchedule++;
      continue;
    }
    if (campaign.status === "scheduled") {
      campaign.status = "running";
      await campaign.save();
    }

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

    // 3. Limite diário.
    let restanteHoje = Number.POSITIVE_INFINITY;
    if (campaign.dailyLimit > 0) {
      const enviadosHoje = await WaCampaignRecipient.countDocuments({
        campaignId: campaign._id,
        sentAt: { $gte: new Date(startOfDayIso(campaign.timezone || "America/Sao_Paulo")) },
      });
      restanteHoje = campaign.dailyLimit - enviadosHoje;
      if (restanteHoje <= 0) {
        dailyCapped++;
        continue;
      }
    }

    const porRodada = Math.min(campaign.throttlePerRun || 10, restanteHoje);
    const batch = await WaCampaignRecipient.find({
      campaignId: campaign._id,
      status: "pending",
    }).limit(porRodada);

    if (batch.length === 0) {
      campaign.status = "completed";
      await campaign.save();
      continue;
    }

    const espacamentoMs = Math.max(0, (campaign.throttleSeconds ?? 4) * 1000);

    for (const recipient of batch) {
      const phone = canonicalPhone(recipient.phone);

      // Contato (com o vínculo da empresa, que é o que alimenta o dossiê).
      const contact = await WaContact.findOneAndUpdate(
        { phone },
        {
          $setOnInsert: { phone, source: campaign.source === "cnpja" ? "cnpja" : "csv" },
          $set: {
            ...(recipient.name ? { name: recipient.name } : {}),
            ...(recipient.targetId ? { targetId: recipient.targetId } : {}),
          },
        },
        { new: true, upsert: true },
      );

      // Opt-out pode ter chegado depois de a campanha ser montada.
      if (contact.optOut) {
        recipient.status = "skipped";
        recipient.error = "opt-out";
        await recipient.save();
        campaign.skipped += 1;
        continue;
      }

      try {
        const { external_id } = await sendTemplate(
          creds,
          phone,
          campaign.templateName,
          campaign.templateLanguage || "pt_BR",
          recipient.params ?? [],
        );

        // O texto REAL que a pessoa recebeu. É o que a Central exibe e o que a
        // IA lê como sua própria fala anterior — com um rótulo no lugar, ela
        // não saberia o que foi oferecido e responderia no vácuo.
        const textoEnviado = campaign.templateBody
          ? renderTemplateBody(campaign.templateBody, recipient.params ?? [])
          : `[campanha "${campaign.name}" — template ${campaign.templateName}]`;

        // Conversa que nasce do disparo começa em "abordado"; a resposta do
        // cliente é o que a leva para "em conversa".
        const conversation = await WaConversation.findOneAndUpdate(
          { contactId: contact._id },
          {
            $setOnInsert: {
              contactId: contact._id,
              status: "ai_active",
              stage: "abordado",
              stageChangedAt: new Date(),
            },
            $set: {
              campaignId: campaign._id,
              lastMessageAt: new Date(),
              lastMessagePreview: textoEnviado.slice(0, 120),
            },
          },
          { new: true, upsert: true },
        );

        await WaMessage.create({
          conversationId: conversation._id,
          direction: "outbound",
          sender: "system",
          content: textoEnviado,
          mediaType: "template",
          externalId: external_id || undefined,
          status: "sent",
        });

        recipient.status = "sent";
        recipient.sentAt = new Date();
        recipient.externalId = external_id || undefined;
        recipient.conversationId = conversation._id;
        await recipient.save();

        if (recipient.targetId) {
          await WaTarget.updateOne({ _id: recipient.targetId }, { status: "sent" });
        }
        campaign.sent += 1;
        totalSent++;

        // Agenda o 1º follow-up. Se o cliente responder antes, o inbound
        // cancela — "só passando para lembrar" depois de já ter conversado é o
        // jeito mais rápido de queimar o número.
        const templates = campaign.followupTemplates ?? [];
        if (templates.length > 0) {
          const delays = campaign.followupDelaysHours ?? [48];
          await WaFollowup.create({
            conversationId: conversation._id,
            campaignId: campaign._id,
            step: 1,
            templateName: templates[0],
            runAfter: new Date(Date.now() + (delays[0] ?? 48) * 3600_000),
          }).catch(() => {
            // Já existe um pendente para esta conversa (índice único parcial).
          });
        }
      } catch (err) {
        recipient.status = "failed";
        recipient.error = err instanceof Error ? err.message.slice(0, 300) : String(err);
        await recipient.save();
        campaign.failed += 1;
      }

      await campaign.save();
      if (espacamentoMs > 0) await new Promise((r) => setTimeout(r, espacamentoMs));
    }
  }

  return NextResponse.json({
    campaigns: campaigns.length,
    sent: totalSent,
    outsideWindow,
    waitingSchedule,
    dailyCapped,
  });
}
