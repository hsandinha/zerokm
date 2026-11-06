// Pôr ou tirar uma etiqueta da conversa. Quem atende pode; a etiqueta
// precisa ser da mesma loja da conversa.

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireScope, scopeError, tenantFilter, type Scope } from "@wa/lib/scope";
import { WaEtiqueta } from "@wa/models/central";
import { WaConversation } from "@wa/models/wa";
import { conversaDoEscopo } from "@wa/lib/central";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let scope: Scope;
  try {
    scope = await requireScope();
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { etiquetaId?: string; aplicar?: boolean };
  const etiquetaId = String(body.etiquetaId ?? "");
  if (!mongoose.isValidObjectId(etiquetaId)) {
    return NextResponse.json({ error: "Etiqueta inválida" }, { status: 400 });
  }

  const conv = await conversaDoEscopo(scope, id);
  if (!conv) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  const etiqueta = await WaEtiqueta.findOne({ _id: etiquetaId, ...tenantFilter(scope) }).select("_id").lean();
  if (!etiqueta) return NextResponse.json({ error: "Etiqueta não encontrada" }, { status: 404 });

  await WaConversation.updateOne(
    { _id: conv._id, ...tenantFilter(scope) },
    body.aplicar === false ? { $pull: { etiquetas: etiqueta._id } } : { $addToSet: { etiquetas: etiqueta._id } },
  );
  const depois = await WaConversation.findById(conv._id).select("etiquetas").lean();
  return NextResponse.json({ ok: true, etiquetas: (depois?.etiquetas ?? []).map(String) });
}
