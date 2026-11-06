// Worker das mensagens programadas: cron a cada minuto (vercel.json).
// Manda as que venceram; a regra da janela e o template no lugar ficam em
// wa/lib/programadas-envio.ts.

import { NextRequest, NextResponse } from "next/server";
import { enviarProgramadasVencidas } from "@wa/lib/programadas-envio";

export const maxDuration = 120;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await enviarProgramadasVencidas());
}
