// Colunas do funil de quem está operando (a loja ou o CNV).
//   GET  → colunas em ordem, se quem pede pode editar e se falta coluna padrão
//   POST { acao: "criar", name, color, type, eventoMeta? } → coluna nova no fim
//   POST { acao: "restaurar" } → recria as colunas padrão que foram apagadas
// Ver as colunas é de quem usa o funil; mexer nelas, só de gestor.

import { NextRequest, NextResponse } from "next/server";
import { requireScope, requireScopeAdmin, scopeError, type Scope } from "@wa/lib/scope";
import {
  FunilError,
  colunasDo,
  criarColuna,
  faltamColunasPadrao,
  restaurarColunasPadrao,
} from "@wa/lib/funil";

export const dynamic = "force-dynamic";

function falha(err: unknown) {
  if (err instanceof FunilError) return NextResponse.json({ error: err.message }, { status: err.status });
  const { error, status } = scopeError(err);
  return NextResponse.json({ error }, { status });
}

export async function GET() {
  let scope: Scope;
  try {
    scope = await requireScope("funil");
  } catch (err) {
    return falha(err);
  }
  const colunas = await colunasDo(scope.tenantId);
  return NextResponse.json({
    colunas,
    podeEditar: scope.role === "admin",
    faltamPadrao: faltamColunasPadrao(colunas),
  });
}

export async function POST(req: NextRequest) {
  let scope: Scope;
  try {
    scope = await requireScopeAdmin("funil");
  } catch (err) {
    return falha(err);
  }
  const body = (await req.json().catch(() => ({}))) as {
    acao?: string;
    name?: unknown;
    color?: unknown;
    type?: unknown;
    /** Evento para a Meta (um nome da API de Conversões ou null). Conferido
     *  em wa/lib/funil.ts. */
    eventoMeta?: unknown;
  };
  try {
    if (body.acao === "restaurar") {
      await restaurarColunasPadrao(scope.tenantId);
    } else if (body.acao === "criar") {
      await criarColuna(scope.tenantId, body);
    } else {
      return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
    }
  } catch (err) {
    return falha(err);
  }
  const colunas = await colunasDo(scope.tenantId);
  return NextResponse.json({ colunas, faltamPadrao: faltamColunasPadrao(colunas) });
}
