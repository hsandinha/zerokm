// "Testar conexão" dos eventos para a Meta (só gestor).
//   POST { datasetId?, token?, testEventCode? } → confere o token e o
//   conjunto de dados na Meta e, com o código de teste, manda um evento de
//   teste. O que vier em branco sai do que está salvo, então dá para testar
//   antes de salvar.

import { NextRequest, NextResponse } from "next/server";
import { requireScopeAdmin, scopeError, tenantFilter, type Scope } from "@wa/lib/scope";
import { testarConexao } from "@wa/lib/conversoes-meta-servidor";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  let scope: Scope;
  try {
    scope = await requireScopeAdmin("funil");
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const { tenantId } = tenantFilter(scope);
  const resultado = await testarConexao(tenantId, {
    datasetId: body.datasetId,
    token: body.token,
    testEventCode: body.testEventCode,
  });
  return NextResponse.json(resultado);
}
