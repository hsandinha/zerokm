// Etiquetas da loja: a lista (com quantas conversas cada uma tem) para a
// Central e a criação, que é da gestão. Aplicar e tirar numa conversa é de
// quem atende: /api/wa/conversations/[id]/etiquetas.

import { NextRequest, NextResponse } from "next/server";
import { requireScope, requireScopeAdmin, scopeError, tenantFilter, type Scope } from "@wa/lib/scope";
import dbConnect from "@/lib/mongodb";
import { WaEtiqueta } from "@wa/models/central";
import { MAX_ETIQUETAS, lerEtiqueta } from "@wa/lib/etiquetas";
import { etiquetasComContagem } from "@wa/lib/central-etiquetas";

export const dynamic = "force-dynamic";

export async function GET() {
  let scope: Scope;
  try {
    scope = await requireScope();
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
  await dbConnect();
  return NextResponse.json({
    etiquetas: await etiquetasComContagem(scope.tenantId),
    podeEditar: scope.role === "admin",
  });
}

export async function POST(req: NextRequest) {
  let scope: Scope;
  try {
    scope = await requireScopeAdmin();
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
  const lida = lerEtiqueta(await req.json().catch(() => ({})));
  if (!lida.ok) return NextResponse.json({ error: lida.error }, { status: 400 });

  await dbConnect();
  if ((await WaEtiqueta.countDocuments(tenantFilter(scope))) >= MAX_ETIQUETAS) {
    return NextResponse.json({ error: `A loja já tem ${MAX_ETIQUETAS} etiquetas. Apague alguma antes.` }, { status: 409 });
  }
  try {
    const doc = await WaEtiqueta.create({ ...tenantFilter(scope), ...lida.data, createdBy: scope.email });
    return NextResponse.json({ etiqueta: { id: String(doc._id), nome: doc.nome, cor: doc.cor, conversas: 0 } });
  } catch (err) {
    if ((err as { code?: number })?.code === 11000) {
      return NextResponse.json({ error: "Já existe uma etiqueta com esse nome." }, { status: 409 });
    }
    throw err;
  }
}
