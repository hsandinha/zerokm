// Equipe para quem a conversa pode ser transferida (Central, "Transferir").

import { NextResponse } from "next/server";
import { requireScope, scopeError } from "@wa/lib/scope";
import { equipeDoEscopo } from "@wa/lib/central";

export const dynamic = "force-dynamic";

export async function GET() {
  let scope;
  try {
    scope = await requireScope();
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json({ equipe: await equipeDoEscopo(scope), me: scope.email });
}
