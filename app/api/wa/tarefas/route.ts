// Tarefas da equipe da loja: listar (abas da tela) e criar.
//
// GET ?filtro=abertas|minhas|atrasadas|feitas|todas
// POST { titulo, descricao?, prazo? (ISO; sem fuso = Brasília), responsavel?, conversationId? }
//
// Qualquer um da equipe cria, edita e conclui (é ferramenta de quem atende).
// Para criar ligada a uma conversa a partir da Central, ver
// /api/wa/conversations/[id]/tarefas.

import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { WaTarefa } from "@wa/models/tarefa";
import { WaContact } from "@wa/models/wa";
import { requireScope, scopeError, tenantFilter, type Scope } from "@wa/lib/scope";
import { conversaDoEscopo } from "@wa/lib/central";
import { criarTarefa, ehFiltroTarefas, filtroDasTarefas, serializarTarefa, validarTarefa } from "@wa/lib/tarefas";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  let scope: Scope;
  try {
    scope = await requireScope("agenda");
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
  const pedido = req.nextUrl.searchParams.get("filtro");
  const filtro = ehFiltroTarefas(pedido) ? pedido : "abertas";
  await dbConnect();
  const base = tenantFilter(scope);
  const agora = new Date();
  const [docs, abertas, minhas, atrasadas] = await Promise.all([
    WaTarefa.find({ ...base, ...filtroDasTarefas(filtro, scope.email, agora) })
      // Abertas: o prazo mais perto primeiro (sem prazo no fim); feitas: as últimas.
      .sort(filtro === "feitas" ? { feitaEm: -1 } : { prazo: 1, createdAt: -1 })
      .limit(500)
      .lean(),
    WaTarefa.countDocuments({ ...base, ...filtroDasTarefas("abertas", scope.email, agora) }),
    WaTarefa.countDocuments({ ...base, ...filtroDasTarefas("minhas", scope.email, agora) }),
    WaTarefa.countDocuments({ ...base, ...filtroDasTarefas("atrasadas", scope.email, agora) }),
  ]);
  // Mongo põe null antes das datas no sort crescente: sem prazo vai para o fim.
  const lista = filtro === "feitas" ? docs : [...docs.filter((d) => d.prazo), ...docs.filter((d) => !d.prazo)];
  return NextResponse.json({
    tarefas: lista.map(serializarTarefa),
    contagem: { abertas, minhas, atrasadas },
    me: scope.email,
  });
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
  const { data, errors } = validarTarefa(body, false);
  if (errors.length) return NextResponse.json({ error: errors.join(" "), errors }, { status: 400 });

  let conversa: { id: unknown; contactId: unknown; nome: string | null } | null = null;
  if (data.conversationId) {
    const conv = await conversaDoEscopo(scope, data.conversationId);
    if (!conv) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
    const contato = await WaContact.findById(conv.contactId).select("name igUsername").lean();
    conversa = {
      id: conv._id,
      contactId: conv.contactId,
      nome: contato?.name || (contato?.igUsername ? `@${contato.igUsername}` : null),
    };
  }
  const doc = await criarTarefa({
    tenantId: scope.tenantId,
    titulo: data.titulo!,
    descricao: data.descricao,
    prazo: data.prazo ?? null,
    responsavel: data.responsavel ?? null,
    conversationId: (conversa?.id as string) ?? null,
    contactId: (conversa?.contactId as string) ?? null,
    contatoNome: conversa?.nome ?? null,
    origem: "equipe",
    criadoPor: scope.email,
  });
  return NextResponse.json(serializarTarefa(doc.toObject()), { status: 201 });
}
