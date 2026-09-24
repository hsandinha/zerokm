// Webhooks — listar (com as últimas entregas) e cadastrar endpoint.

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, type PanelUser } from "@wa/lib/auth";
import dbConnect from "@/lib/mongodb";
import { WaWebhookDelivery, WaWebhookEndpoint } from "@wa/models/panel";
import { isEventType } from "@wa/lib/events";
import { generateWebhookSecret } from "@wa/lib/webhooks";

export const dynamic = "force-dynamic";

function validUrl(input: string): URL | null {
  try {
    const u = new URL(input.trim());
    return /^https?:$/.test(u.protocol) ? u : null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
  }

  await dbConnect();
  const [endpoints, deliveries] = await Promise.all([
    WaWebhookEndpoint.find().sort({ createdAt: -1 }).lean(),
    WaWebhookDelivery.find().sort({ createdAt: -1 }).limit(200).lean(),
  ]);

  const byEndpoint = new Map<string, typeof deliveries>();
  for (const d of deliveries) {
    const key = String(d.endpointId);
    const list = byEndpoint.get(key) ?? [];
    if (list.length < 8) list.push(d);
    byEndpoint.set(key, list);
  }

  return NextResponse.json({
    endpoints: endpoints.map((e) => ({
      id: String(e._id),
      url: e.url,
      events: e.events,
      enabled: e.enabled,
      createdBy: e.createdBy ?? null,
      createdAt: e.createdAt,
      lastDeliveryAt: e.lastDeliveryAt ?? null,
      lastStatus: e.lastStatus ?? null,
      failures: e.failures,
      recent: (byEndpoint.get(String(e._id)) ?? []).map((d) => ({
        id: String(d._id),
        event: d.event,
        status: d.status,
        attempts: d.attempts,
        responseStatus: d.responseStatus ?? null,
        error: d.lastError ?? null,
        createdAt: d.createdAt,
        deliveredAt: d.deliveredAt ?? null,
      })),
    })),
  });
}

export async function POST(req: NextRequest) {
  let user: PanelUser;
  try {
    user = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { url?: string; events?: string[] };
  const url = validUrl(body.url ?? "");
  if (!url) return NextResponse.json({ error: "Informe uma URL http(s) válida" }, { status: 400 });
  const events = (body.events ?? []).filter(isEventType).filter((e) => e !== "teste.ping");
  if (events.length === 0) {
    return NextResponse.json({ error: "Escolha ao menos um evento" }, { status: 400 });
  }

  await dbConnect();
  const secret = generateWebhookSecret();
  const created = await WaWebhookEndpoint.create({
    url: url.toString(),
    secret,
    events,
    createdBy: user.email,
  });

  // O segredo volta uma vez só — é com ele que o cliente valida a assinatura.
  return NextResponse.json({
    id: String(created._id),
    url: created.url,
    events,
    secret,
    createdAt: created.createdAt,
  });
}
