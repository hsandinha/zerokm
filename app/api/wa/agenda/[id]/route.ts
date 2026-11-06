// Editar um agendamento: remarcar, confirmar, marcar realizado/faltou,
// cancelar, trocar o responsável ou o carro. Mudou o dia ou a hora, o
// lembrete da véspera volta a valer para o horário novo. Entrar num horário
// lotado ou fora do horário de visita volta 409 (`conflito`) até a tela
// reenviar com `forcar: true`, como na criação.

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { WaAgendamento } from "@wa/models/agenda";
import { WaContact } from "@wa/models/wa";
import { requireScope, sameTenant, scopeError, type Scope } from "@wa/lib/scope";
import { conversaDoEscopo } from "@wa/lib/central";
import { ocupaVaga, validarAgendamento } from "@wa/lib/agenda";
import { carroDaLoja, conflitoNaAgenda, serializarAgendamento } from "@wa/lib/agenda-server";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  let scope: Scope;
  try {
    scope = await requireScope("agenda");
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Agendamento não encontrado" }, { status: 404 });
  await dbConnect();
  const doc = await WaAgendamento.findById(id);
  if (!doc || !sameTenant(scope, doc)) return NextResponse.json({ error: "Agendamento não encontrado" }, { status: 404 });

  const body = ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  const { data, errors } = validarAgendamento(body, true);
  if (errors.length) return NextResponse.json({ error: errors.join(" "), errors }, { status: 400 });

  // Só confere quando o agendamento passa a ocupar outro horário (ou volta a
  // ocupar, como reabrir um cancelado): confirmar ou trocar o responsável não.
  const inicio = data.inicio ?? doc.inicio;
  const duracaoMin = data.duracaoMin ?? doc.duracaoMin;
  const status = data.status ?? doc.status;
  const mudaNaAgenda =
    inicio.getTime() !== doc.inicio.getTime() || duracaoMin !== doc.duracaoMin || !ocupaVaga(doc.status);
  if (ocupaVaga(status) && mudaNaAgenda && body.forcar !== true) {
    const conflito = await conflitoNaAgenda({ tenantId: doc.tenantId ?? null, inicio, duracaoMin, exceto: String(doc._id) });
    if (conflito) return NextResponse.json({ error: conflito.texto, conflito: conflito.motivo }, { status: 409 });
  }

  if (data.inicio && data.inicio.getTime() !== doc.inicio.getTime()) {
    doc.inicio = data.inicio;
    doc.horarioAproximado = false;
    doc.set("lembrete", { em: null, via: null, erro: null });
  }
  if (data.tipo) doc.tipo = data.tipo;
  if (data.duracaoMin) doc.duracaoMin = data.duracaoMin;
  if (data.status && data.status !== doc.status) {
    doc.status = data.status;
    if (data.status === "confirmado") {
      doc.confirmadoEm = new Date();
      // Confirmar é combinar o horário com o cliente: deixa de ser aproximado.
      doc.horarioAproximado = false;
    }
  }
  if (data.responsavel !== undefined) doc.responsavel = data.responsavel;
  if (data.observacao !== undefined) doc.observacao = data.observacao;
  if (data.contatoNome !== undefined) doc.contatoNome = data.contatoNome;
  if (data.contatoTelefone !== undefined) doc.contatoTelefone = data.contatoTelefone;
  if (data.veiculo !== undefined) doc.veiculo = data.veiculo;
  if (data.veiculoId !== undefined) {
    if (data.veiculoId) {
      const carro = await carroDaLoja(scope.tenantId, data.veiculoId);
      if (!carro) return NextResponse.json({ error: "Carro não encontrado no pátio" }, { status: 404 });
      doc.veiculoId = carro._id;
      if (!data.veiculo) doc.veiculo = [carro.marca, carro.modelo, carro.versao, carro.ano].filter(Boolean).join(" ");
    } else {
      doc.veiculoId = null;
    }
  }
  if (data.conversationId !== undefined) {
    if (data.conversationId) {
      const conv = await conversaDoEscopo(scope, data.conversationId);
      if (!conv) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
      doc.conversationId = conv._id as mongoose.Types.ObjectId;
      doc.contactId = conv.contactId;
      if (!doc.contatoNome) {
        const contato = await WaContact.findById(conv.contactId).select("name").lean();
        doc.contatoNome = contato?.name ?? null;
      }
    } else {
      doc.conversationId = null;
      doc.contactId = null;
    }
  }
  if (!doc.conversationId && !doc.contatoNome) {
    return NextResponse.json({ error: "Escolha a conversa ou escreva o nome do cliente." }, { status: 400 });
  }
  await doc.save();
  return NextResponse.json(serializarAgendamento(doc));
}
