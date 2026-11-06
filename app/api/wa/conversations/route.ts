// Fila da Central: conversas ordenadas pela última mensagem, mais os
// contadores de cada filtro (uma agregação só).
//
// Filtro, busca e paginação são do servidor: filtrar só o que a tela já tinha
// carregado escondia a conversa 301 de "Minhas", do SLA e da busca.

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireScope, type Scope } from "@wa/lib/scope";
import dbConnect from "@/lib/mongodb";
import { WaContact, WaConversation } from "@wa/models/wa";
import { WaChannel } from "@wa/models/channel";
import { channelLabelOf, whatsappChannelOf } from "@wa/lib/channels";
import { conversationCounts } from "@wa/lib/inbox";
import { colunasDo, contarPorColuna, filtroDaColuna, filtroSemColuna } from "@wa/lib/funil";
import { isSlaViolated, type ConversationStatus } from "@wa/lib/stages";
import { slaDaLoja } from "@wa/lib/operacao";
import { etiquetasComContagem } from "@wa/lib/central-etiquetas";
import { iaDaConversa } from "@wa/lib/central";
import { WaAnuncio, type WaOrigem } from "@wa/models/origem";
import { nomeDaOrigem } from "@wa/lib/origem";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  let user: Scope;
  try {
    user = await requireScope();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const filtro = sp.get("status");
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 100, 1), 1000);
  const busca = (sp.get("q") ?? "").trim().slice(0, 80);

  await dbConnect();
  // Meta de primeira resposta da loja (padrão 15 min): filtro, contagem e selo.
  const slaMinutes = await slaDaLoja(user.tenantId);
  const query: Record<string, unknown> = { tenantId: user.tenantId };
  // Cada filtro que usa $or entra aqui, para um não apagar o outro.
  const e: Record<string, unknown>[] = [];
  if (busca) {
    const contactIds = await contatosDaBusca(user.tenantId, busca);
    // Também pelo texto da última mensagem, como a busca fazia antes.
    e.push({ $or: [{ contactId: { $in: contactIds } }, { lastMessagePreview: new RegExp(escapar(busca), "i") }] });
  }
  // Colunas do funil para a barra lateral, o seletor da conversa e o filtro.
  const colunas = await colunasDo(user.tenantId);
  const colunaParam = sp.get("coluna");
  if (colunaParam) {
    const col = colunas.find((c) => c.id === colunaParam);
    const filtroColuna = colunaParam === "sem" ? filtroSemColuna(colunas) : col ? filtroDaColuna(col, colunas) : null;
    // Coluna que não existe mais (ou "sem" sem órfãos): nenhuma conversa.
    e.push(filtroColuna ?? { _id: null });
  }
  // Etiqueta filtrada na barra lateral (id da WaEtiqueta da loja).
  const etiquetaParam = sp.get("etiqueta");
  if (etiquetaParam) {
    e.push(mongoose.isValidObjectId(etiquetaParam) ? { etiquetas: new mongoose.Types.ObjectId(etiquetaParam) } : { _id: null });
  }
  if (e.length) query.$and = e;
  if (filtro === "minhas") {
    query.assignedTo = user.email;
    query.status = { $ne: "closed" };
  } else if (filtro === "sla") {
    query.status = "waiting_human";
    query.waitingSince = { $lt: new Date(Date.now() - slaMinutes * 60_000) };
  } else if (filtro && filtro !== "todas") {
    query.status = filtro;
  }

  const [found, matching, counts, whatsapp, channels, etiquetas, ia] = await Promise.all([
    // Um a mais que o limite: diz se há mais para "Carregar mais".
    WaConversation.find(query).sort({ lastMessageAt: -1, _id: -1 }).limit(limit + 1).lean(),
    WaConversation.countDocuments(query),
    conversationCounts(user.email, slaMinutes, user.tenantId),
    whatsappChannelOf(user.tenantId).catch(() => null),
    // Todos os canais (também os desconectados): a conversa de um canal
    // desligado continua sendo do Messenger/SMS/Instagram na lista.
    WaChannel.find({ tenantId: user.tenantId })
      .select("kind displayPhone displayName igUsername fbPageName smsProvider rcsAgentId status")
      .lean(),
    etiquetasComContagem(user.tenantId),
    // "Devolver à IA" em lote só aparece quando a IA responderia.
    iaDaConversa(user),
  ]);
  const hasMore = found.length > limit;
  const conversations = found.slice(0, limit);
  const contagemColunas = await contarPorColuna(user.tenantId, colunas);
  // Conversa sem canal é do WhatsApp do CNV (anterior aos canais).
  const kindById = new Map(channels.map((ch) => [String(ch._id), ch.kind]));
  const activeChannels = channels.filter((ch) => ch.status !== "disconnected");

  const contacts = await WaContact.find({
    _id: { $in: conversations.map((c) => c.contactId) },
  }).lean();
  const byId = new Map(contacts.map((c) => [String(c._id), c]));
  // Selo de origem na fila: o nome que a gestão deu ao anúncio, se deu.
  const idsDeAnuncio = [
    ...new Set(conversations.map((c) => (c.origem as WaOrigem | undefined)?.idOrigem).filter((x): x is string => Boolean(x))),
  ];
  const apelidos = idsDeAnuncio.length
    ? new Map(
        (
          await WaAnuncio.find({ tenantId: user.tenantId, idOrigem: { $in: idsDeAnuncio } }).select("idOrigem apelido").lean()
        ).map((a) => [a.idOrigem, a.apelido ?? null]),
      )
    : new Map<string, string | null>();

  return NextResponse.json({
    conversations: conversations.map((c) => {
      const contact = byId.get(String(c.contactId));
      const waitingSince = c.waitingSince ? new Date(c.waitingSince).toISOString() : null;
      return {
        id: String(c._id),
        status: c.status,
        outcome: c.outcome ?? null,
        transferReason: c.transferReason ?? null,
        lastMessageAt: c.lastMessageAt ?? null,
        // Sem lastInboundAt o contato nunca escreveu (só recebeu o template da
        // campanha) — e é o que decide se dá para responder com texto livre.
        lastInboundAt: c.lastInboundAt ?? null,
        preview: c.lastMessagePreview ?? null,
        unread: c.unreadCount ?? 0,
        stage: c.stage,
        stageId: c.stageId ? String(c.stageId) : null,
        assignedTo: c.assignedTo ?? null,
        waitingSince,
        slaViolated: isSlaViolated(c.status as ConversationStatus, waitingSince, Date.now(), slaMinutes),
        campaignId: c.campaignId ? String(c.campaignId) : null,
        etiquetas: (c.etiquetas ?? []).map(String),
        origem: c.origem
          ? {
              canal: (c.origem as WaOrigem).canal,
              em: (c.origem as WaOrigem).em,
              nome: nomeDaOrigem({
                ...(c.origem as WaOrigem),
                apelido: apelidos.get((c.origem as WaOrigem).idOrigem ?? "") ?? null,
              }),
            }
          : null,
        channelKind: (c.channelId && kindById.get(String(c.channelId))) || "whatsapp",
        contact: {
          id: contact ? String(contact._id) : null,
          phone: contact?.phone ?? "",
          name: contact?.name ?? null,
          igUsername: contact?.igUsername ?? null,
          company: contact?.company ?? null,
          registered: Boolean(contact?.userId || contact?.firebaseUid),
          optOut: contact?.optOut ?? false,
        },
      };
    }),
    counts,
    funil: { colunas, contagem: contagemColunas },
    hasMore,
    /** Quantas conversas casam com o filtro e a busca (não só as carregadas). */
    matching,
    channel: { phone: whatsapp?.label ?? null },
    channels: activeChannels.map((ch) => ({
      kind: ch.kind,
      status: ch.status,
      label: ch.kind === "whatsapp" ? ch.displayPhone ?? "WhatsApp" : channelLabelOf(ch),
    })),
    me: user.email,
    slaMinutes,
    role: user.role,
    etiquetas,
    ia,
  });
}

function escapar(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Contatos da loja que casam com a busca: nome, @ do Instagram, empresa e
 * telefone. O telefone compara só os dígitos, para "(31) 99876" achar
 * +5531998760000.
 */
async function contatosDaBusca(tenantId: string | null, busca: string) {
  const termo = new RegExp(escapar(busca), "i");
  const ou: Record<string, unknown>[] = [{ name: termo }, { company: termo }, { igUsername: termo }];
  const digitos = busca.replace(/\D/g, "");
  if (digitos.length >= 3) ou.push({ phone: new RegExp(escapar(digitos)) });
  ou.push({ phone: termo });
  const contatos = await WaContact.find({ tenantId, $or: ou }).select("_id").limit(2000).lean();
  return contatos.map((c) => c._id);
}
