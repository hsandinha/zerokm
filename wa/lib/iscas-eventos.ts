// Eventos das iscas de comentário que o gateway manda (app/api/chatrun/eventos).
//
//   instagram.comment / messenger.comment             → o comentário fica registrado
//   instagram.comment_reply / messenger.comment_reply → o que a isca fez com ele
//
// O gateway reentrega o que não recebeu 2xx, e o comment_reply costuma
// chegar ANTES do aviso do comentário (o aviso sai pelo cron dele, em até
// 1 min). Por isso tudo aqui é idempotente e não depende da ordem: o
// comentário é chave única pelo id, a mensagem privada pelo id dela, e os
// números da isca só sobem na primeira vez que o resultado chega.
//
// Quando a privada saiu, a pessoa ganha contato e conversa com a MESMA chave
// do Direct/Messenger (wa/lib/chatrun-perfil.ts → wa/lib/inbound.ts): quando
// ela responder, a resposta cai nesta conversa e a IA assume de lá.

import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { WaIsca, WaIscaComentario } from "@wa/models/isca";
import { WaContact, WaConversation, WaMessage } from "@wa/models/wa";
import { contactKeyFor, type ResolvedChannel } from "@wa/lib/channels";
import { emitEvent } from "@wa/lib/webhooks";
import { NOME_DO_CANAL, PRIVADO_DO_CANAL, bloqueadoNoGateway, resumoDaLegenda, type CanalDaIsca } from "@wa/lib/iscas";
import { sincronizarOptOutNoGateway } from "@wa/lib/chatrun-bloqueio";

export const EVENTOS_DE_ISCA = new Set([
  "instagram.comment",
  "instagram.comment_reply",
  "messenger.comment",
  "messenger.comment_reply",
]);

/** `data.comment` dos eventos (Instagram traz o @, Messenger o nome). */
export type ComentarioDoGateway = {
  id?: string;
  text?: string | null;
  media_id?: string | null;
  parent_id?: string | null;
  from?: { id?: string | null; username?: string | null; name?: string | null } | null;
};

/** `data` do comment_reply. */
export type RespostaDoGateway = {
  comment?: ComentarioDoGateway | null;
  rule?: { id?: string | null; external_ref?: string | null; media_id?: string | null; keyword?: string | null } | null;
  replied_public?: boolean;
  replied_direct?: boolean;
  direct_message_id?: string | null;
  contact?: {
    phone?: string | null;
    ig_id?: string | null;
    fb_id?: string | null;
    username?: string | null;
    name?: string | null;
  } | null;
  error?: string | null;
};

type CanalComIsca = ResolvedChannel & { kind: CanalDaIsca; id: string };

function ehCanalDeIsca(canal: ResolvedChannel): canal is CanalComIsca {
  return Boolean(canal.id) && (canal.kind === "instagram" || canal.kind === "messenger");
}

function duplicado(err: unknown): boolean {
  return (err as { code?: number })?.code === 11000;
}

/**
 * Chave do contato de quem recebeu a privada: "ig:<id>" / "fb:<PSID>".
 * A mesma conta do Direct que chega (entradaDoPerfil): o id do canal, ou o
 * telefone do evento sem o prefixo. No Messenger o from.id do comentário é
 * de outro escopo e NÃO serve: sem o PSID do evento, não há contato.
 */
export function chaveDoContatoDaIsca(
  kind: CanalDaIsca,
  contato: RespostaDoGateway["contact"],
): string | null {
  const pessoa = pessoaDaIsca(kind, contato);
  return pessoa ? contactKeyFor(kind, pessoa) : null;
}

/** IGSID / PSID de quem recebeu a privada (sem o prefixo da chave). */
function pessoaDaIsca(kind: CanalDaIsca, contato: RespostaDoGateway["contact"]): string | null {
  if (!contato) return null;
  const id = kind === "instagram" ? contato.ig_id : contato.fb_id;
  return id || contato.phone?.replace(/^(ig|fb):/, "") || null;
}

/** externalId da mensagem privada na conversa: o id que a Meta deu, ou o
 *  mesmo id de reserva que o gateway usa quando a Meta não devolve um. */
export function idDaPrivada(kind: CanalDaIsca, commentId: string, directMessageId?: string | null): string {
  if (directMessageId) return directMessageId;
  return `${kind === "instagram" ? "ig" : "fb"}-isca-${commentId}`;
}

/** Linha do tempo da conversa: de onde ela veio (nunca como anúncio). */
export function linhaDaIsca(p: {
  kind: CanalDaIsca;
  comentario: string | null | undefined;
  legenda?: string | null;
  mediaId?: string | null;
}): string {
  const disse = resumoDaLegenda(p.comentario, 80);
  const legenda = resumoDaLegenda(p.legenda, 50);
  const onde = legenda
    ? `no post "${legenda}"`
    : p.mediaId
      ? `no post ${p.mediaId}`
      : p.kind === "instagram"
        ? "num post do Instagram"
        : "num post da Página";
  return `Veio da isca de comentário: comentou${disse ? ` "${disse}"` : ""} ${onde} e recebeu a mensagem no ${PRIVADO_DO_CANAL[p.kind]}.`;
}

/** Campos do comentário para a primeira gravação (aviso ou resultado). */
function camposDoComentario(canal: CanalComIsca, c: ComentarioDoGateway) {
  return {
    commentId: c.id!,
    tenantId: canal.tenantId ?? null,
    channelId: new mongoose.Types.ObjectId(canal.id),
    canal: canal.kind,
    mediaId: c.media_id ?? null,
    parentId: c.parent_id ?? null,
    texto: (c.text ?? "").slice(0, 2200),
    autorId: c.from?.id ?? null,
    autorUsername: canal.kind === "instagram" ? c.from?.username ?? null : null,
    autorNome: c.from?.name ?? null,
    iscaId: null,
    respondeuPublico: false,
    respondeuDirect: false,
    erro: null,
    respostaEm: null,
    em: new Date(),
  };
}

/** Grava o comentário uma vez (o id é a chave). Comentário com o mesmo id em
 *  outra loja não é tocado: o filtro leva a loja e o índice único barra. */
async function garantirComentario(canal: CanalComIsca, c: ComentarioDoGateway): Promise<void> {
  try {
    await WaIscaComentario.findOneAndUpdate(
      { commentId: c.id, tenantId: canal.tenantId ?? null },
      { $setOnInsert: camposDoComentario(canal, c) },
      { upsert: true },
    );
  } catch (err) {
    if (!duplicado(err)) throw err;
  }
}

/** `instagram.comment` / `messenger.comment`. */
export async function comentarioRecebido(canal: ResolvedChannel, comentario: ComentarioDoGateway | null | undefined) {
  if (!ehCanalDeIsca(canal) || !comentario?.id) return;
  await dbConnect();
  await garantirComentario(canal, comentario);
}

/** Isca da regra, só dentro da loja do canal: o external_ref sozinho não
 *  basta (é texto que veio de fora), o canal e o id da regra também batem. */
async function iscaDaRegra(canal: CanalComIsca, rule: RespostaDoGateway["rule"]) {
  const ref = rule?.external_ref ?? null;
  const regra = rule?.id ?? null;
  if (ref && mongoose.isValidObjectId(ref)) {
    return WaIsca.findOne({
      _id: new mongoose.Types.ObjectId(ref),
      tenantId: canal.tenantId ?? null,
      channelId: new mongoose.Types.ObjectId(canal.id),
      ...(regra ? { chatrunRuleId: regra } : {}),
    }).lean();
  }
  if (!regra) return null;
  return WaIsca.findOne({
    chatrunRuleId: regra,
    tenantId: canal.tenantId ?? null,
    channelId: new mongoose.Types.ObjectId(canal.id),
  }).lean();
}

type IscaLida = { _id: unknown; directMessage?: string; postLegenda?: string | null; mediaId?: string | null } | null;

/**
 * Contato e conversa de quem recebeu a privada, e a mensagem que saiu na
 * conversa. Nada aqui acorda a IA nem conta como não lida: a pessoa ainda
 * não escreveu (a janela de 24h também não abre). Devolve a conversa.
 */
async function registrarPrivada(
  canal: CanalComIsca,
  dados: RespostaDoGateway,
  comentario: ComentarioDoGateway,
  isca: IscaLida,
): Promise<mongoose.Types.ObjectId | null> {
  const kind = canal.kind;
  const pessoa = pessoaDaIsca(kind, dados.contact);
  if (!pessoa) return null;
  const phone = contactKeyFor(kind, pessoa);
  const tenantId = canal.tenantId ?? null;
  const username = kind === "instagram" ? dados.contact?.username ?? comentario.from?.username ?? null : null;
  const nome = dados.contact?.name ?? (username ? `@${username}` : null) ?? comentario.from?.name ?? null;

  // 1. Contato: a mesma chave e os mesmos campos do Direct que chega.
  const contact = await WaContact.findOneAndUpdate(
    { tenantId, phone },
    {
      $setOnInsert: {
        phone,
        tenantId,
        source: kind,
        ...(kind === "instagram" ? { igUserId: pessoa } : { fbPsid: pessoa }),
        ...(nome ? { name: nome } : {}),
      },
      ...(username ? { $set: { igUsername: username } } : {}),
    },
    { new: true, upsert: true },
  );

  // 2. Conversa (uma por contato). Nasce em "abordado", como a conversa que
  // nasce de um disparo: é a resposta da pessoa que a leva para o funil.
  const existia = await WaConversation.exists({ contactId: contact._id });
  const conversa = await WaConversation.findOneAndUpdate(
    { contactId: contact._id },
    {
      $setOnInsert: {
        contactId: contact._id,
        tenantId,
        channelId: new mongoose.Types.ObjectId(canal.id),
        status: "ai_active",
        stage: "abordado",
        stageChangedAt: new Date(),
      },
    },
    { new: true, upsert: true },
  );
  const conversationId = conversa._id as mongoose.Types.ObjectId;

  // 3. A mensagem que saiu, com o id da privada: o gateway reentregar não
  // duplica. A linha do tempo antes dela diz de onde a conversa veio.
  const texto = isca?.directMessage?.trim() || `[mensagem da isca de comentário no ${PRIVADO_DO_CANAL[kind]}]`;
  const externalId = idDaPrivada(kind, comentario.id!, dados.direct_message_id);
  if (await WaMessage.exists({ externalId })) return conversationId;

  const agora = new Date();
  try {
    await WaMessage.create({
      conversationId,
      direction: "outbound",
      sender: "system",
      authorName: "Isca de comentário",
      content: texto,
      mediaType: "text",
      externalId,
      status: "sent",
      createdAt: agora,
    });
  } catch (err) {
    // Duas entregas ao mesmo tempo: a outra gravou primeiro (e a linha do tempo).
    if (duplicado(err)) return conversationId;
    throw err;
  }
  // Só quem gravou a mensagem escreve a linha do tempo, um instante antes dela.
  await WaMessage.create({
    conversationId,
    direction: "outbound",
    sender: "system",
    // "evento": a Central mostra como linha do tempo, nunca como balão.
    mediaType: "evento",
    content: linhaDaIsca({
      kind,
      comentario: comentario.text,
      legenda: isca?.postLegenda ?? null,
      // Isca de "todos os posts" não sabe a legenda: o id do post fica no
      // registro do comentário (WaIscaComentario), não na conversa.
      mediaId: isca?.mediaId ?? null,
    }),
    status: "sent",
    createdAt: new Date(agora.getTime() - 1),
  });
  // Sem unreadCount e sem lastInboundAt: quem falou foi a loja.
  await WaConversation.updateOne(
    { _id: conversationId },
    { lastMessageAt: agora, lastMessagePreview: texto.slice(0, 120) },
  );

  if (!existia) {
    await emitEvent(
      "conversa.criada",
      { origin: "isca_comentario", channel: kind, commentId: comentario.id, mediaId: comentario.media_id ?? null },
      { conversationId: String(conversationId) },
    );
  }
  return conversationId;
}

export type ResultadoDaResposta = {
  /** false = o resultado já tinha chegado antes (reentrega): nada somou. */
  contou: boolean;
  iscaId: string | null;
  conversationId: string | null;
};

/** `instagram.comment_reply` / `messenger.comment_reply`. */
export async function respostaDaIsca(
  canal: ResolvedChannel,
  dados: RespostaDoGateway,
): Promise<ResultadoDaResposta | null> {
  const comentario = dados.comment;
  if (!ehCanalDeIsca(canal) || !comentario?.id) return null;
  await dbConnect();
  const tenantId = canal.tenantId ?? null;

  const isca = await iscaDaRegra(canal, dados.rule);
  await garantirComentario(canal, comentario);

  const respondeuDirect = Boolean(dados.replied_direct);
  // A privada saiu: a conversa existe mesmo que a isca já tenha sido apagada
  // aqui (a pessoa vai responder e precisa cair na Central).
  const conversationId = respondeuDirect ? await registrarPrivada(canal, dados, comentario, isca) : null;

  const erro = typeof dados.error === "string" && dados.error.trim() ? dados.error.trim().slice(0, 500) : null;
  // O gateway não mandou porque o contato está bloqueado lá (pediu para sair).
  // Não é falha da isca: é ela respeitando o opt-out.
  const bloqueado = bloqueadoNoGateway(erro);
  const resultado = {
    iscaId: isca ? (isca._id as mongoose.Types.ObjectId) : null,
    respondeuPublico: Boolean(dados.replied_public),
    respondeuDirect,
    erro,
    directMessageId: dados.direct_message_id ?? null,
    contato: chaveDoContatoDaIsca(canal.kind, dados.contact),
    conversationId,
  };

  // A trava: só a primeira entrega acha o comentário sem `respostaEm`.
  const antes = await WaIscaComentario.findOneAndUpdate(
    { commentId: comentario.id, tenantId, respostaEm: null },
    { $set: { ...resultado, respostaEm: new Date() } },
  );
  const contou = Boolean(antes);

  if (contou) {
    if (isca) {
      await WaIsca.updateOne(
        { _id: isca._id, tenantId },
        { $inc: { comentarios: 1, directs: respondeuDirect ? 1 : 0, falhas: erro && !bloqueado ? 1 : 0 } },
      );
    }
    await reconciliarBloqueio(tenantId, resultado.contato, { bloqueado, respondeuDirect });
  } else if (conversationId) {
    // Reentrega: os números não mudam, mas a conversa que faltava fica ligada.
    await WaIscaComentario.updateOne(
      { commentId: comentario.id, tenantId, conversationId: null },
      { $set: { conversationId } },
    );
  }

  return {
    contou,
    iscaId: isca ? String(isca._id) : null,
    conversationId: conversationId ? String(conversationId) : null,
  };
}

/** Despacha o evento de isca pelo tipo. O tipo tem de ser do canal: evento
 *  de Instagram numa Página (ou o contrário) é ignorado. */
export async function eventoDeIsca(canal: ResolvedChannel, tipo: string, dados: Record<string, unknown>): Promise<void> {
  if (!ehCanalDeIsca(canal)) return;
  const [doCanal, acao] = tipo.split(".");
  if (doCanal !== canal.kind) return;
  if (acao === "comment") {
    await comentarioRecebido(canal, dados.comment as ComentarioDoGateway | undefined);
  } else if (acao === "comment_reply") {
    await respostaDaIsca(canal, dados as RespostaDoGateway);
  }
}

/** Para a tela: quem comentou, do jeito que o canal mostra. */
export function autorDoComentario(c: {
  canal: CanalDaIsca;
  autorUsername?: string | null;
  autorNome?: string | null;
}): string {
  if (c.canal === "instagram" && c.autorUsername) return `@${c.autorUsername}`;
  return c.autorNome || (c.autorUsername ? `@${c.autorUsername}` : `Alguém no ${NOME_DO_CANAL[c.canal]}`);
}

/**
 * O bloqueio do gateway e o opt-out daqui podem se desencontrar (a chamada
 * falhou, a equipe tirou o opt-out com o gateway fora do ar). O resultado da
 * isca é a hora de acertar: barrada para quem não saiu → desbloqueia; saiu
 * para quem pediu para sair (Messenger, ou bloqueio que não chegou) →
 * bloqueia de novo. Uma chamada por comentário, só na primeira entrega.
 */
async function reconciliarBloqueio(
  tenantId: string | null,
  contato: string | null,
  r: { bloqueado: boolean; respondeuDirect: boolean },
): Promise<void> {
  if (!contato || (!r.bloqueado && !r.respondeuDirect)) return;
  const local = await WaContact.findOne({ tenantId, phone: contato }).select("optOut").lean<{ optOut?: boolean }>();
  const saiu = Boolean(local?.optOut);
  if (r.bloqueado && !saiu) await sincronizarOptOutNoGateway({ tenantId, phone: contato }, false);
  else if (r.respondeuDirect && saiu) await sincronizarOptOutNoGateway({ tenantId, phone: contato }, true, "reconciliação da isca");
}
