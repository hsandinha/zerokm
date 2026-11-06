// Contatos de quem opera (a loja ou o CNV): busca, filtros, situação no funil
// e opt-out. POST cria o contato à mão.
//
// A busca aceita nome, telefone, e-mail, CNPJ/CPF ou empresa — quem atende
// costuma ter na mão só um desses. Os filtros de tipo (cliente, fornecedor,
// parceiro, outros) e de aniversariantes do mês saem da ficha.

import { NextRequest, NextResponse } from "next/server";
import { requireScope, scopeError, type Scope } from "@wa/lib/scope";
import dbConnect from "@/lib/mongodb";
import { WaCampaignRecipient, WaContact, WaConversation } from "@wa/models/wa";
import { parsePhoneBr } from "@wa/lib/phone";
import { colunasDo } from "@wa/lib/funil";
import { colunaDoCartao } from "@wa/lib/stages";
import { consultaDeContatos, normalizarFicha } from "@wa/lib/contatos";
import { agoraEmBrasilia } from "@wa/lib/automacoes";

export const dynamic = "force-dynamic";

const PAGE = 50;

export async function GET(req: NextRequest) {
  let scope: Scope;
  try {
    scope = await requireScope();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const filtro = sp.get("filtro") ?? "todos";
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const mes = Number(sp.get("mes")) || agoraEmBrasilia().mes;
  const aniversariantes = filtro === "aniversariantes";

  await dbConnect();
  const query = consultaDeContatos(scope.tenantId, { q: sp.get("q"), filtro, tipo: sp.get("tipo"), mes });

  const [contacts, total] = await Promise.all([
    WaContact.find(query)
      // Aniversariantes na ordem do calendário; o resto, quem mexeu por último.
      .sort(aniversariantes ? { birthDay: 1, name: 1 } : { updatedAt: -1 })
      .skip((page - 1) * PAGE)
      .limit(PAGE)
      .lean(),
    WaContact.countDocuments(query),
  ]);

  const ids = contacts.map((c) => c._id);
  const [conversations, campaignCounts] = await Promise.all([
    WaConversation.find({ contactId: { $in: ids } })
      .select("contactId status stage stageId lastMessageAt unreadCount")
      .lean(),
    // Campanhas que de fato chegaram a sair para o número, desta loja: o
    // destinatário pulado (opt-out, variável vazia) também fica gravado.
    WaCampaignRecipient.aggregate<{ _id: string; n: number }>([
      {
        $match: {
          tenantId: scope.tenantId,
          phone: { $in: contacts.map((c) => c.phone) },
          status: { $in: ["sent", "delivered", "read", "replied"] },
        },
      },
      { $group: { _id: "$phone", n: { $sum: 1 } } },
    ]),
  ]);
  const convByContact = new Map(conversations.map((c) => [String(c.contactId), c]));
  // Nome e cor da coluna do funil em que a conversa está (as colunas são do dono).
  const colunas = await colunasDo(scope.tenantId);
  const colunaDe = (conv: { stage: string; stageId?: unknown }) => {
    const col = colunaDoCartao({ stage: conv.stage, stageId: conv.stageId ? String(conv.stageId) : null }, colunas);
    return col ? { name: col.name, color: col.color } : null;
  };
  const campaignsByPhone = new Map(campaignCounts.map((c) => [c._id, c.n]));

  return NextResponse.json({
    contacts: contacts.map((c) => {
      const conv = convByContact.get(String(c._id));
      return {
        id: String(c._id),
        phone: c.phone,
        name: c.name ?? null,
        email: c.email ?? null,
        document: c.document ?? null,
        company: c.company ?? null,
        city: c.city ?? null,
        state: c.state ?? null,
        tipo: c.tipo ?? "cliente",
        birthDate: c.birthDate ?? null,
        source: c.source,
        optOut: c.optOut,
        registered: Boolean(c.userId || c.firebaseUid),
        createdAt: c.createdAt,
        conversation: conv
          ? {
              id: String(conv._id),
              status: conv.status,
              stage: conv.stage,
              coluna: colunaDe(conv),
              lastMessageAt: conv.lastMessageAt ?? null,
              unread: conv.unreadCount ?? 0,
            }
          : null,
        campaigns: campaignsByPhone.get(c.phone) ?? 0,
      };
    }),
    total,
    page,
    pageSize: PAGE,
    mes,
    // A planilha com a base inteira é coisa de gestor.
    podeExportar: scope.role === "admin",
  });
}

/** Contato novo, cadastrado à mão. O telefone é a chave: repetido, avisa
 *  qual contato já tem esse número em vez de criar outro. */
export async function POST(req: NextRequest) {
  let scope: Scope;
  try {
    scope = await requireScope();
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const tel = parsePhoneBr(typeof body.phone === "string" ? body.phone : "");
  if (!tel.valid || !tel.e164) {
    return NextResponse.json(
      { error: `Telefone inválido${tel.reason ? ` (${tel.reason})` : ""}. Use o DDD.` },
      { status: 400 },
    );
  }
  const { set, erro } = normalizarFicha(body);
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });

  await dbConnect();
  const tenantId = scope.tenantId;
  const existente = await WaContact.findOne({ tenantId, phone: tel.e164 }).select("_id name").lean();
  if (existente) {
    return NextResponse.json(
      {
        error: `Esse telefone já é do contato ${existente.name ?? "sem nome"}.`,
        id: String(existente._id),
      },
      { status: 409 },
    );
  }

  const address: Record<string, unknown> = {};
  const raiz: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(set)) {
    if (k.startsWith("address.")) address[k.slice(8)] = v;
    else raiz[k] = v;
  }
  try {
    const contato = await WaContact.create({
      tenantId,
      phone: tel.e164,
      source: "manual",
      tipo: "cliente",
      ...raiz,
      ...(Object.keys(address).length ? { address } : {}),
    });
    return NextResponse.json({ ok: true, id: String(contato._id) }, { status: 201 });
  } catch (err) {
    // O cliente escreveu no mesmo instante e o contato nasceu pelo inbound.
    if ((err as { code?: number })?.code === 11000) {
      return NextResponse.json({ error: "Esse telefone acabou de virar contato. Atualize a lista." }, { status: 409 });
    }
    throw err;
  }
}
