// Loja que assina o atendimento (o Chatrun dentro da zerokm). É o "tenant":
// contatos, conversas, canais e campanhas carregam `tenantId` = _id daqui, e
// `tenantId` null continua sendo o próprio CNV (a Vera).
//
// A loja é uma concessionária (Concessionaria) ou um lojista (o User titular).
// Não guarda estoque: a IA vende o estoque da própria zerokm — o 0km das
// concessionárias, o repasse e o estoque local da loja, todos nas tabelas de
// sempre.
//
// Cada loja paga a própria IA (a chave é dela, cifrada) e os próprios disparos.

import mongoose, { Schema, Document, Model } from "mongoose";

export type StoreKind = "concessionaria" | "lojista";
export type StoreRole = "gestor" | "atendente";
export type AiProvider = "gemini" | "openai" | "claude";

export interface IWaStoreMember {
  email: string;
  name?: string;
  role: StoreRole;
}

export interface IWaStore extends Document {
  kind: StoreKind;
  concessionariaId?: mongoose.Types.ObjectId;
  ownerUserId?: mongoose.Types.ObjectId;
  name: string;
  /** Equipe além do titular (o titular/usuário da concessionária já é gestor). */
  members: IWaStoreMember[];
  /** Assinatura do atendimento (mesmo formato do planoRepasse). */
  subscription: {
    planId?: mongoose.Types.ObjectId;
    planName?: string;
    status?: "active" | "inactive" | "cancelled";
    billingType?: "monthly" | "annual";
    expiresAt?: Date | null;
    activationMethod?: "manual" | "cortesia" | "pix" | "boleto" | "card";
    activatedAt?: Date | null;
    activatedBy?: string;
    lastPaymentId?: string;
  };
  trialEndsAt?: Date | null;
  ai: {
    active: boolean;
    assistantName: string;
    provider: AiProvider;
    model?: string;
    /** Chave da própria loja, cifrada com APP_ENCRYPTION_KEY. */
    token?: string;
    systemPrompt?: string;
    knowledgeBase?: string;
    greeting?: string;
    extraInstructions?: string;
    maxTurns: number;
    /** O que a IA oferece: só o estoque da loja, ou também o da rede CNV. */
    vendeEstoqueCnv: boolean;
  };
  financiamento: {
    ativo: boolean;
    taxaMensal: number; // % ao mês
    entradaMinimaPct: number;
    prazos: number[];
    observacao?: string;
  };
  /** Link do Google Maps da loja (a IA manda quando pedem o endereço). */
  mapsUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MemberSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String },
    role: { type: String, enum: ["gestor", "atendente"], default: "atendente" },
  },
  { _id: false },
);

const WaStoreSchema: Schema = new Schema(
  {
    kind: { type: String, enum: ["concessionaria", "lojista"], required: true },
    concessionariaId: { type: Schema.Types.ObjectId, ref: "Concessionaria" },
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User" },
    name: { type: String, required: true },
    members: { type: [MemberSchema], default: [] },
    subscription: {
      planId: { type: Schema.Types.ObjectId, ref: "Plan" },
      planName: { type: String },
      status: { type: String, enum: ["active", "inactive", "cancelled"] },
      billingType: { type: String, enum: ["monthly", "annual"] },
      expiresAt: { type: Date, default: null },
      activationMethod: { type: String, enum: ["manual", "cortesia", "pix", "boleto", "card"] },
      activatedAt: { type: Date, default: null },
      activatedBy: { type: String },
      lastPaymentId: { type: String },
    },
    trialEndsAt: { type: Date, default: null },
    ai: {
      active: { type: Boolean, default: false },
      assistantName: { type: String, default: "Assistente" },
      provider: { type: String, enum: ["gemini", "openai", "claude"], default: "gemini" },
      model: { type: String },
      token: { type: String },
      systemPrompt: { type: String },
      knowledgeBase: { type: String },
      greeting: { type: String },
      extraInstructions: { type: String },
      maxTurns: { type: Number, default: 30 },
      vendeEstoqueCnv: { type: Boolean, default: true },
    },
    financiamento: {
      ativo: { type: Boolean, default: false },
      taxaMensal: { type: Number, default: 1.99 },
      entradaMinimaPct: { type: Number, default: 20 },
      prazos: { type: [Number], default: [24, 36, 48, 60] },
      observacao: { type: String },
    },
    mapsUrl: { type: String },
  },
  { timestamps: true, collection: "wa_stores" },
);
// Uma loja por concessionária e uma por lojista titular.
WaStoreSchema.index(
  { concessionariaId: 1 },
  { unique: true, partialFilterExpression: { concessionariaId: { $type: "objectId" } } },
);
WaStoreSchema.index(
  { ownerUserId: 1 },
  { unique: true, partialFilterExpression: { ownerUserId: { $type: "objectId" } } },
);
WaStoreSchema.index({ "members.email": 1 });

if (process.env.NODE_ENV === "development" && mongoose.models.WaStore) {
  delete mongoose.models.WaStore;
}

export const WaStore: Model<IWaStore> =
  mongoose.models.WaStore || mongoose.model<IWaStore>("WaStore", WaStoreSchema);
