// Utilidades da API pública (/api/v1): erro padronizado e limites de página.

import { NextResponse } from "next/server";
import { ApiKeyError } from "@wa/lib/api-keys";
import { MetaApiError } from "@wa/lib/meta";
import { OutreachError } from "@wa/lib/outreach";

export function apiError(err: unknown): NextResponse {
  if (err instanceof ApiKeyError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof OutreachError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof MetaApiError) {
    return NextResponse.json({ error: `A Meta recusou: ${err.message}` }, { status: 502 });
  }
  return NextResponse.json(
    { error: err instanceof Error ? err.message : "Erro interno" },
    { status: 500 },
  );
}

export function clampLimit(raw: string | null, fallback = 50, max = 200): number {
  const n = Number(raw ?? fallback);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), max) : fallback;
}
