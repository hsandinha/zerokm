// Respostas rápidas da Central: textos prontos da loja (ou do CNV).
// Todo mundo da equipe usa; só o gestor cria, edita e apaga.

import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireScope, requireScopeAdmin, scopeError, tenantFilter } from "@wa/lib/scope";
import { WaQuickReply } from "@wa/models/atendimento";
import { lerResposta, respostaParaTela } from "@wa/lib/respostas";

export const dynamic = "force-dynamic";

const LIMITE_POR_LOJA = 300;

export async function GET() {
  let scope;
  try {
    scope = await requireScope();
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
  await dbConnect();
  const lista = await WaQuickReply.find(tenantFilter(scope))
    .sort({ category: 1, title: 1 })
    .limit(LIMITE_POR_LOJA)
    .lean();
  return NextResponse.json({
    respostas: lista.map(respostaParaTela),
    podeEditar: scope.role === "admin",
  });
}

export async function POST(req: NextRequest) {
  let scope;
  try {
    scope = await requireScopeAdmin();
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
  const lido = lerResposta((await req.json().catch(() => ({}))) as Record<string, unknown>);
  if (!lido.ok) return NextResponse.json({ error: lido.error }, { status: 400 });

  await dbConnect();
  if ((await WaQuickReply.countDocuments(tenantFilter(scope))) >= LIMITE_POR_LOJA) {
    return NextResponse.json({ error: `Limite de ${LIMITE_POR_LOJA} respostas rápidas.` }, { status: 400 });
  }
  try {
    const doc = await WaQuickReply.create({ ...lido.data, ...tenantFilter(scope), createdBy: scope.email });
    return NextResponse.json({ resposta: respostaParaTela(doc) });
  } catch (err) {
    if ((err as { code?: number })?.code === 11000) {
      return NextResponse.json({ error: `Já existe uma resposta com o atalho /${lido.data.shortcut}.` }, { status: 409 });
    }
    throw err;
  }
}
