// Revogar chave: ela para de funcionar na hora, mas fica na lista com a data.

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@wa/lib/auth";
import dbConnect from "@/lib/mongodb";
import { WaApiKey } from "@wa/models/panel";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
  }
  const { id } = await params;
  await dbConnect();
  await WaApiKey.updateOne({ _id: id, revokedAt: null }, { revokedAt: new Date() });
  return NextResponse.json({ ok: true });
}
