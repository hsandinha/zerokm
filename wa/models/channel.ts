// Canais de atendimento — mesmo modelo do Chatrun: cada número de WhatsApp,
// cada conta do Instagram, cada Página do Facebook (Messenger) e a conta de
// SMS/RCS da loja é um canal, com as credenciais DELE. A Vera é só o
// primeiro dono de canais (tenantId null = o próprio CNV); as lojas que
// assinarem o atendimento entram com o id delas, sem mudar nada aqui.
//
// Segredos (token, app secret, token da Página, chave do provedor de SMS e o
// segredo do webhook de SMS) ficam criptografados com APP_ENCRYPTION_KEY.

import mongoose, { Schema, Document, Model } from "mongoose";

export type WaChannelKind = "whatsapp" | "instagram" | "messenger" | "sms";
export const WA_CHANNEL_KINDS: WaChannelKind[] = ["whatsapp", "instagram", "messenger", "sms"];
export type WaSmsProvider = "zenvia" | "comtele";
export type WaChannelStatus = "connected" | "error" | "disconnected";

export interface IWaChannel extends Document {
  kind: WaChannelKind;
  /** Dono do canal. null = CNV (Vera). */
  tenantId: string | null;
  status: WaChannelStatus;
  displayName?: string;
  /** De onde vem o WhatsApp: "chatrun" = conectado pelo Chatrun Conexão (o
   *  gateway guarda o token e recebe o webhook); sem valor = credencial própria
   *  (o número do CNV no formulário IA & WABA ou o cadastro manual). */
  provider?: "chatrun";
  /** Conexão no gateway (connection.id) e a conta da loja nele. */
  chatrunConnectionId?: string;
  chatrunAccountId?: string;
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
  // Messenger (Página do Facebook) — token DA PÁGINA, tirado de um token de
  // usuário de longa duração: não vence (cai se tirarem o app ou o acesso).
  fbPageId?: string;
  fbPageName?: string;
  fbPageToken?: string;
  /** Usuário do Facebook (id no app) que conectou a Página. */
  fbUserId?: string;
  // SMS/RCS — cada loja paga o próprio provedor: a conta é DELA, não do CNV.
  smsProvider?: WaSmsProvider;
  /** Zenvia: X-API-TOKEN; Comtele: x-api-key. Criptografado. */
  smsToken?: string;
  /** Zenvia: remetente (alias da conta SMS). Comtele não usa. */
  smsSender?: string;
  /** Comtele: rota de envio (opcional; sem ela vale a padrão da conta). */
  smsRoute?: number;
  /** Zenvia: id do agente RCS da marca. Com ele a mensagem vai por RCS e a
   *  própria Zenvia cai para SMS quando o aparelho não tem RCS. */
  rcsAgentId?: string;
  /** Segredo do caminho do webhook de SMS (/api/webhooks/sms/<id>/<segredo>).
   *  Os provedores não assinam o que mandam: o endereço é a autenticação. */
  smsWebhookSecret?: string;
  /** Último erro de conexão/renovação, para o painel pedir reconexão. */
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WaChannelSchema: Schema = new Schema(
  {
    kind: { type: String, enum: WA_CHANNEL_KINDS, required: true },
    tenantId: { type: String, default: null },
    status: {
      type: String,
      enum: ["connected", "error", "disconnected"],
      default: "connected",
    },
    displayName: { type: String },
    provider: { type: String, enum: ["chatrun"] },
    chatrunConnectionId: { type: String },
    chatrunAccountId: { type: String },
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
    fbPageId: { type: String },
    fbPageName: { type: String },
    fbPageToken: { type: String },
    fbUserId: { type: String },
    smsProvider: { type: String, enum: ["zenvia", "comtele"] },
    smsToken: { type: String },
    smsSender: { type: String },
    smsRoute: { type: Number },
    rcsAgentId: { type: String },
    smsWebhookSecret: { type: String },
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
  { chatrunConnectionId: 1 },
  { unique: true, partialFilterExpression: { chatrunConnectionId: { $type: "string" } } },
);
WaChannelSchema.index(
  { igUserId: 1 },
  { unique: true, partialFilterExpression: { igUserId: { $type: "string" } } },
);
WaChannelSchema.index(
  { fbPageId: 1 },
  { unique: true, partialFilterExpression: { fbPageId: { $type: "string" } } },
);
// SMS: um canal por loja (desligar não apaga; religar reaproveita o mesmo).
WaChannelSchema.index(
  { tenantId: 1 },
  { unique: true, partialFilterExpression: { kind: "sms" }, name: "um_sms_por_loja" },
);

if (process.env.NODE_ENV === "development" && mongoose.models.WaChannel) {
  delete mongoose.models.WaChannel;
}

export const WaChannel: Model<IWaChannel> =
  mongoose.models.WaChannel || mongoose.model<IWaChannel>("WaChannel", WaChannelSchema);
