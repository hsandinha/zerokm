// Follow-up automático de uma coluna do funil (só gestor).
//   PUT { ativo, horas, maximo, modo, texto, template, templateIdioma, templateVars }
// A conferência é a de wa/lib/automacoes.ts (normalizarFollowup): ligado sem
// texto, ou com 24h ou mais sem template, volta com o motivo.

import { NextRequest, NextResponse } from "next/server";
import { requireRecurso, requireScopeAdmin, scopeError, type Scope } from "@wa/lib/scope";
import { FunilError, salvarFollowupDaColuna } from "@wa/lib/funil";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let scope: Scope;
  try {
    scope = await requireScopeAdmin("funil");
    requireRecurso(scope, "automacoes");
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const followup = await salvarFollowupDaColuna(scope.tenantId, id, body);
    return NextResponse.json({ ok: true, followup });
  } catch (err) {
    if (err instanceof FunilError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
