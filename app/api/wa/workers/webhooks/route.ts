// Reentrega dos webhooks que falharam — cron a cada 5 minutos.
//
// A entrega normal acontece logo depois da resposta da requisição que gerou o
// evento; o que não passou fica pendente com backoff (1 min, 5 min, 30 min,
// 2 h) e é este worker que tenta de novo.

import { NextRequest, NextResponse } from "next/server";
import { processPendingDeliveries } from "@wa/lib/webhooks";

export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await processPendingDeliveries();
  return NextResponse.json(result);
}
