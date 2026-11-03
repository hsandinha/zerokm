// Editar ou tirar do pátio um carro do estoque local do lojista.

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import RepasseVehicle from "@/models/RepasseVehicle";
import { serializeRepasse, validateRepasse } from "@/lib/utils/repasse";
import { lojistaDoEscopo } from "@wa/lib/estoque-local";

type Params = { params: Promise<{ id: string }> };

async function carroDoLojista(id: string) {
  const { lojistaId } = await lojistaDoEscopo(true);
  if (!mongoose.isValidObjectId(id)) return null;
  await dbConnect();
  return RepasseVehicle.findOne({ _id: id, lojistaId, ativo: true });
}

function erro(err: unknown) {
  const status = (err as { status?: number }).status ?? 401;
  return NextResponse.json({ error: err instanceof Error ? err.message : "Não autorizado" }, { status });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  let doc;
  try {
    doc = await carroDoLojista(id);
  } catch (err) {
    return erro(err);
  }
  if (!doc) return NextResponse.json({ error: "Carro não encontrado" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { data, errors } = validateRepasse(body, true);
  if (errors.length) return NextResponse.json({ error: errors.join(" "), errors }, { status: 400 });
  doc.set(data);
  await doc.save();
  return NextResponse.json(serializeRepasse(doc));
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  let doc;
  try {
    doc = await carroDoLojista(id);
  } catch (err) {
    return erro(err);
  }
  if (!doc) return NextResponse.json({ error: "Carro não encontrado" }, { status: 404 });
  // Vendeu ou desistiu: sai do pátio, fica no histórico (igual ao repasse).
  doc.ativo = false;
  doc.removidoEm = new Date();
  await doc.save();
  return NextResponse.json({ ok: true });
}
