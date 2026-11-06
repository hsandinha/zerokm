// Editar (nome, cor) e apagar uma etiqueta da loja. Só a gestão. Apagar tira
// a etiqueta de todas as conversas da loja.

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireScopeAdmin, scopeError, tenantFilter, type Scope } from "@wa/lib/scope";
import dbConnect from "@/lib/mongodb";
import { WaEtiqueta } from "@wa/models/central";
import { WaConversation } from "@wa/models/wa";
import { lerEtiqueta } from "@wa/lib/etiquetas";

type Params = { params: Promise<{ id: string }> };

async function daLoja(scope: Scope, id: string) {
  if (!mongoose.isValidObjectId(id)) return null;
  await dbConnect();
  return WaEtiqueta.findOne({ _id: id, ...tenantFilter(scope) });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  let scope: Scope;
  try {
    scope = await requireScopeAdmin();
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
  const { id } = await params;
  const etiqueta = await daLoja(scope, id);
  if (!etiqueta) return NextResponse.json({ error: "Etiqueta não encontrada" }, { status: 404 });
  const lida = lerEtiqueta(await req.json().catch(() => ({})));
  if (!lida.ok) return NextResponse.json({ error: lida.error }, { status: 400 });
  etiqueta.nome = lida.data.nome;
  etiqueta.chave = lida.data.chave;
  etiqueta.cor = lida.data.cor;
  try {
    await etiqueta.save();
  } catch (err) {
    if ((err as { code?: number })?.code === 11000) {
      return NextResponse.json({ error: "Já existe uma etiqueta com esse nome." }, { status: 409 });
    }
    throw err;
  }
  return NextResponse.json({ etiqueta: { id: String(etiqueta._id), nome: etiqueta.nome, cor: etiqueta.cor } });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  let scope: Scope;
  try {
    scope = await requireScopeAdmin();
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
  const { id } = await params;
  const etiqueta = await daLoja(scope, id);
  if (!etiqueta) return NextResponse.json({ error: "Etiqueta não encontrada" }, { status: 404 });
  await WaConversation.updateMany(
    { ...tenantFilter(scope), etiquetas: etiqueta._id },
    { $pull: { etiquetas: etiqueta._id } },
  );
  await etiqueta.deleteOne();
  return NextResponse.json({ ok: true });
}
