// Anexo pela Central (foto, vídeo, áudio, documento): o arquivo fica em
// wa_midias_saida e a Meta baixa pelo link assinado (wa/lib/midia-saida.ts).
// Mesmas regras do texto: a conversa passa a ser de quem mandou e a IA para.

import { NextRequest, NextResponse } from "next/server";
import { requireScope, scopeError, type Scope } from "@wa/lib/scope";
import { WaContact } from "@wa/models/wa";
import { channelForConversation } from "@wa/lib/channels";
import { MetaApiError } from "@wa/lib/meta";
import { podeMandarLivre, sendAndLogMedia, sendAndLogText } from "@wa/lib/send";
import { MIDIA_MAX_BYTES, MidiaError, linkDaMidia, salvarMidiaSaida } from "@wa/lib/midia-saida";
import { siteUrl } from "@wa/lib/site-url";
import { assumirAoResponder, autorDoEscopo, conversaDoEscopo, wamidCitado } from "@wa/lib/central";

export const maxDuration = 60;

/** Navegador que não informa o tipo (alguns .ogg, .pdf arrastados): pela extensão. */
const MIME_POR_EXTENSAO: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  mp4: "video/mp4",
  "3gp": "video/3gpp",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  amr: "audio/amr",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain",
  csv: "text/csv",
};

function mimeDo(file: File): string {
  const tipo = (file.type || "").split(";")[0].trim().toLowerCase();
  if (tipo && tipo !== "application/octet-stream") return tipo;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_POR_EXTENSAO[ext] ?? (tipo || "application/octet-stream");
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let user: Scope;
  try {
    user = await requireScope();
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
  const { id } = await ctx.params;

  const conv = await conversaDoEscopo(user, id);
  if (!conv) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  const contact = await WaContact.findById(conv.contactId);
  if (!contact) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 });

  const channel = await channelForConversation(conv);
  if (channel.kind !== "whatsapp") {
    return NextResponse.json(
      { error: "Anexo só sai pelo WhatsApp por enquanto. Neste canal, mande o texto." },
      { status: 400 },
    );
  }
  // Antes de gravar o arquivo: fora da janela a Meta recusa de qualquer jeito.
  if (!podeMandarLivre(channel.kind, conv.lastInboundAt)) {
    return NextResponse.json(
      { error: "Fora da janela de 24h do WhatsApp: só template aprovado chega até o cliente responder." },
      { status: 409 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Envie o arquivo no campo file." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Envie o arquivo no campo file." }, { status: 400 });
  }
  if (file.size > MIDIA_MAX_BYTES) {
    return NextResponse.json({ error: "Arquivo acima de 4 MB. Mande um menor ou um link." }, { status: 413 });
  }
  const caption = String(form.get("caption") ?? "").trim().slice(0, 1024) || null;
  const replyTo = await wamidCitado(id, String(form.get("replyToId") ?? "") || null);

  try {
    const { id: midiaId, tipo } = await salvarMidiaSaida({
      tenantId: user.tenantId,
      bytes: Buffer.from(await file.arrayBuffer()),
      mime: mimeDo(file),
      filename: file.name || null,
      createdBy: user.email,
      // Resposta de conversa: o link só precisa valer até a Meta baixar, e a
      // Central mostra o arquivo por ele (30 dias, como a mídia que chega).
      dias: 30,
    });
    await sendAndLogMedia({
      conversationId: id,
      to: contact.phone,
      link: linkDaMidia(siteUrl(req), midiaId),
      type: tipo,
      // Áudio não aceita legenda no WhatsApp: ela vai logo depois, como texto.
      caption: tipo === "audio" ? null : caption,
      filename: tipo === "document" ? file.name || "documento" : null,
      sender: "human",
      replyTo,
      midiaId,
      author: autorDoEscopo(user),
    });
    if (tipo === "audio" && caption) {
      await sendAndLogText({
        conversationId: id,
        to: contact.phone,
        text: caption,
        sender: "human",
        author: autorDoEscopo(user),
      });
    }
  } catch (err) {
    if (err instanceof MidiaError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof MetaApiError) {
      return NextResponse.json({ error: `A Meta recusou o envio: ${err.message}` }, { status: 502 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao enviar o arquivo" },
      { status: 500 },
    );
  }

  await assumirAoResponder(conv, user.email);
  return NextResponse.json({ ok: true });
}
