// Worker dos eventos para a Meta (API de Conversões): cron a cada 10 minutos.
//
// O evento sai na hora em que o cartão entra na coluna; aqui volta só o que
// falhou (com espera crescente e tentativas limitadas) e o que ficou preso
// numa reserva. Depois de 7 dias a Meta recusa: o registro desiste. As
// regras estão em wa/lib/conversoes-meta-servidor.ts.

import { NextRequest, NextResponse } from "next/server";
import { reenviarEventosMeta } from "@wa/lib/conversoes-meta-servidor";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Folga para terminar antes do limite da função: o que sobrar sai na próxima.
  return NextResponse.json(await reenviarEventosMeta({ max: 100, prazoMs: 90_000 }));
}
