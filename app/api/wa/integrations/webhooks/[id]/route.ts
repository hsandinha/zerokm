// Ligar/desligar, trocar eventos ou URL, e remover um endpoint.

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@wa/lib/auth";
import dbConnect from "@/lib/mongodb";
import { WaWebhookEndpoint } from "@wa/models/panel";
import { isEventType } from "@wa/lib/events";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
  }
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    enabled?: boolean;
    events?: string[];
    url?: string;
  };

  const patch: Record<string, unknown> = {};
  if (typeof body.enabled === "boolean") {
    patch.enabled = body.enabled;
    // Religar zera o contador de falhas seguidas.
    if (body.enabled) patch.failures = 0;
  }
  if (Array.isArray(body.events)) {
    const events = body.events.filter(isEventType).filter((e) => e !== "teste.ping");
    if (events.length === 0) {
      return NextResponse.json({ error: "Escolha ao menos um evento" }, { status: 400 });
    }
    patch.events = events;
  }
  if (typeof body.url === "string") {
    try {
      const u = new URL(body.url.trim());
      if (!/^https?:$/.test(u.protocol)) throw new Error();
      patch.url = u.toString();
    } catch {
      return NextResponse.json({ error: "URL inválida" }, { status: 400 });
    }
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nada para alterar" }, { status: 400 });
  }

  await dbConnect();
  await WaWebhookEndpoint.updateOne({ _id: id }, patch);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
  }
  const { id } = await params;
  await dbConnect();
  await WaWebhookEndpoint.deleteOne({ _id: id });
  return NextResponse.json({ ok: true });
}
