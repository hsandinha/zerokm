// Tarefas ligadas a UMA conversa, para o botão "Criar tarefa" da Central
// (a Central é de outra frente: esta rota fica pronta para ela ligar).
//
// GET  → { tarefas: TarefaDaTela[] }  as abertas desta conversa e as 10
//        últimas feitas, para mostrar no painel do contato.
// POST { titulo, descricao?, prazo?, responsavel? }  → 201 TarefaDaTela
//      prazo em ISO ("2026-11-12T15:00" sem fuso = Brasília, ou só o dia
//      "2026-11-12", que vira 18h). Sem responsável, fica para quem criou.
//
// Exige o recurso "agenda" (Agenda e tarefas) e a conversa da loja de quem
// está operando (403/404 do contrário). Qualquer um da equipe pode.

import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { WaTarefa } from "@wa/models/tarefa";
import { WaContact } from "@wa/models/wa";
import { requireScope, scopeError, type Scope } from "@wa/lib/scope";
import { conversaDoEscopo } from "@wa/lib/central";
import { criarTarefa, serializarTarefa, validarTarefa } from "@wa/lib/tarefas";

type Params = { params: Promise<{ id: string }> };

async function conversa(params: Params["params"]) {
  let scope: Scope;
  try {
    scope = await requireScope("agenda");
  } catch (err) {
    const { error, status } = scopeError(err);
    return { resposta: NextResponse.json({ error }, { status }) } as const;
  }
  const { id } = await params;
  const conv = await conversaDoEscopo(scope, id);
  if (!conv) return { resposta: NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 }) } as const;
  return { scope, conv } as const;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const r = await conversa(params);
  if ("resposta" in r) return r.resposta;
  await dbConnect();
  const [abertas, feitas] = await Promise.all([
    WaTarefa.find({ tenantId: r.scope.tenantId, conversationId: r.conv._id, feita: false }).sort({ prazo: 1 }).limit(50).lean(),
    WaTarefa.find({ tenantId: r.scope.tenantId, conversationId: r.conv._id, feita: true }).sort({ feitaEm: -1 }).limit(10).lean(),
  ]);
  return NextResponse.json({ tarefas: [...abertas, ...feitas].map(serializarTarefa) });
}

export async function POST(req: NextRequest, { params }: Params) {
  const r = await conversa(params);
  if ("resposta" in r) return r.resposta;
  const { scope, conv } = r;
  const body = ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  // A conversa é a da URL: não dá para mandar outra no corpo.
  const { conversationId: _ignorada, ...resto } = body;
  void _ignorada;
  const { data, errors } = validarTarefa(resto, false);
  if (errors.length) return NextResponse.json({ error: errors.join(" "), errors }, { status: 400 });
  await dbConnect();
  const contato = await WaContact.findById(conv.contactId).select("name igUsername").lean();
  const doc = await criarTarefa({
    tenantId: scope.tenantId,
    titulo: data.titulo!,
    descricao: data.descricao,
    prazo: data.prazo ?? null,
    responsavel: data.responsavel ?? scope.email,
    conversationId: String(conv._id),
    contactId: String(conv.contactId),
    contatoNome: contato?.name || (contato?.igUsername ? `@${contato.igUsername}` : null),
    origem: "equipe",
    criadoPor: scope.email,
  });
  return NextResponse.json(serializarTarefa(doc.toObject()), { status: 201 });
}
