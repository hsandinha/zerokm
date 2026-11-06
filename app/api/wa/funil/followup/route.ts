// Follow-up automático de cada coluna do funil de quem opera (chave = id da
// coluna). O quadro usa para o sino no cabeçalho e para abrir o modal.

import { NextResponse } from "next/server";
import { requireRecurso, requireScope, scopeError, type Scope } from "@wa/lib/scope";
import { followupsDoDono } from "@wa/lib/funil";

export const dynamic = "force-dynamic";

export async function GET() {
  let scope: Scope;
  try {
    scope = await requireScope("funil");
    requireRecurso(scope, "automacoes");
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json({ followups: await followupsDoDono(scope.tenantId), podeEditar: scope.role === "admin" });
}
