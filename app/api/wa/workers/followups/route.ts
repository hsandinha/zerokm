// Worker da cadência de follow-up — cron a cada 15 minutos.
//
// Quem não respondeu ao disparo recebe mais um toque, com outro ângulo, e
// depois sai da fila. Quem respondeu teve a cadência cancelada no inbound —
// receber "só passando para lembrar" depois de já ter conversado é o jeito
// mais rápido de queimar o número.

import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { WaCampaign, WaContact, WaConversation, WaFollowup } from "@wa/models/wa";
import { sendAndLogTemplate } from "@wa/lib/send";
import { isWithinSendWindow, type SendWindow } from "@wa/lib/send-window";
import { getWabaCredentials } from "@wa/lib/settings";
import { listTemplates } from "@wa/lib/meta";
import { advanceConversationStage } from "@wa/lib/conversation-stage";

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

  // Uma leitura de templates por rodada, para gravar o texto real da mensagem
  // em vez de "[template x]".
  const corpoPorTemplate = new Map<string, string>();
  try {
    const creds = await getWabaCredentials();
    if (creds) {
      for (const t of await listTemplates(creds)) {
        const corpo = t.components?.find((c) => c.type === "BODY")?.text;
        if (corpo) corpoPorTemplate.set(t.name, corpo);
      }
    }
  } catch {
    // Sem os corpos o follow-up ainda sai; só o histórico fica menos claro.
  }

  // Uma leitura por campanha em vez de uma por follow-up.
  const campanhas = new Map<string, SendWindow & { templates: string[]; delays: number[] }>();
  for (const id of new Set(due.map((f) => f.campaignId).filter(Boolean))) {
    const c = await WaCampaign.findById(id).lean();
    if (c) {
      campanhas.set(String(id), {
        send_start: c.sendStart,
        send_end: c.sendEnd,
        send_days: c.sendDays,
        timezone: c.timezone,
        templates: c.followupTemplates ?? [],
        delays: c.followupDelaysHours ?? [],
      });
    }
  }

  for (const followup of due) {
    // Follow-up fora do horário fica pendente e sai quando a janela abrir —
    // lembrete às 3h da manhã é pior que lembrete nenhum.
    const campanha = followup.campaignId ? campanhas.get(String(followup.campaignId)) : null;
    if (campanha && !isWithinSendWindow(campanha)) {
      outsideWindow++;
      continue;
    }

    const conv = await WaConversation.findById(followup.conversationId);

    // Rede de segurança: o inbound já cancela, mas se algo escapou, quem
    // respondeu ou saiu do funil não recebe mais toque.
    const jaEngajou =
      !conv ||
      conv.lastInboundAt != null ||
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
      await sendAndLogTemplate({
        conversationId: String(followup.conversationId),
        to: contact.phone,
        templateName: followup.templateName,
        renderedText: corpoPorTemplate.get(followup.templateName),
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
