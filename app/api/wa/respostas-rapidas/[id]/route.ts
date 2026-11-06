// Editar e apagar uma resposta rápida (só o gestor, só da própria loja).

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { requireScopeAdmin, scopeError, tenantFilter } from "@wa/lib/scope";
import { WaQuickReply } from "@wa/models/atendimento";
import { lerResposta, respostaParaTela } from "@wa/lib/respostas";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  let scope;
  try {
    scope = await requireScopeAdmin();
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Resposta não encontrada" }, { status: 404 });
  const lido = lerResposta((await req.json().catch(() => ({}))) as Record<string, unknown>);
  if (!lido.ok) return NextResponse.json({ error: lido.error }, { status: 400 });

  await dbConnect();
  try {
    const { category, ...resto } = lido.data;
    const doc = await WaQuickReply.findOneAndUpdate(
      { _id: id, ...tenantFilter(scope) },
      category ? { ...resto, category } : { ...resto, $unset: { category: 1 } },
      { new: true },
    );
    if (!doc) return NextResponse.json({ error: "Resposta não encontrada" }, { status: 404 });
    return NextResponse.json({ resposta: respostaParaTela(doc) });
  } catch (err) {
    if ((err as { code?: number })?.code === 11000) {
      return NextResponse.json({ error: `Já existe uma resposta com o atalho /${lido.data.shortcut}.` }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  let scope;
  try {
    scope = await requireScopeAdmin();
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Resposta não encontrada" }, { status: 404 });
  await dbConnect();
  const r = await WaQuickReply.deleteOne({ _id: id, ...tenantFilter(scope) });
  if (!r.deletedCount) return NextResponse.json({ error: "Resposta não encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
