// Webhook da Meta Cloud API — GET verifica a assinatura do canal,
// POST recebe mensagens e status. Sempre responde 200 (senão a Meta re-tenta).

import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { WaCampaign, WaCampaignRecipient, WaMessage } from "@wa/models/wa";
import { getVerifyToken, getWabaCredentials } from "@wa/lib/settings";
import { verifyWebhookSignature, type MetaWebhookValue } from "@wa/lib/meta";
import { processInbound, type NormalizedInbound } from "@wa/lib/inbound";
import { isLocalUrl, siteUrl } from "@wa/lib/site-url";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const mode = sp.get("hub.mode");
  const token = sp.get("hub.verify_token");
  const challenge = sp.get("hub.challenge");

  const expected = await getVerifyToken();
  if (mode === "subscribe" && expected && token === expected) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

function normalize(value: MetaWebhookValue): NormalizedInbound[] {
  const contacts = value.contacts ?? [];
  return (value.messages ?? []).map((m) => {
    const name = contacts.find((c) => c.wa_id === m.from)?.profile?.name ?? null;
    const media = m.image ?? m.audio ?? m.video ?? m.document ?? m.sticker;
    return {
      from: m.from,
      contactName: name,
      type: m.type,
      text:
        m.text?.body ??
        m.button?.text ??
        m.interactive?.button_reply?.title ??
        m.interactive?.list_reply?.title ??
        null,
      externalId: m.id,
      mediaCaption:
        m.image?.caption ?? m.video?.caption ?? m.document?.caption ?? null,
      mediaId: media?.id ?? null,
      reaction: m.reaction
        ? { targetExternalId: m.reaction.message_id, emoji: m.reaction.emoji ?? "" }
        : null,
    };
  });
}

async function handleStatuses(value: MetaWebhookValue) {
  await dbConnect();
  for (const s of value.statuses ?? []) {
    // O motivo da recusa fica na própria mensagem: sem isso, na Central uma
    // mensagem que a Meta recusou aparece igual a uma entregue, e quem atende
    // não tem como saber que o cliente nunca recebeu aquilo.
    const erro = s.errors?.map((e) => `${e.code}: ${e.title}`).join("; ");
    await WaMessage.updateOne(
      { externalId: s.id },
      { status: s.status, ...(erro ? { error: erro } : {}) },
    ).catch(() => {});

    const recipient = await WaCampaignRecipient.findOne({ externalId: s.id });
    if (recipient) {
      if (s.status === "delivered" && recipient.status === "sent") {
        recipient.status = "delivered";
        await recipient.save();
        await WaCampaign.updateOne({ _id: recipient.campaignId }, { $inc: { delivered: 1 } });
      } else if (s.status === "read" && recipient.status !== "read" && recipient.status !== "replied") {
        const wasDelivered = recipient.status === "delivered";
        recipient.status = "read";
        await recipient.save();
        await WaCampaign.updateOne(
          { _id: recipient.campaignId },
          { $inc: { read: 1, ...(wasDelivered ? {} : { delivered: 1 }) } },
        );
      } else if (s.status === "failed") {
        recipient.status = "failed";
        recipient.error = erro;
        await recipient.save();
        await WaCampaign.updateOne({ _id: recipient.campaignId }, { $inc: { failed: 1 } });
      }
    }
  }
}

export async function POST(req: NextRequest) {
  const raw = await req.text();

  // Assinatura HMAC (se houver app secret configurado)
  const creds = await getWabaCredentials().catch(() => null);
  if (creds?.appSecret) {
    const ok = verifyWebhookSignature(
      creds.appSecret,
      raw,
      req.headers.get("x-hub-signature-256"),
    );
    if (!ok) return new NextResponse("ok", { status: 200 }); // descarta silenciosamente
  }

  let payload: { entry?: Array<{ changes?: Array<{ value?: MetaWebhookValue }> }> };
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse("ok", { status: 200 });
  }

  let hadInbound = false;
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;
      for (const msg of normalize(value)) {
        try {
          await processInbound(msg);
          hadInbound = true;
        } catch (err) {
          console.error("[webhook] processInbound falhou:", err);
        }
      }
      if (value.statuses?.length) {
        await handleStatuses(value).catch((err) =>
          console.error("[webhook] statuses falhou:", err),
        );
      }
    }
  }

  // Acorda o worker de IA sem esperar (o cron de 1min é a rede de segurança).
  // A base sai de `siteUrl(req)`, que prefere o host que ATENDEU esta
  // requisição: ler NEXT_PUBLIC_SITE_URL direto já mandou a chamada para
  // `localhost` em produção, e aí a IA só respondia no minuto seguinte.
  if (hadInbound && process.env.CRON_SECRET) {
    const base = siteUrl(req);
    if (!isLocalUrl(base)) {
      fetch(`${base}/api/wa/workers/ai`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      }).catch(() => {});
    }
  }

  return new NextResponse("ok", { status: 200 });
}
