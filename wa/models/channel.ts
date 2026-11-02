// Canais de atendimento — mesmo modelo do Chatrun: cada número de WhatsApp e
// cada conta do Instagram é um canal, com as credenciais DELE. A Vera é só o
// primeiro dono de canais (tenantId null = o próprio CNV); as lojas que
// assinarem o atendimento entram com o id delas, sem mudar nada aqui.
//
// Segredos (token, app secret) ficam criptografados com APP_ENCRYPTION_KEY.

import mongoose, { Schema, Document, Model } from "mongoose";

export type WaChannelKind = "whatsapp" | "instagram";
export type WaChannelStatus = "connected" | "error" | "disconnected";

export interface IWaChannel extends Document {
  kind: WaChannelKind;
  /** Dono do canal. null = CNV (Vera). */
  tenantId: string | null;
  status: WaChannelStatus;
  displayName?: string;
  // WhatsApp (Cloud API)
  phoneNumberId?: string;
  wabaId?: string;
  token?: string;
  appSecret?: string;
  verifyToken?: string;
  displayPhone?: string;
  // Instagram (Instagram Login) — token de 60 dias, renovado pelo worker
  igUserId?: string;
  igUsername?: string;
  igToken?: string;
  igTokenExpiresAt?: Date;
  /** Último erro de conexão/renovação, para o painel pedir reconexão. */
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WaChannelSchema: Schema = new Schema(
  {
    kind: { type: String, enum: ["whatsapp", "instagram"], required: true },
    tenantId: { type: String, default: null },
    status: {
      type: String,
      enum: ["connected", "error", "disconnected"],
      default: "connected",
    },
    displayName: { type: String },
    phoneNumberId: { type: String },
    wabaId: { type: String },
    token: { type: String },
    appSecret: { type: String },
    verifyToken: { type: String },
    displayPhone: { type: String },
    igUserId: { type: String },
    igUsername: { type: String },
    igToken: { type: String },
    igTokenExpiresAt: { type: Date },
    lastError: { type: String },
  },
  { timestamps: true, collection: "wa_channels" },
);
WaChannelSchema.index({ tenantId: 1, kind: 1 });
// Um número / uma conta pertence a um canal só.
WaChannelSchema.index(
  { phoneNumberId: 1 },
  { unique: true, partialFilterExpression: { phoneNumberId: { $type: "string" } } },
);
WaChannelSchema.index(
  { igUserId: 1 },
  { unique: true, partialFilterExpression: { igUserId: { $type: "string" } } },
);

if (process.env.NODE_ENV === "development" && mongoose.models.WaChannel) {
  delete mongoose.models.WaChannel;
}

export const WaChannel: Model<IWaChannel> =
  mongoose.models.WaChannel || mongoose.model<IWaChannel>("WaChannel", WaChannelSchema);
