// Editar, concluir (ou reabrir) e excluir uma tarefa da equipe.

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { WaTarefa } from "@wa/models/tarefa";
import { WaContact } from "@wa/models/wa";
import { requireScope, sameTenant, scopeError, type Scope } from "@wa/lib/scope";
import { conversaDoEscopo } from "@wa/lib/central";
import { serializarTarefa, validarTarefa } from "@wa/lib/tarefas";

type Params = { params: Promise<{ id: string }> };

async function tarefaDoEscopo(req: NextRequest, params: Params["params"]) {
  let scope: Scope;
  try {
    scope = await requireScope("agenda");
  } catch (err) {
    const { error, status } = scopeError(err);
    return { resposta: NextResponse.json({ error }, { status }) } as const;
  }
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) {
    return { resposta: NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 }) } as const;
  }
  await dbConnect();
  const doc = await WaTarefa.findById(id);
  if (!doc || !sameTenant(scope, doc)) {
    return { resposta: NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 }) } as const;
  }
  return { scope, doc } as const;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const r = await tarefaDoEscopo(req, params);
  if ("resposta" in r) return r.resposta;
  const { scope, doc } = r;
  const body = ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  const { data, errors } = validarTarefa(body, true);
  if (errors.length) return NextResponse.json({ error: errors.join(" "), errors }, { status: 400 });

  if (data.titulo !== undefined) doc.titulo = data.titulo;
  if (data.descricao !== undefined) doc.descricao = data.descricao;
  if (data.prazo !== undefined) doc.prazo = data.prazo;
  if (data.responsavel !== undefined) doc.responsavel = data.responsavel;
  if (data.feita !== undefined && data.feita !== doc.feita) {
    doc.feita = data.feita;
    doc.feitaEm = data.feita ? new Date() : null;
    doc.feitaPor = data.feita ? scope.email : null;
  }
  if (data.conversationId !== undefined) {
    if (data.conversationId) {
      const conv = await conversaDoEscopo(scope, data.conversationId);
      if (!conv) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
      const contato = await WaContact.findById(conv.contactId).select("name igUsername").lean();
      doc.conversationId = conv._id as mongoose.Types.ObjectId;
      doc.contactId = conv.contactId;
      doc.contatoNome = contato?.name || (contato?.igUsername ? `@${contato.igUsername}` : null);
    } else {
      doc.conversationId = null;
      doc.contactId = null;
      doc.contatoNome = null;
    }
  }
  await doc.save();
  return NextResponse.json(serializarTarefa(doc.toObject()));
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const r = await tarefaDoEscopo(req, params);
  if ("resposta" in r) return r.resposta;
  await r.doc.deleteOne();
  return NextResponse.json({ ok: true });
}
