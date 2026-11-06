// Origem do lead: o anúncio de clique para WhatsApp (ou Messenger/Direct) que
// abriu a conversa. A Meta manda o "referral" junto da primeira mensagem de
// quem tocou no anúncio; ele fica na conversa (o anúncio mais recente), no
// contato (o primeiro e o último) e no catálogo de anúncios da loja, que é o
// que a tela de Origens conta.
//
// O ctwa_clid fica guardado de propósito: é o id do clique que a API de
// Conversões da Meta pede para devolver a venda ao anúncio.

import mongoose, { Schema, Document, Model } from "mongoose";

export type CanalDaOrigem = "whatsapp" | "instagram" | "messenger";

export type WaOrigem = {
  canal: CanalDaOrigem;
  /** "ad" ou "post" no WhatsApp; "ADS" no Messenger/Direct. */
  tipoOrigem?: string | null;
  /** Id do anúncio (ad_id) ou do post: a chave do catálogo e do relatório. */
  idOrigem?: string | null;
  titulo?: string | null;
  texto?: string | null;
  link?: string | null;
  midia?: "image" | "video" | null;
  /** Link da Meta para a imagem (ou miniatura do vídeo). Expira. */
  imagemUrl?: string | null;
  /** Cópia da imagem em wa_midias_saida (o link da Meta vence). */
  midiaId?: string | null;
  /** Id do clique no anúncio (WhatsApp), para a API de Conversões. */
  ctwaClid?: string | null;
  /** Quando a pessoa chegou por ele. */
  em: Date;
};

export const OrigemSchema = new Schema(
  {
    canal: { type: String, enum: ["whatsapp", "instagram", "messenger"], required: true },
    tipoOrigem: String,
    idOrigem: String,
    titulo: String,
    texto: String,
    link: String,
    midia: { type: String, enum: ["image", "video", null] },
    imagemUrl: String,
    midiaId: String,
    ctwaClid: String,
    em: { type: Date, required: true },
  },
  { _id: false },
);

// ── Catálogo de anúncios da loja ─────────────────────────────
// Um por anúncio (idOrigem). O `apelido` é o único campo que não vem da
// Meta: a gestão dá um nome que a equipe reconhece ("Onix 2024 vídeo"), e ele
// nunca é sobrescrito pelo referral seguinte.
export interface IWaAnuncio extends Document {
  tenantId: string | null;
  idOrigem: string;
  canal: CanalDaOrigem;
  titulo?: string | null;
  texto?: string | null;
  link?: string | null;
  midia?: "image" | "video" | null;
  midiaId?: string | null;
  apelido?: string | null;
  /** Quantas vezes alguém chegou por ele (cada referral recebido). */
  conversas: number;
  primeiraEm: Date;
  ultimaEm: Date;
  createdAt: Date;
  updatedAt: Date;
}

const WaAnuncioSchema: Schema = new Schema(
  {
    tenantId: { type: String, default: null },
    idOrigem: { type: String, required: true },
    canal: { type: String, enum: ["whatsapp", "instagram", "messenger"], default: "whatsapp" },
    titulo: String,
    texto: String,
    link: String,
    midia: { type: String, enum: ["image", "video", null] },
    midiaId: String,
    apelido: { type: String, trim: true, maxlength: 80 },
    conversas: { type: Number, default: 0 },
    primeiraEm: { type: Date, default: Date.now },
    ultimaEm: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: "wa_anuncios" },
);
WaAnuncioSchema.index({ tenantId: 1, idOrigem: 1 }, { unique: true });

if (process.env.NODE_ENV === "development") {
  if (mongoose.models.WaAnuncio) delete mongoose.models.WaAnuncio;
}

export const WaAnuncio: Model<IWaAnuncio> =
  mongoose.models.WaAnuncio || mongoose.model<IWaAnuncio>("WaAnuncio", WaAnuncioSchema);
