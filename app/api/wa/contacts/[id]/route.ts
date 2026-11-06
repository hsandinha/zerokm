// Contato: dossiê completo, a edição da ficha (nome, empresa, e-mail,
// CPF/CNPJ, aniversário, endereço, observações, tipo), o opt-out e apagar.
//
// Apagar segue o Chatrun (deleteUnitContact): qualquer pessoa da equipe apaga
// contato da própria loja, e a conversa e as mensagens dele vão junto
// (wa/lib/contatos-servidor.ts).

import { NextRequest, NextResponse } from "next/server";
import { requireScope, sameTenant, scopeError, type Scope } from "@wa/lib/scope";
import dbConnect from "@/lib/mongodb";
import { WaContact, WaConversation } from "@wa/models/wa";
import { getDossier } from "@wa/lib/dossier";
import { emitEvent } from "@wa/lib/webhooks";
import { colunasDo } from "@wa/lib/funil";
import { colunaDoCartao } from "@wa/lib/stages";
import { normalizarFicha } from "@wa/lib/contatos";
import { ContatoError, apagarContato } from "@wa/lib/contatos-servidor";
import { sincronizarOptOutNoGateway } from "@wa/lib/chatrun-bloqueio";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  let scope: Scope;
  try {
    scope = await requireScope();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  await dbConnect();
  const contact = await WaContact.findById(id).catch(() => null);
  if (!contact || !sameTenant(scope, contact)) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 });

  const [conversation, dossier, colunas] = await Promise.all([
    WaConversation.findOne({ contactId: contact._id }).lean(),
    // O dossiê é do CNV (cadastro, assinatura e cobranças na plataforma):
    // a loja não vê os dados de quem tem o mesmo telefone lá.
    scope.tenantId ? Promise.resolve(null) : getDossier(contact),
    colunasDo(scope.tenantId),
  ]);
  const coluna = conversation
    ? colunaDoCartao(
        { stage: conversation.stage, stageId: conversation.stageId ? String(conversation.stageId) : null },
        colunas,
      )
    : null;

  return NextResponse.json({
    contact: {
      id: String(contact._id),
      phone: contact.phone,
      name: contact.name ?? null,
      email: contact.email ?? null,
      document: contact.document ?? null,
      company: contact.company ?? null,
      city: contact.city ?? null,
      state: contact.state ?? null,
      cnae: contact.cnae ?? null,
      tipo: contact.tipo ?? "cliente",
      birthDate: contact.birthDate ?? null,
      address: {
        zip: contact.address?.zip ?? null,
        street: contact.address?.street ?? null,
        number: contact.address?.number ?? null,
        complement: contact.address?.complement ?? null,
        district: contact.address?.district ?? null,
      },
      notes: contact.notes ?? null,
      source: contact.source,
      optOut: contact.optOut,
      registered: Boolean(contact.userId || contact.firebaseUid),
      createdAt: contact.createdAt,
    },
    conversation: conversation
      ? {
          id: String(conversation._id),
          status: conversation.status,
          stage: conversation.stage,
          coluna: coluna ? { name: coluna.name, color: coluna.color } : null,
          lastMessageAt: conversation.lastMessageAt ?? null,
        }
      : null,
    dossier,
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  let user: Scope;
  try {
    user = await requireScope();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown> & { optOut?: boolean };

  await dbConnect();
  const contact = await WaContact.findById(id).catch(() => null);
  if (!contact || !sameTenant(user, contact)) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 });

  // O telefone não muda por aqui: é a chave da conversa no WhatsApp.
  const { set, unset, erro } = normalizarFicha(body);
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });

  const optOutMudou = typeof body.optOut === "boolean" && body.optOut !== contact.optOut;
  if (typeof body.optOut === "boolean") set.optOut = body.optOut;

  if (Object.keys(set).length > 0 || unset.length > 0) {
    await WaContact.updateOne(
      { _id: contact._id, tenantId: user.tenantId },
      {
        ...(Object.keys(set).length ? { $set: set } : {}),
        ...(unset.length ? { $unset: Object.fromEntries(unset.map((k) => [k, 1])) } : {}),
      },
    );
  }

  // Instagram/Messenger: o gateway também precisa saber (isca de comentário).
  if (optOutMudou) await sincronizarOptOutNoGateway(contact, Boolean(body.optOut), "painel");

  if (optOutMudou && body.optOut) {
    const conversation = await WaConversation.findOne({ contactId: contact._id });
    await emitEvent(
      "contato.optout",
      { phone: contact.phone, via: `painel (${user.email})` },
      conversation ? { conversationId: String(conversation._id) } : {},
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  let scope: Scope;
  try {
    scope = await requireScope();
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
  const { id } = await params;
  try {
    await apagarContato(scope.tenantId, id);
  } catch (err) {
    if (err instanceof ContatoError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  return NextResponse.json({ ok: true });
}
