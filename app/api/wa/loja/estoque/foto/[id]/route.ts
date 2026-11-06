// Link público da foto de um carro do pátio (wa/lib/foto-estoque.ts). Quem
// baixa é a Meta, sem sessão, quando a foto vai na conversa; a tela da equipe
// usa o mesmo link. A assinatura no `?t=` é a autorização.

import { NextRequest, NextResponse } from "next/server";
import { assinaturaDaFotoConfere, bytesDaFoto, lerFotoEstoque } from "@wa/lib/foto-estoque";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!assinaturaDaFotoConfere(id, req.nextUrl.searchParams.get("t"))) {
    return NextResponse.json({ error: "Link inválido" }, { status: 403 });
  }
  const foto = await lerFotoEstoque(id);
  if (!foto) return NextResponse.json({ error: "Foto inexistente" }, { status: 404 });

  // Só JPEG e PNG entram (conferidos pelos bytes na gravação). Mesmo assim,
  // nada daqui roda como página do site.
  const mime = /^image\/(jpeg|png)$/.test(foto.mime) ? foto.mime : "application/octet-stream";
  const bytes = bytesDaFoto(foto.data);
  if (!bytes.length) return NextResponse.json({ error: "Foto inexistente" }, { status: 404 });
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `inline; filename="carro-${id}.${mime === "image/png" ? "png" : "jpg"}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      // O conteúdo de um id nunca muda (foto nova é outro id).
      "Cache-Control": "public, max-age=604800, immutable",
    },
  });
}
