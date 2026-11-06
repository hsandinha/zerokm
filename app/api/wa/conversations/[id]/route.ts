// Detalhe da conversa (histórico + dossiê do cliente) e mudança de estado:
// assumir, devolver para a IA, encerrar, mover de etapa, atribuir.

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireScope, sameTenant, type Scope } from "@wa/lib/scope";
import dbConnect from "@/lib/mongodb";
import {
  WaAiJob,
  WaCampaign,
  WaContact,
  WaConversation,
  WaMessage,
  type IWaConversation,
  type IWaMessage,
} from "@wa/models/wa";
import { WaNote } from "@wa/models/atendimento";
import { getDossier } from "@wa/lib/dossier";
import { isStage } from "@wa/lib/stages";
import { moverParaColuna, setConversationStage } from "@wa/lib/conversation-stage";
import { emitEvent } from "@wa/lib/webhooks";
import { channelForConversation } from "@wa/lib/channels";
import { linkDaMidia } from "@wa/lib/midia-saida";
import { equipeDoEscopo, iaDaConversa, nomeDe } from "@wa/lib/central";
import { getStore } from "@wa/lib/store";
import { aposAcaoDaEquipe } from "@wa/lib/fila";
import { linhaDaAtribuicao, patchDeAtribuicao, tiraDaIa } from "@wa/lib/central-regras";
import { copilotoDisponivel } from "@wa/lib/copiloto";
import { WaAnuncio, type WaOrigem } from "@wa/models/origem";
import { imagemDaOrigem } from "@wa/lib/origem-loja";
import { nomeDaOrigem } from "@wa/lib/origem";

type Params = { params: Promise<{ id: string }> };

/** Mensagens por página do histórico (a mais nova embaixo). */
const PAGINA = 200;

type MensagemLean = Pick<
  IWaMessage,
  | "direction"
  | "sender"
  | "content"
  | "mediaType"
  | "mediaId"
  | "externalId"
  | "status"
  | "error"
  | "reaction"
  | "contextExternalId"
  | "midiaId"
  | "mediaUrl"
  | "filename"
  | "createdAt"
  | "authorEmail"
  | "authorName"
> & { _id: mongoose.Types.ObjectId };

/** De onde a Central carrega a mídia: o proxy da Meta para o que chegou, o
 *  link assinado para o que a equipe anexou, o link público do catálogo. */
function fonteDaMidia(m: MensagemLean): string | null {
  if (m.mediaId) return `/api/wa/media?id=${encodeURIComponent(m.mediaId)}`;
  if (m.midiaId) return linkDaMidia("", m.midiaId);
  if (m.mediaUrl) return m.mediaUrl;
  return null;
}

/** Página do histórico: as `PAGINA` mais novas antes do cursor (ou de agora),
 *  em ordem cronológica, com a mensagem citada de cada resposta. */
async function paginaDeMensagens(conversationId: string, antesDe: string | null) {
  const filtro: Record<string, unknown> = { conversationId };
  if (antesDe && mongoose.isValidObjectId(antesDe)) {
    const cursor = await WaMessage.findOne({ _id: antesDe, conversationId }).select("createdAt").lean();
    if (cursor) {
      // Empate no mesmo milissegundo desempata pelo _id: nada some nem repete.
      filtro.$or = [
        { createdAt: { $lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, _id: { $lt: cursor._id } },
      ];
    }
  }
  const docs = await WaMessage.find(filtro)
    .sort({ createdAt: -1, _id: -1 })
    .limit(PAGINA + 1)
    .lean<MensagemLean[]>();
  const hasMore = docs.length > PAGINA;
  const pagina = docs.slice(0, PAGINA).reverse();

  const citados = [...new Set(pagina.map((m) => m.contextExternalId).filter((x): x is string => Boolean(x)))];
  const porWamid = new Map<string, MensagemLean>();
  if (citados.length) {
    const achados = await WaMessage.find({ conversationId, externalId: { $in: citados } })
      .select("direction sender content mediaType externalId filename createdAt")
      .lean<MensagemLean[]>();
    for (const c of achados) if (c.externalId) porWamid.set(c.externalId, c);
  }

  return {
    hasMore,
    messages: pagina.map((m) => {
      const citado = m.contextExternalId ? porWamid.get(m.contextExternalId) : undefined;
      return {
        id: String(m._id),
        direction: m.direction,
        sender: m.sender,
        content: m.content ?? null,
        mediaType: m.mediaType,
        mediaId: m.mediaId ?? null,
        mediaSrc: fonteDaMidia(m),
        filename: m.filename ?? null,
        externalId: m.externalId ?? null,
        status: m.status ?? null,
        error: m.error ?? null,
        reaction: m.reaction ?? null,
        createdAt: m.createdAt,
        // Quem da equipe escreveu: o balão mostra o nome no lugar de "Você".
        authorEmail: m.authorEmail ?? null,
        authorName: m.authorName ?? null,
        // Citação de mensagem que não está no banco (apagada ou de antes da
        // conversa existir aqui): mostra só que era uma resposta.
        quoted: m.contextExternalId
          ? citado
            ? {
                id: String(citado._id),
                direction: citado.direction,
                sender: citado.sender,
                content: citado.content ?? null,
                mediaType: citado.mediaType,
                filename: citado.filename ?? null,
              }
            : { id: null, direction: null, sender: null, content: null, mediaType: null, filename: null }
          : null,
      };
    }),
  };
}

export async function GET(req: NextRequest, { params }: Params) {
  let scope: Scope;
  try {
    scope = await requireScope();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }
  await dbConnect();

  const conversation = await WaConversation.findById(id).lean();
  if (!conversation || !sameTenant(scope, conversation)) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }

  // "Ver anteriores": só a página pedida, sem refazer o resto do detalhe.
  const antesDe = req.nextUrl.searchParams.get("before");
  if (antesDe) {
    return NextResponse.json(await paginaDeMensagens(id, antesDe));
  }

  const contactDoc = await WaContact.findById(conversation.contactId);
  const [pagina, campaign, notes] = await Promise.all([
    // As MAIS NOVAS: com sort crescente + limit, uma conversa longa parava de
    // mostrar o que chegava depois da mensagem 200.
    paginaDeMensagens(id, null),
    conversation.campaignId
      ? WaCampaign.findById(conversation.campaignId).select("name").lean()
      : Promise.resolve(null),
    WaNote.find({ conversationId: id, tenantId: scope.tenantId }).sort({ createdAt: -1 }).limit(200).lean(),
  ]);

  // Zera o não lido ao abrir
  await WaConversation.updateOne({ _id: id }, { unreadCount: 0 });

  const store = scope.tenantId ? await getStore(scope.tenantId) : null;
  // Anúncio que abriu a conversa e o primeiro por onde o contato chegou, com
  // o nome que a gestão deu no catálogo.
  const origemDaConversa = (conversation.origem as WaOrigem | null | undefined) ?? null;
  const primeiraDoContato = (contactDoc?.origemPrimeira as WaOrigem | null | undefined) ?? null;
  const idsDeAnuncio = [origemDaConversa?.idOrigem, primeiraDoContato?.idOrigem].filter((x): x is string => Boolean(x));
  const catalogo = idsDeAnuncio.length
    ? await WaAnuncio.find({ tenantId: scope.tenantId, idOrigem: { $in: idsDeAnuncio } })
        .select("idOrigem apelido conversas")
        .lean()
    : [];
  const doCatalogo = new Map(catalogo.map((a) => [a.idOrigem, a]));
  const origemParaTela = (o: WaOrigem | null) => {
    if (!o) return null;
    const cat = o.idOrigem ? doCatalogo.get(o.idOrigem) : undefined;
    return {
      canal: o.canal,
      tipoOrigem: o.tipoOrigem ?? null,
      idOrigem: o.idOrigem ?? null,
      titulo: o.titulo ?? null,
      texto: o.texto ?? null,
      link: o.link ?? null,
      midia: o.midia ?? null,
      imagem: imagemDaOrigem(o),
      em: o.em,
      nome: nomeDaOrigem({ ...o, apelido: cat?.apelido }),
      apelido: cat?.apelido ?? null,
      conversasDoAnuncio: cat?.conversas ?? null,
      // O id do clique fica no banco para a API de Conversões da Meta: a tela
      // só precisa saber que existe.
      temClique: Boolean(o.ctwaClid),
    };
  };
  const [dossier, channel, ia] = await Promise.all([
    // O dossiê é a situação do lojista no funil do CNV — só faz sentido na Vera.
    contactDoc && !scope.tenantId ? getDossier(contactDoc) : Promise.resolve(null),
    channelForConversation(conversation),
    iaDaConversa(scope, store),
  ]);

  return NextResponse.json({
    conversation: {
      id: String(conversation._id),
      status: conversation.status,
      outcome: conversation.outcome ?? null,
      transferReason: conversation.transferReason ?? null,
      lastInboundAt: conversation.lastInboundAt ?? null,
      lastMessageAt: conversation.lastMessageAt ?? null,
      stage: conversation.stage,
      stageId: conversation.stageId ? String(conversation.stageId) : null,
      stageChangedAt: conversation.stageChangedAt,
      assignedTo: conversation.assignedTo ?? null,
      waitingSince: conversation.waitingSince ?? null,
      createdAt: conversation.createdAt,
      campaign: campaign ? { id: String(campaign._id), name: campaign.name } : null,
      channel: { kind: channel.kind, label: channel.label },
      etiquetas: (conversation.etiquetas ?? []).map(String),
      origem: origemParaTela(origemDaConversa),
    },
    contact: contactDoc
      ? {
          id: String(contactDoc._id),
          phone: contactDoc.phone,
          name: contactDoc.name ?? null,
          igUsername: contactDoc.igUsername ?? null,
          whatsappPhone: contactDoc.whatsappPhone ?? null,
          email: contactDoc.email ?? null,
          document: contactDoc.document ?? null,
          company: contactDoc.company ?? null,
          city: contactDoc.city ?? null,
          state: contactDoc.state ?? null,
          optOut: contactDoc.optOut,
          registered: Boolean(contactDoc.userId || contactDoc.firebaseUid),
          origemPrimeira: origemParaTela(primeiraDoContato),
        }
      : null,
    dossier,
    messages: pagina.messages,
    hasMore: pagina.hasMore,
    notes: notes.reverse().map((n) => ({
      id: String(n._id),
      authorEmail: n.authorEmail,
      authorName: n.authorName ?? null,
      text: n.text,
      createdAt: n.createdAt,
    })),
    ia,
    // Endereço da loja no mapa (botão "Enviar localização"). O CNV não tem.
    mapsUrl: store?.mapsUrl?.trim() || null,
    // Copiloto sob demanda: só aparece com a IA liberada e a chave da loja.
    copiloto: copilotoDisponivel(scope, store).disponivel,
    me: { email: scope.email, role: scope.role },
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
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    stage?: string;
    colunaId?: string;
    email?: string | null;
    /** Motivo da transferência (atribuir), fica como nota interna. */
    motivo?: string | null;
  };

  await dbConnect();
  const own = await WaConversation.findById(id).select("tenantId status assignedTo").lean();
  if (!own || !sameTenant(user, own)) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }
  const patch: Record<string, unknown> = {};
  let event: "conversa.atribuida" | "conversa.resolvida" | null = null;
  /** Linha de sistema na conversa (quem passou para quem). */
  let linhaDoTempo: string | null = null;
  let notaInterna: string | null = null;

  switch (body.action) {
    case "assumir":
      patch.status = "human_active";
      patch.assignedTo = user.email;
      // Assumiu: a espera acabou e o SLA para de correr.
      patch.waitingSince = null;
      event = "conversa.atribuida";
      break;
    case "devolver": {
      // Sem IA que responda, a conversa ficaria parada "com a IA" e o
      // cliente sem resposta: quem atende continua com ela.
      const ia = await iaDaConversa(user);
      if (!ia.disponivel) {
        return NextResponse.json(
          { error: ia.motivo ?? "A IA não está disponível para esta conversa." },
          { status: 409 },
        );
      }
      patch.status = "ai_active";
      patch.transferReason = null;
      patch.assignedTo = null;
      patch.waitingSince = null;
      break;
    }
    case "encerrar":
      patch.status = "closed";
      patch.waitingSince = null;
      event = "conversa.resolvida";
      break;
    case "coluna":
      // Quadro com as colunas da loja: grava a coluna e a etapa que ela significa.
      if (!body.colunaId) {
        return NextResponse.json({ error: "Coluna inválida" }, { status: 400 });
      }
      try {
        const { stage } = await moverParaColuna(id, body.colunaId, user.email);
        return NextResponse.json({ ok: true, stage });
      } catch (err) {
        const status = (err as { status?: number }).status ?? 500;
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Falha ao mover" },
          { status },
        );
      }
    case "etapa":
      if (!isStage(body.stage)) {
        return NextResponse.json({ error: "Etapa inválida" }, { status: 400 });
      }
      try {
        await setConversationStage(id, body.stage, user.email);
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Falha ao mover" },
          { status: 500 },
        );
      }
      return NextResponse.json({ ok: true });
    case "atribuir": {
      const destino = body.email ? String(body.email).toLowerCase().trim() : null;
      const equipe = await equipeDoEscopo(user);
      const membro = destino ? equipe.find((m) => m.email === destino) : null;
      // Só para quem é da equipe desta loja (ou do painel do CNV): um e-mail
      // qualquer tiraria a conversa da fila de todo mundo.
      if (destino && !membro) {
        return NextResponse.json({ error: "Essa pessoa não é da equipe." }, { status: 400 });
      }
      const autor = equipe.find((m) => m.email === user.email) ?? { email: user.email, name: user.name };
      // Para si é assumir; para um colega, espera por ele (o SLA conta da
      // transferência); sem responsável, volta para a fila. A mesma regra
      // das ações em lote (wa/lib/central-regras.ts).
      Object.assign(patch, patchDeAtribuicao(own, destino, user.email));
      const motivo = body.motivo?.trim().slice(0, 500) || null;
      linhaDoTempo = linhaDaAtribuicao({
        autor: nomeDe(autor),
        destino,
        quem: user.email,
        anterior: own.assignedTo,
        nomeDoDestino: nomeDe(membro),
        nomeDoAnterior: nomeDe(equipe.find((m) => m.email === own.assignedTo) ?? (own.assignedTo ? { email: own.assignedTo } : null)),
      });
      // O motivo fica como nota: a linha de sistema entra no histórico que a
      // IA lê, e o motivo é conversa da equipe.
      if (motivo) notaInterna = `Motivo da transferência: ${motivo}`;
      event = destino ? "conversa.atribuida" : null;
      break;
    }
    default:
      return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  }

  const updated = await WaConversation.findByIdAndUpdate(id, patch, { new: true });
  if (!updated) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });

  if (linhaDoTempo) {
    await WaMessage.create({
      conversationId: id,
      direction: "outbound",
      sender: "system",
      content: linhaDoTempo,
      // "evento": a Central mostra como linha do tempo, nunca como balão.
      mediaType: "evento",
      status: "sent",
    });
  }
  if (notaInterna) {
    await WaNote.create({
      conversationId: id,
      tenantId: user.tenantId,
      authorEmail: user.email,
      authorName: user.name ?? undefined,
      text: notaInterna,
    });
  }

  // Regra de ouro: nunca IA e humano ao mesmo tempo.
  if (tiraDaIa(patch.status as IWaConversation["status"] | undefined)) {
    await WaAiJob.updateMany(
      { conversationId: id, status: "pending" },
      { status: "done", lastError: `cancelado: ${body.action}` },
    );
  }

  if (event) {
    await emitEvent(
      event,
      { by: user.email, assignedTo: patch.assignedTo ?? null },
      { conversationId: id },
    );
  }

  // Fila da equipe (wa/lib/fila.ts): registro do atendimento, distribuição e
  // aviso para quem recebeu a transferência.
  await aposAcaoDaEquipe(id, user.email).catch((err) => console.error("[conversa] fila da equipe:", err));

  return NextResponse.json({ ok: true, status: updated.status });
}
