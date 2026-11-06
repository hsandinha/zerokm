// Arquivo do cabeçalho de template (imagem, vídeo ou documento), no escopo da
// loja. Dois usos:
//   - campanha: o arquivo que vai no cabeçalho de todos os envios. Vale 90
//     dias, o tempo de uma campanha agendada e da cadência de follow-up.
//   - amostra: o exemplo que a Meta pede para aprovar um template com mídia.
//     O gateway baixa na hora, então vale poucos dias.
//   - conversa: o cabeçalho de um template mandado pela Central (nova
//     conversa ou reabrir). Qualquer um da equipe pode, como mandar o template.
// Quem baixa é a Meta (ou o gateway), pelo link assinado de /api/wa/midia/[id].

import { NextRequest, NextResponse } from "next/server";
import { requireScope, requireScopeAdmin, scopeError, type Scope } from "@wa/lib/scope";
import { MidiaError, salvarMidiaSaida, tipoDaMidia } from "@wa/lib/midia-saida";

export const maxDuration = 30;

/** Formato do cabeçalho do template para o tipo do arquivo. */
const FORMATO: Record<string, "image" | "video" | "document"> = {
  IMAGE: "image",
  VIDEO: "video",
  DOCUMENT: "document",
};

const NOME: Record<string, string> = { image: "uma imagem JPG ou PNG", video: "um vídeo MP4", document: "um documento PDF" };

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const usoPedido = String(form?.get("uso") ?? "");
  let scope: Scope;
  try {
    scope = usoPedido === "conversa" ? await requireScope() : await requireScopeAdmin("campanhas");
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }

  const file = form?.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Escolha o arquivo." }, { status: 400 });
  }
  const uso = usoPedido === "amostra" ? "amostra" : usoPedido === "conversa" ? "conversa" : "campanha";
  const formato = String(form?.get("formato") ?? "").toUpperCase();
  const mime = file.type || "application/octet-stream";

  // O cabeçalho só aceita o tipo do template: imagem num template de vídeo
  // faria a Meta recusar todos os envios.
  const esperado = FORMATO[formato];
  const tipo = tipoDaMidia(mime);
  if (esperado && tipo !== esperado) {
    return NextResponse.json({ error: `O cabeçalho deste template pede ${NOME[esperado]}.` }, { status: 415 });
  }
  if (tipo === "audio" || !tipo) {
    return NextResponse.json({ error: "Cabeçalho aceita imagem, vídeo ou documento." }, { status: 415 });
  }
  // A amostra do template com documento precisa ser PDF (é o que a Meta aceita).
  if (uso === "amostra" && tipo === "document" && mime !== "application/pdf") {
    return NextResponse.json({ error: "A amostra de documento precisa ser um PDF." }, { status: 415 });
  }

  try {
    const salvo = await salvarMidiaSaida({
      tenantId: scope.tenantId,
      bytes: Buffer.from(await file.arrayBuffer()),
      mime,
      filename: file.name || null,
      createdBy: scope.email,
      dias: uso === "amostra" ? 3 : uso === "conversa" ? 30 : 90,
    });
    return NextResponse.json({ id: salvo.id, tipo: salvo.tipo, filename: file.name || null, mime, size: file.size });
  } catch (err) {
    if (err instanceof MidiaError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
