// Worker das automações da loja (pós-atendimento, pós-venda, aniversário):
// cron a cada 15 minutos.
//
// Quem recebe e como sai: wa/lib/automacoes-servidor.ts. Aqui só a
// autorização do cron e o teto da rodada.

import { NextRequest, NextResponse } from "next/server";
import { runAutomacoes } from "@wa/lib/automacoes-servidor";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const res = await runAutomacoes({ limite: 40, prazoMs: 240_000 });
  return NextResponse.json(res);
}
