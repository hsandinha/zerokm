// Importação — passo 2: um lote de linhas cruas.
//
// O browser fatia o arquivo porque uma planilha inteira de uma vez estoura o
// limite de body da Vercel. Cada lote é idempotente: reenviar um lote que
// falhou atualiza, não duplica.

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@wa/lib/auth";
import dbConnect from "@/lib/mongodb";
import { WaImport } from "@wa/models/base";
import { ingestRows } from "@wa/lib/audience/ingest";
import { applyMapping } from "@wa/lib/audience/mapping";
import type { ColumnMapping } from "@wa/lib/audience/types";

export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    rows?: Array<Record<string, string>>;
    firstLine?: number;
  };
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: "Lote vazio" }, { status: 400 });
  }

  await dbConnect();
  const record = await WaImport.findById(id).lean();
  if (!record) return NextResponse.json({ error: "Importação não encontrada" }, { status: 404 });

  const mapping = (record.mapping ?? {}) as ColumnMapping;
  const firstLine = body.firstLine ?? 2;

  try {
    const result = await ingestRows(
      id,
      body.rows.map((raw, i) => ({
        line: firstLine + i,
        raw,
        row: applyMapping(raw, mapping),
      })),
      { source: record.kind === "cnpja" ? "cnpja" : "csv" },
    );
    return NextResponse.json({ result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao importar o lote" },
      { status: 500 },
    );
  }
}
