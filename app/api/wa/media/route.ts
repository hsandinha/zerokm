// Proxy de mídia recebida — baixa da Meta sob demanda pelo media id
// (a mídia fica disponível na Meta por ~30 dias; não persistimos bytes).

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@wa/lib/auth";
import { getWabaCredentials } from "@wa/lib/settings";
import { downloadMedia } from "@wa/lib/meta";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const mediaId = req.nextUrl.searchParams.get("id");
  if (!mediaId) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const creds = await getWabaCredentials();
  if (!creds) return NextResponse.json({ error: "WABA não configurado" }, { status: 400 });

  try {
    const { bytes, contentType } = await downloadMedia(creds, mediaId);
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao baixar mídia" },
      { status: 502 },
    );
  }
}
