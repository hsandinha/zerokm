// Dispara um `teste.ping` para o endpoint e devolve o que aconteceu.

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@wa/lib/auth";
import dbConnect from "@/lib/mongodb";
import { WaWebhookDelivery, WaWebhookEndpoint } from "@wa/models/panel";
import { deliver } from "@wa/lib/webhooks";

export const maxDuration = 30;

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
  }
  const { id } = await params;

  await dbConnect();
  const ep = await WaWebhookEndpoint.findById(id).select("enabled").lean();
  if (!ep) return NextResponse.json({ error: "Endpoint não encontrado" }, { status: 404 });
  if (!ep.enabled) {
    return NextResponse.json({ error: "Ligue o endpoint antes de testar" }, { status: 400 });
  }

  const delivery = await WaWebhookDelivery.create({
    endpointId: id,
    event: "teste.ping",
    payload: {
      event: "teste.ping",
      createdAt: new Date().toISOString(),
      data: { message: "Teste enviado pela tela de Configurações da CNV." },
    },
  });

  const ok = await deliver(String(delivery._id));
  const result = await WaWebhookDelivery.findById(delivery._id)
    .select("responseStatus lastError")
    .lean();
  return NextResponse.json({
    ok,
    status: result?.responseStatus ?? null,
    error: result?.lastError ?? null,
  });
}
