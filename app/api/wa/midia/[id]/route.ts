// Link público da mídia de saída (wa/lib/midia-saida.ts). Quem baixa é a
// Meta, sem sessão: a assinatura no `?t=` é a autorização.

import { NextRequest, NextResponse } from "next/server";
import { assinaturaConfere, lerMidiaSaida } from "@wa/lib/midia-saida";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!assinaturaConfere(id, req.nextUrl.searchParams.get("t"))) {
    return NextResponse.json({ error: "Link inválido" }, { status: 403 });
  }
  const midia = await lerMidiaSaida(id);
  if (!midia) return NextResponse.json({ error: "Arquivo vencido ou inexistente" }, { status: 404 });

  const nome = (midia.filename ?? "arquivo").replace(/[^\w.\- ]+/g, "_");
  // Foto, vídeo e áudio abrem no navegador; o resto baixa. E nada aqui roda
  // como página do site, mesmo que um arquivo antigo tenha outro tipo.
  const abre = /^(image\/(jpeg|png)|video\/|audio\/)/.test(midia.mime);
  return new NextResponse(new Uint8Array(midia.data.buffer, midia.data.byteOffset, midia.data.byteLength), {
    headers: {
      "Content-Type": midia.mime,
      "Content-Disposition": `${abre ? "inline" : "attachment"}; filename="${nome}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
