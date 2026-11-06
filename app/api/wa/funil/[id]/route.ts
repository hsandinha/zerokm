// Uma coluna do funil (só gestor).
//   PATCH { name?, color?, type?, eventoMeta? } → renomeia, muda a cor, o tipo
//     ou o evento que volta para o anúncio (um nome da Meta ou null)
//   PATCH { mover: "esquerda" | "direita" } → troca de lugar com a vizinha
//   DELETE → apaga; os cartões voltam para a coluna da etapa deles

import { NextRequest, NextResponse } from "next/server";
import { requireScopeAdmin, scopeError, type Scope } from "@wa/lib/scope";
import {
  FunilError,
  apagarColuna,
  colunasDo,
  editarColuna,
  faltamColunasPadrao,
  moverColuna,
} from "@wa/lib/funil";

export const dynamic = "force-dynamic";

function falha(err: unknown) {
  if (err instanceof FunilError) return NextResponse.json({ error: err.message }, { status: err.status });
  const { error, status } = scopeError(err);
  return NextResponse.json({ error }, { status });
}

async function gestor(): Promise<Scope | NextResponse> {
  try {
    return await requireScopeAdmin("funil");
  } catch (err) {
    return falha(err);
  }
}

async function resposta(tenantId: string | null) {
  const colunas = await colunasDo(tenantId);
  return NextResponse.json({ colunas, faltamPadrao: faltamColunasPadrao(colunas) });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await gestor();
  if (scope instanceof NextResponse) return scope;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    name?: unknown;
    color?: unknown;
    type?: unknown;
    eventoMeta?: unknown;
    mover?: unknown;
  };
  try {
    if (body.mover === "esquerda" || body.mover === "direita") {
      await moverColuna(scope.tenantId, id, body.mover);
    } else {
      await editarColuna(scope.tenantId, id, body);
    }
  } catch (err) {
    return falha(err);
  }
  return resposta(scope.tenantId);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await gestor();
  if (scope instanceof NextResponse) return scope;
  const { id } = await params;
  try {
    await apagarColuna(scope.tenantId, id);
  } catch (err) {
    return falha(err);
  }
  return resposta(scope.tenantId);
}
