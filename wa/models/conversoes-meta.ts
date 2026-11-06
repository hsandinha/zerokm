// API de Conversões da Meta para mensagens: a configuração de cada dono (loja
// ou CNV) e a fila dos eventos que voltam para o anúncio. Regras em
// wa/lib/conversoes-meta.ts (puras) e wa/lib/conversoes-meta-servidor.ts.
//
// O token fica criptografado com APP_ENCRYPTION_KEY (wa/lib/crypto.ts) e
// nunca volta para o navegador: a tela só sabe que há um salvo.

import mongoose, { Schema, Document, Model } from "mongoose";
import { EVENTOS_META, type CanalMeta, type EventoMeta, type SituacaoEventoMeta } from "@wa/lib/conversoes-meta";

// ── Configuração por dono ────────────────────────────────────
export interface IWaConversoesMeta extends Document {
  /** Loja (WaStore). null = CNV. */
  tenantId: string | null;
  ativo: boolean;
  /** Conjunto de dados (dataset, o antigo pixel) do Gerenciador de Eventos. */
  datasetId?: string | null;
  /** Token de acesso da API de Conversões, criptografado. */
  token?: string | null;
  /** Código de "Testar eventos": só vai no evento do botão Testar conexão. */
  testEventCode?: string | null;
  /** Valor da venda quando a conversa não tem carro ligado (BRL). */
  valorPadrao?: number | null;
  atualizadoPor?: string | null;
  ultimoTeste?: { em: Date; ok: boolean; mensagem: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

const WaConversoesMetaSchema: Schema = new Schema(
  {
    tenantId: { type: String, default: null },
    ativo: { type: Boolean, default: false },
    datasetId: { type: String, trim: true, maxlength: 40, default: null },
    token: { type: String, default: null },
    testEventCode: { type: String, trim: true, maxlength: 40, default: null },
    valorPadrao: { type: Number, min: 0, default: null },
    atualizadoPor: { type: String, default: null },
    ultimoTeste: {
      type: new Schema({ em: Date, ok: Boolean, mensagem: String }, { _id: false }),
      default: null,
    },
  },
  { timestamps: true, collection: "wa_conversoes_meta" },
);
WaConversoesMetaSchema.index({ tenantId: 1 }, { unique: true });

// ── Fila dos eventos ─────────────────────────────────────────
// Um registro por conversa e por evento (índice único): a mesma venda nunca
// sai duas vezes, mesmo com o cartão indo e voltando da coluna. O que não
// pode ir (sem configuração, sem clique do anúncio, sem o id do canal) fica
// "ignorado" com o motivo e não é tentado de novo.
export interface IWaEventoMeta extends Document {
  tenantId: string | null;
  conversationId: mongoose.Types.ObjectId;
  contactId?: mongoose.Types.ObjectId | null;
  evento: EventoMeta;
  /** Canal do anúncio (messaging_channel). null = a conversa não veio de anúncio. */
  canal?: CanalMeta | null;
  /** Anúncio (ad_id) que trouxe a pessoa, para a tela. */
  idOrigem?: string | null;
  colunaId?: mongoose.Types.ObjectId | null;
  colunaNome?: string | null;
  /** Quem levou o cartão para a coluna (e-mail, "auto", "ia"...). */
  por?: string | null;
  valor?: number | null;
  moeda: "BRL";
  /** Quando o cartão entrou na coluna: é o event_time. */
  quando: Date;
  status: SituacaoEventoMeta;
  motivo?: string | null;
  tentativas: number;
  proximaEm?: Date | null;
  /** Reserva de quem está enviando (envio na hora ou worker). */
  reservadoAte?: Date | null;
  enviadoEm?: Date | null;
  ultimoErro?: string | null;
  fbtraceId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const WaEventoMetaSchema: Schema = new Schema(
  {
    tenantId: { type: String, default: null },
    conversationId: { type: Schema.Types.ObjectId, ref: "WaConversation", required: true },
    contactId: { type: Schema.Types.ObjectId, ref: "WaContact", default: null },
    evento: { type: String, enum: EVENTOS_META, required: true },
    canal: { type: String, enum: ["whatsapp", "messenger", "instagram", null], default: null },
    idOrigem: { type: String, default: null },
    colunaId: { type: Schema.Types.ObjectId, ref: "WaFunilColuna", default: null },
    colunaNome: { type: String, default: null },
    por: { type: String, default: null },
    valor: { type: Number, default: null },
    moeda: { type: String, enum: ["BRL"], default: "BRL" },
    quando: { type: Date, required: true },
    status: {
      type: String,
      enum: ["pendente", "enviando", "enviado", "falhou", "ignorado"],
      default: "pendente",
    },
    motivo: { type: String, default: null },
    tentativas: { type: Number, default: 0 },
    proximaEm: { type: Date, default: null },
    reservadoAte: { type: Date, default: null },
    enviadoEm: { type: Date, default: null },
    ultimoErro: { type: String, default: null },
    fbtraceId: { type: String, default: null },
  },
  { timestamps: true, collection: "wa_eventos_meta" },
);
WaEventoMetaSchema.index({ tenantId: 1, conversationId: 1, evento: 1 }, { unique: true });
// O worker: o que está na fila e venceu, e a reserva que ficou presa.
WaEventoMetaSchema.index({ status: 1, proximaEm: 1 });
WaEventoMetaSchema.index({ status: 1, reservadoAte: 1 });
// A tela: os últimos do dono.
WaEventoMetaSchema.index({ tenantId: 1, createdAt: -1 });

export const WaConversoesMeta: Model<IWaConversoesMeta> =
  mongoose.models.WaConversoesMeta ||
  mongoose.model<IWaConversoesMeta>("WaConversoesMeta", WaConversoesMetaSchema);

export const WaEventoMeta: Model<IWaEventoMeta> =
  mongoose.models.WaEventoMeta || mongoose.model<IWaEventoMeta>("WaEventoMeta", WaEventoMetaSchema);
