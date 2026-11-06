// Iscas de comentário no Instagram e na Página do Facebook (Messenger).
//
// Alguém comenta num post da loja → o gateway (Chatrun Conexão) responde no
// comentário, se a isca tiver resposta pública, e manda UMA mensagem privada
// no Direct ou no Messenger. A Meta permite uma privada por comentário, em
// até 7 dias: é o único jeito legítimo de a loja começar a conversa nesses
// canais. Se a pessoa responder, a conversa segue na Central como qualquer
// Direct.
//
// A regra mora no gateway (é ele que escolhe a isca e fala com a Meta); aqui
// fica o espelho dela, com o que a tela mostra (foto e legenda do post) e os
// números. O `external_ref` da regra no gateway é o _id daqui: é assim que o
// evento comment_reply acha a isca, sempre dentro da loja do canal.

import mongoose, { Schema, Document, Model } from "mongoose";

export type IscaCanal = "instagram" | "messenger";

export interface IWaIsca extends Document {
  /** Loja (WaStore). null = CNV. Igual ao do canal. */
  tenantId: string | null;
  channelId: mongoose.Types.ObjectId;
  canal: IscaCanal;
  /** id da regra no gateway (comment_rules.id). */
  chatrunRuleId: string;
  /** Post da isca (id da mídia no Instagram, id do post na Página). null = todos. */
  mediaId: string | null;
  /** O que a tela mostra do post escolhido. A foto é link da Meta e pode
   *  vencer: a tela troca pela atual quando a lista de posts responde. */
  postLegenda?: string | null;
  postImagem?: string | null;
  postLink?: string | null;
  /** Palavra que dispara. null = qualquer comentário. */
  keyword: string | null;
  /** Resposta pública no comentário. null = não responde no comentário. */
  publicReply: string | null;
  /** A mensagem privada (Direct ou Messenger): é a isca em si. */
  directMessage: string;
  ativo: boolean;
  /** Desempate entre iscas igualmente específicas (o gateway decide). */
  priority: number;
  /** Comentários que esta isca atendeu, privadas que saíram e falhas. Cada
   *  comentário conta uma vez (o comment_reply reentregue não soma de novo). */
  comentarios: number;
  directs: number;
  falhas: number;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WaIscaSchema: Schema = new Schema(
  {
    tenantId: { type: String, default: null },
    channelId: { type: Schema.Types.ObjectId, ref: "WaChannel", required: true },
    canal: { type: String, enum: ["instagram", "messenger"], required: true },
    chatrunRuleId: { type: String, required: true },
    mediaId: { type: String, default: null },
    postLegenda: { type: String, default: null, maxlength: 300 },
    postImagem: { type: String, default: null },
    postLink: { type: String, default: null },
    keyword: { type: String, default: null, maxlength: 60 },
    publicReply: { type: String, default: null, maxlength: 1000 },
    directMessage: { type: String, required: true, maxlength: 1000 },
    ativo: { type: Boolean, default: true },
    priority: { type: Number, default: 0 },
    comentarios: { type: Number, default: 0 },
    directs: { type: Number, default: 0 },
    falhas: { type: Number, default: 0 },
    createdBy: { type: String },
  },
  { timestamps: true, collection: "wa_iscas" },
);
WaIscaSchema.index({ tenantId: 1, channelId: 1, createdAt: -1 });
WaIscaSchema.index({ chatrunRuleId: 1 }, { unique: true });

// ── Comentário recebido ──────────────────────────────────────
// Todo comentário que o gateway avisou (instagram.comment / messenger.comment)
// e, quando uma isca respondeu, o resultado. O id do comentário é a chave:
// o gateway reentrega, e o mesmo comentário nunca vira duas linhas nem conta
// duas vezes na isca.
export interface IWaIscaComentario extends Document {
  commentId: string;
  tenantId: string | null;
  channelId: mongoose.Types.ObjectId;
  canal: IscaCanal;
  mediaId: string | null;
  /** Resposta a outro comentário (o comentário pai). */
  parentId?: string | null;
  texto: string;
  /** Quem comentou: id no canal, @ no Instagram, nome no Messenger. */
  autorId?: string | null;
  autorUsername?: string | null;
  autorNome?: string | null;
  /** Isca que respondeu. null = nenhuma serviu (o comentário só fica registrado). */
  iscaId?: mongoose.Types.ObjectId | null;
  respondeuPublico: boolean;
  respondeuDirect: boolean;
  /** Motivo da falha, como o gateway mandou ("direct: ..."). */
  erro?: string | null;
  /** id da mensagem privada que saiu (o mesmo externalId na conversa). */
  directMessageId?: string | null;
  /** Chave do contato ("ig:<id>" / "fb:<PSID>") e a conversa na Central. */
  contato?: string | null;
  conversationId?: mongoose.Types.ObjectId | null;
  /** Quando o resultado da isca chegou. Marcado uma vez só: é a trava que
   *  impede o comment_reply reentregue de somar de novo nos números. */
  respostaEm?: Date | null;
  em: Date;
  createdAt: Date;
  updatedAt: Date;
}

const WaIscaComentarioSchema: Schema = new Schema(
  {
    commentId: { type: String, required: true },
    tenantId: { type: String, default: null },
    channelId: { type: Schema.Types.ObjectId, ref: "WaChannel", required: true },
    canal: { type: String, enum: ["instagram", "messenger"], required: true },
    mediaId: { type: String, default: null },
    parentId: { type: String, default: null },
    texto: { type: String, default: "", maxlength: 2200 },
    autorId: { type: String, default: null },
    autorUsername: { type: String, default: null },
    autorNome: { type: String, default: null },
    iscaId: { type: Schema.Types.ObjectId, ref: "WaIsca", default: null },
    respondeuPublico: { type: Boolean, default: false },
    respondeuDirect: { type: Boolean, default: false },
    erro: { type: String, default: null, maxlength: 500 },
    directMessageId: { type: String, default: null },
    contato: { type: String, default: null },
    conversationId: { type: Schema.Types.ObjectId, ref: "WaConversation", default: null },
    respostaEm: { type: Date, default: null },
    em: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: "wa_isca_comentarios" },
);
WaIscaComentarioSchema.index({ commentId: 1 }, { unique: true });
WaIscaComentarioSchema.index({ tenantId: 1, em: -1 });
WaIscaComentarioSchema.index({ tenantId: 1, channelId: 1, em: -1 });
WaIscaComentarioSchema.index({ iscaId: 1, em: -1 });

if (process.env.NODE_ENV === "development") {
  if (mongoose.models.WaIsca) delete mongoose.models.WaIsca;
  if (mongoose.models.WaIscaComentario) delete mongoose.models.WaIscaComentario;
}

export const WaIsca: Model<IWaIsca> = mongoose.models.WaIsca || mongoose.model<IWaIsca>("WaIsca", WaIscaSchema);
export const WaIscaComentario: Model<IWaIscaComentario> =
  mongoose.models.WaIscaComentario ||
  mongoose.model<IWaIscaComentario>("WaIscaComentario", WaIscaComentarioSchema);
