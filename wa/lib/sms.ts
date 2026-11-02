// Canal SMS/RCS da loja — envio pelo provedor da própria loja e o que chega
// pelo webhook (resposta da cliente e status de entrega). Portado do Chatrun
// (sms.ts, sms-conta.ts e sms-webhook.ts, 107/115) SEM a parte de créditos:
// aqui cada loja paga o próprio disparo, direto à Zenvia ou à Comtele.
//
// O webhook é por canal: /api/webhooks/sms/<canal>/<segredo>. Os provedores
// não assinam o que mandam, então o segredo no caminho é a autenticação — e,
// sendo por canal, já diz de qual loja é a resposta (no Chatrun o número
// curto era da plataforma inteira e a loja saía do idRef).
//
// A IA não responde por SMS (cada mensagem é paga e o texto da IA é longo):
// a resposta da cliente cai direto na fila da equipe (ver inbound.ts).

import { randomBytes, randomUUID, timingSafeEqual } from "crypto";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { WaChannel } from "@wa/models/channel";
import { WaConversation, WaMessage } from "@wa/models/wa";
import { resolveChannel, safeDecrypt, type ResolvedChannel } from "@wa/lib/channels";
import { processInbound } from "@wa/lib/inbound";
import { comteleSendSms } from "@wa/lib/comtele";
import { zenviaSendText } from "@wa/lib/zenvia";
import { SMS_STATUS_FROM, SmsError, smsStatusOf, type SmsCreds, type SmsEvent } from "@wa/lib/sms-types";

// ── Envio ────────────────────────────────────────────────────────────

/** Por onde o texto sai: RCS quando a loja tem agente na Zenvia, senão SMS. */
export function smsRouteOf(creds: Pick<SmsCreds, "provider" | "rcsAgentId">): "sms" | "rcs" {
  return creds.provider === "zenvia" && creds.rcsAgentId ? "rcs" : "sms";
}

/** Manda o texto pelo provedor da loja. Devolve o id que o status e a
 *  resposta da cliente vão citar. Lança SmsError quando é certo que não saiu. */
export async function sendSms(
  creds: SmsCreds,
  to: string,
  text: string,
  opts?: { tag?: string | null },
): Promise<{ external_id: string; via: "sms" | "rcs" }> {
  if (creds.provider === "comtele") {
    const ref = `cm-${randomUUID()}`;
    await comteleSendSms({ key: creds.token, route: creds.route, to, text, ref, tag: opts?.tag });
    return { external_id: ref, via: "sms" };
  }
  const via = smsRouteOf(creds);
  const { id } = await zenviaSendText({
    token: creds.token,
    channel: via,
    from: via === "rcs" ? creds.rcsAgentId : creds.sender,
    to,
    text,
  });
  // Com RCS, o status da Zenvia corrige para "sms" se ela cair para SMS.
  return { external_id: id, via };
}

// ── Webhook por canal ────────────────────────────────────────────────

export function newSmsWebhookSecret(): string {
  return randomBytes(24).toString("hex");
}

/** Caminho do webhook do canal (sem o domínio). */
export function smsWebhookPath(channelId: string, secret: string): string {
  return `/api/webhooks/sms/${channelId}/${secret}`;
}

/** O segredo do caminho confere com o do canal (guardado cifrado)? */
export function smsSecretMatches(stored: string | null | undefined, given: string | null | undefined): boolean {
  const expected = safeDecrypt(stored);
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Canal dono do webhook, se o segredo confere e o canal está ligado. */
export async function smsChannelForWebhook(
  channelId: string,
  secret: string,
): Promise<{ channel: ResolvedChannel; provider: "zenvia" | "comtele" } | null> {
  if (!mongoose.isValidObjectId(channelId)) return null;
  await dbConnect();
  const doc = await WaChannel.findOne({ _id: channelId, kind: "sms" });
  if (!doc || !doc.smsProvider || !smsSecretMatches(doc.smsWebhookSecret, secret)) return null;
  if (doc.status === "disconnected") return null;
  return { channel: resolveChannel(doc), provider: doc.smsProvider };
}

/** Resposta da cliente ou status de entrega, já do canal certo. */
export async function processSmsEvent(channel: ResolvedChannel, e: SmsEvent): Promise<boolean> {
  if (e.type === "message") {
    await processInbound(channel, {
      from: e.from,
      contactName: null,
      type: "text",
      text: e.text || "[mensagem sem texto]",
      externalId: e.id,
    });
    return true;
  }

  // Status de entrega. Só mexe em mensagem de conversa DESTE canal: o
  // segredo autentica uma loja, não a base inteira.
  await dbConnect();
  const msg = await WaMessage.findOne({ externalId: e.id }).select("_id conversationId").lean();
  if (!msg) return false;
  const ours = await WaConversation.exists({ _id: msg.conversationId, channelId: channel.id });
  if (!ours) return false;

  const status = smsStatusOf(e.code);
  if (status) {
    await WaMessage.updateOne(
      { _id: msg._id, status: { $in: SMS_STATUS_FROM[status] } },
      {
        status,
        ...(e.via ? { via: e.via } : {}),
        ...(status === "failed" ? { error: (e.reason ?? "não entregue").slice(0, 300) } : {}),
      },
    );
  }
  // O status não mudou (já estava à frente), mas o canal real vale.
  if (e.via) await WaMessage.updateOne({ _id: msg._id }, { via: e.via });
  return false;
}

export { SmsError };
