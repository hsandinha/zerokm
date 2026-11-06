// Tirar uma foto de um carro do pátio (sai da lista e o arquivo é apagado).

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import RepasseVehicle from "@/models/RepasseVehicle";
import { lojistaDoEscopo } from "@wa/lib/estoque-local";
import { apagarFotosEstoque } from "@wa/lib/foto-estoque";
import { scopeError } from "@wa/lib/scope";

type Params = { params: Promise<{ id: string; fotoId: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id, fotoId } = await params;
  let ctx;
  try {
    ctx = await lojistaDoEscopo(true);
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
  if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(fotoId)) {
    return NextResponse.json({ error: "Foto não encontrada" }, { status: 404 });
  }
  await dbConnect();
  const r = await RepasseVehicle.updateOne(
    { _id: id, lojistaId: ctx.lojistaId, ativo: true, fotos: new mongoose.Types.ObjectId(fotoId) },
    { $pull: { fotos: new mongoose.Types.ObjectId(fotoId) } },
  );
  if (r.matchedCount !== 1) return NextResponse.json({ error: "Foto não encontrada" }, { status: 404 });
  await apagarFotosEstoque({ tenantId: ctx.tenantId, veiculoId: id, ids: [fotoId] });
  return NextResponse.json({ ok: true });
}
