// Importação de audiência — passo 1: abre o registro e guarda o mapeamento
// confirmado por quem importa. As linhas chegam em lotes no passo 2.

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@wa/lib/auth";
import dbConnect from "@/lib/mongodb";
import { WaImport } from "@wa/models/base";
import type { ColumnMapping } from "@wa/lib/audience/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  await dbConnect();
  const imports = await WaImport.find().sort({ createdAt: -1 }).limit(30).lean();
  return NextResponse.json({
    imports: imports.map((i) => ({
      id: String(i._id),
      kind: i.kind,
      filename: i.filename ?? null,
      rowsTotal: i.rowsTotal,
      rowsOk: i.rowsOk,
      rowsError: i.rowsError,
      status: i.status,
      error: i.error ?? null,
      createdBy: i.createdBy ?? null,
      createdAt: i.createdAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    kind?: "csv" | "cnpja";
    filename?: string;
    mapping?: ColumnMapping;
  };

  await dbConnect();
  const created = await WaImport.create({
    kind: body.kind ?? "csv",
    filename: body.filename,
    mapping: body.mapping,
    createdBy: session.email,
    status: "processing",
  });

  return NextResponse.json({ importId: String(created._id) });
}
