// Notas internas da conversa: só a equipe vê, nunca saem para o cliente e
// ficam fora do histórico que a IA lê (wa/models/atendimento.ts).

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireScope, scopeError, type Scope } from "@wa/lib/scope";
import { WaNote } from "@wa/models/atendimento";
import { conversaDoEscopo } from "@wa/lib/central";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  let user: Scope;
  try {
    user = await requireScope();
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
  const { id } = await params;
  const conv = await conversaDoEscopo(user, id);
  if (!conv) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { text?: string };
  const text = (body.text ?? "").trim().slice(0, 4000);
  if (!text) return NextResponse.json({ error: "Nota vazia" }, { status: 400 });

  const note = await WaNote.create({
    conversationId: conv._id,
    tenantId: user.tenantId,
    authorEmail: user.email,
    authorName: user.name ?? undefined,
    text,
  });
  return NextResponse.json({
    note: {
      id: String(note._id),
      authorEmail: note.authorEmail,
      authorName: note.authorName ?? null,
      text: note.text,
      createdAt: note.createdAt,
    },
  });
}

/** Apaga a própria nota (o gestor apaga qualquer uma da loja). */
export async function DELETE(req: NextRequest, { params }: Params) {
  let user: Scope;
  try {
    user = await requireScope();
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
  const { id } = await params;
  const noteId = req.nextUrl.searchParams.get("nota");
  if (!noteId || !mongoose.isValidObjectId(noteId)) {
    return NextResponse.json({ error: "Nota não encontrada" }, { status: 404 });
  }
  const conv = await conversaDoEscopo(user, id);
  if (!conv) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  const r = await WaNote.deleteOne({
    _id: noteId,
    conversationId: conv._id,
    tenantId: user.tenantId,
    ...(user.role === "admin" ? {} : { authorEmail: user.email }),
  });
  if (!r.deletedCount) return NextResponse.json({ error: "Nota não encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
