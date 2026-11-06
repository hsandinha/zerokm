// Agenda de visita e test drive da loja: listar por período e criar.
//
// GET ?de=AAAA-MM-DD&ate=AAAA-MM-DD (Brasília, `ate` inclusive) &status=...
// POST { tipo, data, hora | inicio, duracaoMin, status, conversationId?,
//        contatoNome?, contatoTelefone?, veiculoId?, veiculo?, responsavel?,
//        observacao?, forcar? }
//
// Horário lotado ou fora do horário de visita da agenda volta 409 com
// `conflito: true`: a tela pergunta e reenvia com `forcar: true` (a equipe
// pode encaixar uma visita a mais de propósito; a IA, não).
//
// Operador usa (cria, confirma, marca realizado); a configuração da agenda é
// do gestor (./config). Tudo filtrado pela loja de quem está operando.

import { NextRequest, NextResponse } from "next/server";
import type mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { WaAgendamento } from "@wa/models/agenda";
import { WaContact } from "@wa/models/wa";
import { requireScope, scopeError, tenantFilter, type Scope } from "@wa/lib/scope";
import { conversaDoEscopo } from "@wa/lib/central";
import { ehStatus, instanteLocal, ocupaVaga, somarDias, validarAgendamento } from "@wa/lib/agenda";
import { carroDaLoja, conflitoNaAgenda, serializarAgendamento } from "@wa/lib/agenda-server";

export const dynamic = "force-dynamic";

const DIA = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  let scope: Scope;
  try {
    scope = await requireScope("agenda");
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
  const sp = req.nextUrl.searchParams;
  const de = sp.get("de") ?? "";
  const ate = sp.get("ate") ?? de;
  if (!DIA.test(de) || !DIA.test(ate) || ate < de) {
    return NextResponse.json({ error: "Período inválido" }, { status: 400 });
  }
  // Até 62 dias por consulta (a lista mostra no máximo um mês e pouco).
  const fim = somarDias(ate, 1) > somarDias(de, 62) ? somarDias(de, 62) : somarDias(ate, 1);
  const status = (sp.get("status") ?? "").split(",").filter(ehStatus);

  await dbConnect();
  const docs = await WaAgendamento.find({
    ...tenantFilter(scope),
    inicio: { $gte: new Date(instanteLocal(de, "00:00")), $lt: new Date(instanteLocal(fim, "00:00")) },
    ...(status.length ? { status: { $in: status } } : {}),
  })
    .sort({ inicio: 1 })
    .limit(1000)
    .lean();
  return NextResponse.json({ agendamentos: docs.map(serializarAgendamento), me: scope.email });
}

export async function POST(req: NextRequest) {
  let scope: Scope;
  try {
    scope = await requireScope("agenda");
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
  const body = ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  const { data, errors } = validarAgendamento(body, false);
  if (errors.length) return NextResponse.json({ error: errors.join(" "), errors }, { status: 400 });

  await dbConnect();
  let conversa: {
    conversationId: mongoose.Types.ObjectId;
    contactId: mongoose.Types.ObjectId;
    nome: string | null;
    telefone: string | null;
  } | null = null;
  if (data.conversationId) {
    const conv = await conversaDoEscopo(scope, data.conversationId);
    if (!conv) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
    const contato = await WaContact.findById(conv.contactId).select("name phone whatsappPhone").lean();
    conversa = {
      conversationId: conv._id as mongoose.Types.ObjectId,
      contactId: conv.contactId,
      nome: contato?.name ?? null,
      telefone: contato?.whatsappPhone || contato?.phone || null,
    };
  }
  const nome = data.contatoNome || conversa?.nome || null;
  if (!nome && !conversa) {
    return NextResponse.json({ error: "Escolha a conversa ou escreva o nome do cliente." }, { status: 400 });
  }

  let veiculo = data.veiculo ?? null;
  let veiculoId: mongoose.Types.ObjectId | null = null;
  if (data.veiculoId) {
    const carro = await carroDaLoja(scope.tenantId, data.veiculoId);
    if (!carro) return NextResponse.json({ error: "Carro não encontrado no pátio" }, { status: 404 });
    veiculoId = carro._id;
    veiculo = veiculo || [carro.marca, carro.modelo, carro.versao, carro.ano].filter(Boolean).join(" ");
  }

  const status = data.status ?? "a_confirmar";
  if (ocupaVaga(status) && body.forcar !== true) {
    const conflito = await conflitoNaAgenda({ tenantId: scope.tenantId, inicio: data.inicio!, duracaoMin: data.duracaoMin ?? 60 });
    if (conflito) return NextResponse.json({ error: conflito.texto, conflito: conflito.motivo }, { status: 409 });
  }

  const doc = await WaAgendamento.create({
    tenantId: scope.tenantId,
    conversationId: conversa?.conversationId ?? null,
    contactId: conversa?.contactId ?? null,
    contatoNome: nome,
    contatoTelefone: data.contatoTelefone || conversa?.telefone || null,
    tipo: data.tipo ?? "visita",
    veiculoId,
    veiculo,
    inicio: data.inicio,
    duracaoMin: data.duracaoMin ?? 60,
    status,
    confirmadoEm: status === "confirmado" ? new Date() : null,
    responsavel: data.responsavel ?? null,
    observacao: data.observacao ?? null,
    origem: "equipe",
    criadoPor: scope.email,
  });
  return NextResponse.json(serializarAgendamento(doc), { status: 201 });
}
