// Importação — passo 3: fecha o registro depois do último lote.

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@wa/lib/auth";
import dbConnect from "@/lib/mongodb";
import { WaImport } from "@wa/models/base";
import { finishImport } from "@wa/lib/audience/ingest";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { error?: string };
  await finishImport(id, body.error);

  await dbConnect();
  const record = await WaImport.findById(id).lean();
  return NextResponse.json({
    import: record
      ? {
          id: String(record._id),
          rowsTotal: record.rowsTotal,
          rowsOk: record.rowsOk,
          rowsError: record.rowsError,
          status: record.status,
        }
      : null,
  });
}
