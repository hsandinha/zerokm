// Webhooks: cada evento vira uma entrega por endpoint inscrito, assinada com
// HMAC-SHA256 do segredo do endpoint, com retentativa em backoff.
//
// A emissão é barata (grava as entregas); o envio HTTP roda DEPOIS da
// resposta (`after()` do Next), para o webhook da Meta e o worker da IA não
// esperarem o sistema do cliente responder. O que falhar fica pendente e o
// worker /api/wa/workers/webhooks tenta de novo.

import { createHmac, randomBytes } from "crypto";
import { after } from "next/server";
import dbConnect from "@/lib/mongodb";
import { WaContact, WaConversation } from "@wa/models/wa";
import { WaTarget } from "@wa/models/base";
import { WaWebhookDelivery, WaWebhookEndpoint } from "@wa/models/panel";
import { siteUrl } from "@wa/lib/site-url";
import type { EventType } from "@wa/lib/events";

const TIMEOUT_MS = 8_000;
/** Espera entre tentativas: 1 min, 5 min, 30 min, 2 h — depois desiste. */
const BACKOFF_MS = [60_000, 300_000, 1_800_000, 7_200_000];
export const MAX_ATTEMPTS = BACKOFF_MS.length + 1;

export function generateWebhookSecret(): string {
  return "whsec_" + randomBytes(24).toString("hex");
}

export function signPayload(secret: string, body: string): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

/** Retrato da conversa que vai em todo evento — o cliente não precisa buscar. */
export async function conversationSnapshot(
  conversationId: string,
): Promise<Record<string, unknown>> {
  await dbConnect();
  const conv = await WaConversation.findById(conversationId).lean();
  if (!conv) return { conversation: { id: conversationId } };

  const contact = await WaContact.findById(conv.contactId).lean();
  const target = contact?.targetId ? await WaTarget.findById(contact.targetId).lean() : null;

  return {
    conversation: {
      id: String(conv._id),
      status: conv.status,
      stage: conv.stage,
      outcome: conv.outcome ?? null,
      transferReason: conv.transferReason ?? null,
      assignedTo: conv.assignedTo ?? null,
      campaignId: conv.campaignId ? String(conv.campaignId) : null,
      lastMessageAt: conv.lastMessageAt ?? null,
      createdAt: conv.createdAt,
      url: `${siteUrl()}/central?c=${String(conv._id)}`,
    },
    contact: contact
      ? {
          id: String(contact._id),
          phone: contact.phone,
          name: contact.name ?? null,
          email: contact.email ?? null,
          company: contact.company ?? target?.legalName ?? null,
          document: contact.document ?? null,
          registered: Boolean(contact.userId || contact.firebaseUid),
        }
      : null,
    target: target
      ? {
          cnpj: target.cnpj,
          legalName: target.legalName ?? null,
          city: target.city ?? null,
          state: target.state ?? null,
        }
      : null,
  };
}

/**
 * Emite um evento: grava uma entrega por endpoint inscrito e agenda o envio
 * para depois da resposta. Nunca lança — integração não derruba atendimento.
 */
export async function emitEvent(
  event: EventType,
  data: Record<string, unknown>,
  opts: { conversationId?: string } = {},
): Promise<void> {
  try {
    await dbConnect();
    const endpoints = await WaWebhookEndpoint.find({ enabled: true, events: event })
      .select("_id")
      .lean();
    if (endpoints.length === 0) return;

    const payloadData = opts.conversationId
      ? { ...(await conversationSnapshot(opts.conversationId)), ...data }
      : data;

    const created = await WaWebhookDelivery.insertMany(
      endpoints.map((e) => ({
        endpointId: e._id,
        event,
        payload: { event, createdAt: new Date().toISOString(), data: payloadData },
      })),
    );
    const ids = created.map((d) => String(d._id));

    const run = async () => {
      await Promise.allSettled(ids.map((id) => deliver(id)));
    };
    try {
      after(run);
    } catch {
      // Fora do escopo de uma requisição (worker, script): roda agora.
      await run();
    }
  } catch (err) {
    console.error(`[webhooks] falha ao emitir ${event}:`, err instanceof Error ? err.message : err);
  }
}

/** Tenta entregar uma vez; reprograma ou marca como falha definitiva. */
export async function deliver(deliveryId: string): Promise<boolean> {
  await dbConnect();
  const d = await WaWebhookDelivery.findById(deliveryId);
  if (!d || d.status === "delivered") return true;
  const ep = await WaWebhookEndpoint.findById(d.endpointId);
  if (!ep || !ep.enabled) {
    d.status = "failed";
    d.lastError = "endpoint desligado";
    await d.save();
    return false;
  }

  const body = JSON.stringify({ id: String(d._id), ...(d.payload as object) });
  const attempts = d.attempts + 1;
  let responseStatus: number | null = null;
  let error: string | null = null;

  try {
    const res = await fetch(ep.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "CNV-Webhooks/1.0",
        "X-CNV-Event": d.event,
        "X-CNV-Delivery": String(d._id),
        "X-CNV-Signature": signPayload(ep.secret, body),
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    responseStatus = res.status;
    if (!res.ok) error = `HTTP ${res.status}`;
  } catch (err) {
    error =
      err instanceof Error && err.name === "TimeoutError"
        ? `sem resposta em ${TIMEOUT_MS / 1000}s`
        : err instanceof Error
          ? err.message
          : String(err);
  }

  const now = new Date();
  if (!error) {
    d.status = "delivered";
    d.attempts = attempts;
    d.responseStatus = responseStatus ?? undefined;
    d.lastError = undefined;
    d.deliveredAt = now;
    await d.save();
    ep.lastDeliveryAt = now;
    ep.lastStatus = responseStatus ?? undefined;
    ep.failures = 0;
    await ep.save();
    return true;
  }

  const giveUp = attempts >= MAX_ATTEMPTS;
  d.status = giveUp ? "failed" : "pending";
  d.attempts = attempts;
  d.responseStatus = responseStatus ?? undefined;
  d.lastError = error.slice(0, 300);
  d.nextAttemptAt = new Date(
    Date.now() + (BACKOFF_MS[attempts - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1]),
  );
  await d.save();
  ep.lastDeliveryAt = now;
  ep.lastStatus = responseStatus ?? undefined;
  ep.failures = (ep.failures ?? 0) + 1;
  await ep.save();
  return false;
}

/** Worker: pega as entregas vencidas e tenta de novo. */
export async function processPendingDeliveries(
  limit = 50,
): Promise<{ tried: number; delivered: number }> {
  await dbConnect();
  const due = await WaWebhookDelivery.find({ status: "pending", nextAttemptAt: { $lte: new Date() } })
    .sort({ nextAttemptAt: 1 })
    .limit(limit)
    .select("_id")
    .lean();
  let delivered = 0;
  for (const row of due) {
    if (await deliver(String(row._id))) delivered++;
  }
  return { tried: due.length, delivered };
}
