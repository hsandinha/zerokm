// Worker do follow-up por coluna do funil: cron a cada 15 minutos.
//
// As regras (quem recebe, texto ou template, a contagem) estão em
// wa/lib/funil-followup.ts. Aqui só a autorização do cron e o teto da rodada.

import { NextRequest, NextResponse } from "next/server";
import { runFunilFollowups } from "@wa/lib/funil-followup";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Folga para terminar antes do limite da função: o que sobrar sai na próxima.
  const res = await runFunilFollowups({ maxEnvios: 25, prazoMs: 240_000 });
  return NextResponse.json(res);
}
