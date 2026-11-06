// Uma foto nova para um carro do pátio. O navegador já reduziu para JPEG de
// ~1600px (wa/lib/foto-no-navegador.ts); aqui confere o tipo pelos bytes, o
// tamanho e o limite de fotos do carro, e põe a foto no fim da lista (a
// ordem e a capa mudam pela edição do carro).

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import RepasseVehicle from "@/models/RepasseVehicle";
import { lojistaDoEscopo } from "@wa/lib/estoque-local";
import { MAX_FOTOS } from "@wa/lib/estoque-ficha";
import { FotoError, apagarFotosEstoque, linkDaFotoEstoque, salvarFotoEstoque } from "@wa/lib/foto-estoque";
import { scopeError } from "@wa/lib/scope";

export const maxDuration = 30;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  let ctx;
  try {
    ctx = await lojistaDoEscopo(true);
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Carro não encontrado" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") return NextResponse.json({ error: "Escolha a foto." }, { status: 400 });

  await dbConnect();
  const carro = await RepasseVehicle.findOne({ _id: id, lojistaId: ctx.lojistaId, ativo: true }).select("fotos").lean();
  if (!carro) return NextResponse.json({ error: "Carro não encontrado" }, { status: 404 });
  if ((carro.fotos?.length ?? 0) >= MAX_FOTOS) {
    return NextResponse.json({ error: `No máximo ${MAX_FOTOS} fotos por carro.` }, { status: 409 });
  }

  let fotoId: string;
  try {
    fotoId = await salvarFotoEstoque({
      tenantId: ctx.tenantId,
      veiculoId: carro._id,
      bytes: Buffer.from(await file.arrayBuffer()),
      width: Number(form?.get("width")) || null,
      height: Number(form?.get("height")) || null,
      createdBy: ctx.scope.email,
    });
  } catch (err) {
    if (err instanceof FotoError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  // O limite é conferido de novo na gravação: dois envios ao mesmo tempo não
  // passam de 15 juntos.
  const r = await RepasseVehicle.updateOne(
    {
      _id: carro._id,
      lojistaId: ctx.lojistaId,
      ativo: true,
      $expr: { $lt: [{ $size: { $ifNull: ["$fotos", []] } }, MAX_FOTOS] },
    },
    { $push: { fotos: new mongoose.Types.ObjectId(fotoId) } },
  );
  if (r.modifiedCount !== 1) {
    await apagarFotosEstoque({ tenantId: ctx.tenantId, veiculoId: carro._id, ids: [fotoId] });
    return NextResponse.json({ error: `No máximo ${MAX_FOTOS} fotos por carro.` }, { status: 409 });
  }
  return NextResponse.json({ id: fotoId, url: linkDaFotoEstoque("", fotoId) }, { status: 201 });
}
