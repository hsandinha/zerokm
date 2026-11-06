// Worker da fila da equipe (cron da Vercel, 1/min): registra o que entrou na
// fila por um caminho sem gancho (SMS, Vera, ações antigas), fecha os
// atendimentos que voltaram para a IA ou foram encerrados, abre o expediente
// das lojas (a fila da noite é distribuída e avisada quando a loja abre) e
// puxa a fila parada para quem está Online no rodízio. Ver wa/lib/fila.ts.

import { NextRequest, NextResponse } from "next/server";
import { varrerFila } from "@wa/lib/fila";

export const maxDuration = 120;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function rodar() {
  try {
    return NextResponse.json(await varrerFila());
  } catch (err) {
    console.error("[worker/equipe]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "falhou" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return rodar();
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return rodar();
}
