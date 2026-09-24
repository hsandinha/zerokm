// Gestão e integrações do painel: quem entra, quem chama a API pública e para
// quem avisamos o que acontece.
//
// Chave de API: guardamos só o hash — a chave inteira aparece uma vez, na
// criação, e nunca mais. Webhook: cada evento vira uma "entrega" com
// retentativa; a assinatura HMAC usa o segredo do endpoint.

import mongoose, { Schema, Document, Model } from "mongoose";

// ── Quem pode entrar no painel ───────────────────────────────
// Autenticar não é autorizar: a senha vive no Firebase da zerokm; esta
// coleção é a lista de quem, além de autenticar, opera o painel — e com que
// papel. Coleção vazia = qualquer administrador da zerokm entra (bootstrap).
export type PanelRole = "admin" | "operador";

export interface IWaAdmin extends Document {
  email: string;
  name?: string;
  role: PanelRole;
  createdBy?: string;
  lastSignInAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const WaAdminSchema: Schema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String },
    role: { type: String, enum: ["admin", "operador"], default: "admin" },
    createdBy: { type: String },
    lastSignInAt: { type: Date },
  },
  { timestamps: true, collection: "wa_admins" },
);

// ── Chaves da API pública (/api/v1) ──────────────────────────
export interface IWaApiKey extends Document {
  name: string;
  prefix: string; // "cnv_live_ab12cd…" para a lista
  keyHash: string; // sha256 da chave inteira
  createdBy?: string;
  lastUsedAt?: Date;
  calls: number;
  revokedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const WaApiKeySchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    prefix: { type: String, required: true },
    keyHash: { type: String, required: true, unique: true },
    createdBy: { type: String },
    lastUsedAt: { type: Date },
    calls: { type: Number, default: 0 },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "wa_apikeys" },
);

// ── Webhooks de saída ────────────────────────────────────────
export interface IWaWebhookEndpoint extends Document {
  url: string;
  secret: string; // assina cada entrega (X-CNV-Signature)
  events: string[];
  enabled: boolean;
  createdBy?: string;
  lastDeliveryAt?: Date;
  lastStatus?: number;
  failures: number; // falhas seguidas; zera ao entregar
  createdAt: Date;
  updatedAt: Date;
}

const WaWebhookEndpointSchema: Schema = new Schema(
  {
    url: { type: String, required: true },
    secret: { type: String, required: true },
    events: { type: [String], default: [] },
    enabled: { type: Boolean, default: true },
    createdBy: { type: String },
    lastDeliveryAt: { type: Date },
    lastStatus: { type: Number },
    failures: { type: Number, default: 0 },
  },
  { timestamps: true, collection: "wa_webhook_endpoints" },
);

export interface IWaWebhookDelivery extends Document {
  endpointId: mongoose.Types.ObjectId;
  event: string;
  payload: Record<string, unknown>;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  nextAttemptAt: Date;
  responseStatus?: number;
  lastError?: string;
  deliveredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const WaWebhookDeliverySchema: Schema = new Schema(
  {
    endpointId: { type: Schema.Types.ObjectId, ref: "WaWebhookEndpoint", required: true },
    event: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ["pending", "delivered", "failed"],
      default: "pending",
    },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: Date.now },
    responseStatus: { type: Number },
    lastError: { type: String },
    deliveredAt: { type: Date },
  },
  { timestamps: true, collection: "wa_webhook_deliveries" },
);
WaWebhookDeliverySchema.index({ status: 1, nextAttemptAt: 1 });
WaWebhookDeliverySchema.index({ endpointId: 1, createdAt: -1 });

if (process.env.NODE_ENV === "development") {
  for (const name of ["WaAdmin", "WaApiKey", "WaWebhookEndpoint", "WaWebhookDelivery"]) {
    if (mongoose.models[name]) delete mongoose.models[name];
  }
}

export const WaAdmin: Model<IWaAdmin> =
  mongoose.models.WaAdmin || mongoose.model<IWaAdmin>("WaAdmin", WaAdminSchema);
export const WaApiKey: Model<IWaApiKey> =
  mongoose.models.WaApiKey || mongoose.model<IWaApiKey>("WaApiKey", WaApiKeySchema);
export const WaWebhookEndpoint: Model<IWaWebhookEndpoint> =
  mongoose.models.WaWebhookEndpoint ||
  mongoose.model<IWaWebhookEndpoint>("WaWebhookEndpoint", WaWebhookEndpointSchema);
export const WaWebhookDelivery: Model<IWaWebhookDelivery> =
  mongoose.models.WaWebhookDelivery ||
  mongoose.model<IWaWebhookDelivery>("WaWebhookDelivery", WaWebhookDeliverySchema);
