// Proxy de mídia recebida — baixa da Meta sob demanda pelo media id
// (a mídia fica disponível na Meta por ~30 dias; não persistimos bytes).
// A mídia só sai para quem é da mesma loja da conversa, com o token do canal
// que a recebeu.

import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { WaConversation, WaMessage } from "@wa/models/wa";
import { requireScope, sameTenant, type Scope } from "@wa/lib/scope";
import { channelForConversation } from "@wa/lib/channels";
import { downloadMedia } from "@wa/lib/meta";

export async function GET(req: NextRequest) {
  let scope: Scope;
  try {
    scope = await requireScope();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const mediaId = req.nextUrl.searchParams.get("id");
  if (!mediaId) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  await dbConnect();
  const message = await WaMessage.findOne({ mediaId }).select("conversationId").lean();
  const conv = message
    ? await WaConversation.findById(message.conversationId).select("tenantId channelId").lean()
    : null;
  if (!conv || !sameTenant(scope, conv)) {
    return NextResponse.json({ error: "Mídia não encontrada" }, { status: 404 });
  }
  const creds = (await channelForConversation(conv)).whatsapp;
  if (!creds) return NextResponse.json({ error: "WhatsApp não configurado" }, { status: 400 });

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
