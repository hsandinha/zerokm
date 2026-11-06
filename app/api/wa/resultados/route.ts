// Resultados do atendimento (toda a equipe vê) e desempenho por pessoa (só o
// gestor). Período por ?periodo=hoje|7d|30d|mes|mes_passado|datas&de=&ate=
// (datas no dia de Brasília, "YYYY-MM-DD"). Tudo filtrado pela loja do
// escopo; o painel do CNV também responde (tenantId null).

import { NextRequest, NextResponse } from "next/server";
import { requireScope, scopeError, type Scope } from "@wa/lib/scope";
import { isPeriodo, intervaloDoPeriodo } from "@wa/lib/periodo";
import { desempenhoDaEquipe, resultadosDaLoja } from "@wa/lib/resultados";
import { equipeDoEscopo } from "@wa/lib/central";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  let scope: Scope;
  try {
    scope = await requireScope();
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }

  const sp = req.nextUrl.searchParams;
  const id = sp.get("periodo");
  const periodo = intervaloDoPeriodo(isPeriodo(id) ? id : "7d", { de: sp.get("de"), ate: sp.get("ate") });
  const gestor = scope.role === "admin";

  try {
    const [resultados, desempenho] = await Promise.all([
      resultadosDaLoja(scope.tenantId, periodo),
      gestor
        ? equipeDoEscopo(scope).then((equipe) => desempenhoDaEquipe(scope.tenantId, periodo, equipe))
        : Promise.resolve(null),
    ]);
    return NextResponse.json({ gestor, resultados, desempenho });
  } catch (err) {
    console.error("[resultados]", err);
    return NextResponse.json({ error: "Falha ao calcular os resultados" }, { status: 500 });
  }
}
