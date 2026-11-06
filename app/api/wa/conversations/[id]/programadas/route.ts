// Mensagens programadas da conversa: a faixa da Central (GET), programar
// (POST) e cancelar ou dispensar o aviso de falha (DELETE ?p=<id>). Quem
// atende programa; a mensagem sai em nome de quem programou.

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireScope, scopeError, tenantFilter, type Scope } from "@wa/lib/scope";
import { WaContact } from "@wa/models/wa";
import { WaProgramada } from "@wa/models/central";
import { channelForConversation } from "@wa/lib/channels";
import { conversaDoEscopo } from "@wa/lib/central";
import { erroAoProgramar, quandoTexto } from "@wa/lib/programadas";
import { ProgramadaError, modeloParaProgramar, programadasDaConversa } from "@wa/lib/programadas-envio";

export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

async function escopo(): Promise<Scope | NextResponse> {
  try {
    return await requireScope();
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const scope = await escopo();
  if (scope instanceof NextResponse) return scope;
  const { id } = await params;
  const conv = await conversaDoEscopo(scope, id);
  if (!conv) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  return NextResponse.json({ programadas: await programadasDaConversa(id) });
}

export async function POST(req: NextRequest, { params }: Params) {
  const scope = await escopo();
  if (scope instanceof NextResponse) return scope;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    texto?: string;
    enviarEm?: string;
    modelo?: { nome?: string; idioma?: string; params?: string[] } | null;
  };
  const conv = await conversaDoEscopo(scope, id);
  if (!conv) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  const contact = await WaContact.findById(conv.contactId).select("optOut").lean();
  const channel = await channelForConversation(conv);

  const texto = String(body.texto ?? "").trim();
  const enviarEm = new Date(String(body.enviarEm ?? ""));
  // Template só existe no WhatsApp: nos outros canais o que vale é a janela.
  let modelo = null;
  try {
    modelo = channel.kind === "whatsapp" ? await modeloParaProgramar(scope.tenantId, body.modelo) : null;
  } catch (err) {
    if (err instanceof ProgramadaError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Não deu para conferir o template agora. Tente de novo." }, { status: 502 });
  }
  const erro = erroAoProgramar({
    kind: channel.kind,
    lastInboundAt: conv.lastInboundAt,
    enviarEm,
    agora: Date.now(),
    texto,
    temModelo: Boolean(modelo),
    optOut: contact?.optOut,
  });
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });

  // Teto por conversa: programar não é disparo em massa.
  const pendentes = await WaProgramada.countDocuments({ conversationId: conv._id, situacao: "programada" });
  if (pendentes >= 10) {
    return NextResponse.json({ error: "Esta conversa já tem 10 mensagens programadas." }, { status: 409 });
  }

  const doc = await WaProgramada.create({
    ...tenantFilter(scope),
    conversationId: conv._id,
    texto,
    enviarEm,
    modelo,
    criadoPor: scope.email,
    criadoPorNome: scope.name ?? null,
  });
  return NextResponse.json({ ok: true, id: String(doc._id), quando: quandoTexto(enviarEm) });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const scope = await escopo();
  if (scope instanceof NextResponse) return scope;
  const { id } = await params;
  const pid = req.nextUrl.searchParams.get("p") ?? "";
  if (!mongoose.isValidObjectId(pid)) return NextResponse.json({ error: "Mensagem não encontrada" }, { status: 404 });
  const conv = await conversaDoEscopo(scope, id);
  if (!conv) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });

  const filtro = { _id: pid, conversationId: conv._id, ...tenantFilter(scope) };
  // Programada: cancela (só se ainda não foi pega pelo worker). Falhou: o
  // "Ok" tira o aviso da faixa.
  const cancelada = await WaProgramada.updateOne({ ...filtro, situacao: "programada" }, { situacao: "cancelada" });
  if (cancelada.modifiedCount > 0) return NextResponse.json({ ok: true });
  const dispensada = await WaProgramada.updateOne({ ...filtro, situacao: "falhou" }, { dispensada: true });
  if (dispensada.modifiedCount > 0) return NextResponse.json({ ok: true });
  return NextResponse.json({ error: "Ela já está saindo ou já saiu." }, { status: 409 });
}
