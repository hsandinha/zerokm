// Models operacionais do WhatsApp CNV — vivem no MESMO banco `zerokm`,
// em coleções novas prefixadas com `wa_` para não colidir com as da zerokm.

import mongoose, { Schema, Document, Model } from "mongoose";

// ── Configuração (documento único) ───────────────────────────
export interface IWaSettings extends Document {
  // IA
  assistantName: string;
  aiActive: boolean;
  maxTurns: number;
  systemPrompt?: string; // em branco = prompt de fábrica
  knowledgeBase?: string; // explicativo institucional da CNV ({{conhecimento}})
  greeting?: string;
  extraInstructions?: string;
  // WABA (token/appSecret criptografados com APP_ENCRYPTION_KEY)
  wabaPhoneNumberId?: string;
  wabaId?: string;
  wabaToken?: string;
  wabaAppSecret?: string;
  wabaVerifyToken?: string;
  wabaDisplayPhone?: string;
  updatedAt: Date;
}

const WaSettingsSchema: Schema = new Schema(
  {
    assistantName: { type: String, default: "Vera" },
    aiActive: { type: Boolean, default: true },
    maxTurns: { type: Number, default: 30 },
    systemPrompt: { type: String },
    knowledgeBase: { type: String },
    greeting: { type: String },
    extraInstructions: { type: String },
    wabaPhoneNumberId: { type: String },
    wabaId: { type: String },
    wabaToken: { type: String },
    wabaAppSecret: { type: String },
    wabaVerifyToken: { type: String },
    wabaDisplayPhone: { type: String },
  },
  { timestamps: true, collection: "wa_settings" },
);

// ── Contato ──────────────────────────────────────────────────
export interface IWaContact extends Document {
  phone: string; // formato +5531999999999 (canônico)
  name?: string;
  email?: string;
  document?: string; // CPF/CNPJ (dígitos)
  company?: string;
  city?: string;
  state?: string;
  cnae?: string;
  source: "whatsapp" | "cnpja" | "csv" | "manual" | "procob";
  optOut: boolean;
  userId?: string; // _id do User da zerokm quando o cadastro foi criado
  firebaseUid?: string;
  // A empresa que originou a abordagem. Um sócio com 5 empresas tem UM
  // contato: a conversa é por telefone, não por CNPJ.
  targetId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const WaContactSchema: Schema = new Schema(
  {
    phone: { type: String, required: true, unique: true },
    name: { type: String },
    email: { type: String },
    document: { type: String },
    company: { type: String },
    city: { type: String },
    state: { type: String },
    cnae: { type: String },
    source: {
      type: String,
      enum: ["whatsapp", "cnpja", "csv", "manual", "procob"],
      default: "whatsapp",
    },
    optOut: { type: Boolean, default: false },
    userId: { type: String },
    firebaseUid: { type: String },
    targetId: { type: Schema.Types.ObjectId, ref: "WaTarget" },
  },
  { timestamps: true, collection: "wa_contacts" },
);
WaContactSchema.index({ name: 1 });
WaContactSchema.index({ document: 1 });

// ── Conversa ─────────────────────────────────────────────────
export type WaConversationStatus = "ai_active" | "waiting_human" | "human_active" | "closed";

// Etapa do funil da CNV. Avança sozinha pelo fluxo (disparo → resposta →
// cadastro → pagamento → assinatura) e pode ser movida à mão no kanban.
export type WaStage =
  | "abordado"
  | "conversa"
  | "cadastro"
  | "pagamento"
  | "ganho"
  | "perdido";

export interface IWaConversation extends Document {
  contactId: mongoose.Types.ObjectId;
  status: WaConversationStatus;
  stage: WaStage;
  stageChangedAt: Date;
  /** E-mail de quem assumiu a conversa na Central (filtro "Minhas"). */
  assignedTo?: string;
  /** Desde quando espera um humano. Base do SLA da caixa de entrada. */
  waitingSince?: Date | null;
  outcome?: "interessado" | "sem_interesse" | "sem_resposta" | "opt_out" | null;
  transferReason?: string;
  campaignId?: mongoose.Types.ObjectId;
  lastMessageAt?: Date;
  lastInboundAt?: Date;
  lastMessagePreview?: string;
  unreadCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const WaConversationSchema: Schema = new Schema(
  {
    contactId: { type: Schema.Types.ObjectId, ref: "WaContact", required: true, unique: true },
    status: {
      type: String,
      enum: ["ai_active", "waiting_human", "human_active", "closed"],
      default: "ai_active",
    },
    stage: {
      type: String,
      enum: ["abordado", "conversa", "cadastro", "pagamento", "ganho", "perdido"],
      default: "conversa",
    },
    stageChangedAt: { type: Date, default: Date.now },
    assignedTo: { type: String },
    waitingSince: { type: Date, default: null },
    outcome: {
      type: String,
      enum: ["interessado", "sem_interesse", "sem_resposta", "opt_out", null],
      default: null,
    },
    transferReason: { type: String },
    campaignId: { type: Schema.Types.ObjectId, ref: "WaCampaign" },
    lastMessageAt: { type: Date },
    lastInboundAt: { type: Date },
    lastMessagePreview: { type: String },
    unreadCount: { type: Number, default: 0 },
  },
  { timestamps: true, collection: "wa_conversations" },
);
WaConversationSchema.index({ lastMessageAt: -1 });
WaConversationSchema.index({ stage: 1, stageChangedAt: -1 });
WaConversationSchema.index({ status: 1, waitingSince: 1 });
WaConversationSchema.index({ assignedTo: 1, status: 1 });

// ── Mensagem ─────────────────────────────────────────────────
export interface IWaMessage extends Document {
  conversationId: mongoose.Types.ObjectId;
  direction: "inbound" | "outbound";
  sender: "contact" | "ai" | "human" | "system";
  content?: string;
  mediaType: string; // text | image | audio | video | document | sticker | template | unknown
  mediaId?: string; // media id da Meta (proxy sob demanda em /api/wa/media)
  externalId?: string; // wamid
  status?: string; // sent | delivered | read | failed
  /** Motivo devolvido pela Meta quando o status vira failed ("130472: …"). */
  error?: string;
  reaction?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WaMessageSchema: Schema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: "WaConversation", required: true },
    direction: { type: String, enum: ["inbound", "outbound"], required: true },
    sender: { type: String, enum: ["contact", "ai", "human", "system"], required: true },
    content: { type: String },
    mediaType: { type: String, default: "text" },
    mediaId: { type: String },
    externalId: { type: String, unique: true, sparse: true },
    status: { type: String },
    error: { type: String },
    reaction: { type: String },
  },
  { timestamps: true, collection: "wa_messages" },
);
WaMessageSchema.index({ conversationId: 1, createdAt: 1 });
WaMessageSchema.index({ createdAt: -1 });

// ── Fila de IA ───────────────────────────────────────────────
export interface IWaAiJob extends Document {
  conversationId: mongoose.Types.ObjectId;
  status: "pending" | "processing" | "done" | "failed";
  runAfter: Date;
  attempts: number;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WaAiJobSchema: Schema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: "WaConversation", required: true },
    status: { type: String, enum: ["pending", "processing", "done", "failed"], default: "pending" },
    runAfter: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    lastError: { type: String },
  },
  { timestamps: true, collection: "wa_aijobs" },
);
WaAiJobSchema.index({ status: 1, runAfter: 1 });
// Um pendente por conversa (mensagens picadas empurram o runAfter do mesmo job)
WaAiJobSchema.index(
  { conversationId: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } },
);

// ── Campanha ─────────────────────────────────────────────────
// Vocabulário de status igual ao do painel da Conciliadora: as duas operações
// são lidas do mesmo jeito.
export type WaCampaignStatus =
  | "draft"
  | "scheduled"
  | "running"
  | "paused"
  | "completed"
  | "cancelled"
  | "failed";

export interface IWaCampaign extends Document {
  name: string;
  templateName: string;
  templateLanguage: string;
  /** Corpo do template no momento do disparo, com {{n}} — o texto de cada
   *  destinatário sai daqui + params. Sem isto a Central e a IA veriam só um
   *  rótulo no lugar da mensagem de abertura. */
  templateBody?: string;
  templateCategory?: string;
  status: WaCampaignStatus;
  source: "cnpja" | "csv" | "manual" | "targets" | "pessoa";
  filters?: { cnae?: string; uf?: string; city?: string };
  importId?: mongoose.Types.ObjectId;
  /** Como cada {{n}} do template é preenchido (ver src/lib/campaign-params.ts). */
  paramsMap: Array<{ type: string; value?: string }>;
  // Ritmo e janela
  throttlePerRun: number; // envios por rodada do worker (1 rodada/min)
  throttleSeconds: number; // espaçamento entre envios dentro da rodada
  dailyLimit: number; // 0 = sem limite
  scheduledAt?: Date | null; // em branco = começa ao ser iniciada
  sendStart: string; // "09:00"
  sendEnd: string; // "18:00"
  sendDays: number[]; // 0 = domingo … 6 = sábado
  timezone: string;
  /** Templates do 2º, 3º… toque. Vazio = sem cadência. */
  followupTemplates: string[];
  followupDelaysHours: number[];
  // Contadores
  total: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  replied: number;
  skipped: number;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WaCampaignSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    templateName: { type: String, required: true },
    templateLanguage: { type: String, default: "pt_BR" },
    templateBody: { type: String },
    templateCategory: { type: String },
    status: {
      type: String,
      enum: ["draft", "scheduled", "running", "paused", "completed", "cancelled", "failed"],
      default: "draft",
    },
    source: {
      type: String,
      enum: ["cnpja", "csv", "manual", "targets", "pessoa"],
      default: "manual",
    },
    filters: { cnae: String, uf: String, city: String },
    importId: { type: Schema.Types.ObjectId, ref: "WaImport" },
    paramsMap: { type: [{ _id: false, type: { type: String }, value: String }], default: [] },
    throttlePerRun: { type: Number, default: 10 },
    throttleSeconds: { type: Number, default: 4 },
    dailyLimit: { type: Number, default: 0 },
    scheduledAt: { type: Date, default: null },
    sendStart: { type: String, default: "09:00" },
    sendEnd: { type: String, default: "18:00" },
    sendDays: { type: [Number], default: [1, 2, 3, 4, 5] },
    timezone: { type: String, default: "America/Sao_Paulo" },
    followupTemplates: { type: [String], default: [] },
    followupDelaysHours: { type: [Number], default: [48, 120] },
    total: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    read: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    replied: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    createdBy: { type: String },
  },
  { timestamps: true, collection: "wa_campaigns" },
);
WaCampaignSchema.index({ status: 1, createdAt: -1 });

// ── Destinatário de campanha ─────────────────────────────────
export interface IWaCampaignRecipient extends Document {
  campaignId: mongoose.Types.ObjectId;
  targetId?: mongoose.Types.ObjectId;
  /** Sócio dono deste número. Vários destinatários com o mesmo partnerId são
   *  a MESMA pessoa — quando um responde, os outros são cancelados. */
  partnerId?: mongoose.Types.ObjectId;
  /** Ordem de tentativa dentro da mesma pessoa (1 = melhor número). */
  attempt: number;
  phone: string;
  name?: string;
  params: string[]; // variáveis {{1}}, {{2}}... do template
  status: "pending" | "sent" | "delivered" | "read" | "failed" | "replied" | "skipped";
  sentAt?: Date;
  externalId?: string;
  error?: string;
  conversationId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const WaCampaignRecipientSchema: Schema = new Schema(
  {
    campaignId: { type: Schema.Types.ObjectId, ref: "WaCampaign", required: true },
    targetId: { type: Schema.Types.ObjectId, ref: "WaTarget" },
    partnerId: { type: Schema.Types.ObjectId, ref: "WaPartner" },
    attempt: { type: Number, default: 1 },
    phone: { type: String, required: true },
    name: { type: String },
    params: { type: [String], default: [] },
    status: {
      type: String,
      enum: ["pending", "sent", "delivered", "read", "failed", "replied", "skipped"],
      default: "pending",
    },
    sentAt: { type: Date },
    externalId: { type: String },
    error: { type: String },
    conversationId: { type: Schema.Types.ObjectId, ref: "WaConversation" },
  },
  { timestamps: true, collection: "wa_campaignrecipients" },
);
WaCampaignRecipientSchema.index({ campaignId: 1, status: 1 });
WaCampaignRecipientSchema.index({ phone: 1, sentAt: -1 });
WaCampaignRecipientSchema.index({ partnerId: 1, status: 1 });
// Um telefone só entra uma vez na mesma campanha.
WaCampaignRecipientSchema.index({ campaignId: 1, phone: 1 }, { unique: true });

// ── Cadência de follow-up ────────────────────────────────────
// Quem não respondeu não pode ficar parado: sem isto, a oportunidade morre na
// primeira mensagem sem resposta.
export interface IWaFollowup extends Document {
  conversationId: mongoose.Types.ObjectId;
  campaignId?: mongoose.Types.ObjectId;
  step: number; // 1º, 2º, 3º toque
  runAfter: Date;
  status: "pending" | "sent" | "cancelled" | "failed";
  templateName?: string; // fora da janela de 24h, só template
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WaFollowupSchema: Schema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: "WaConversation", required: true },
    campaignId: { type: Schema.Types.ObjectId, ref: "WaCampaign" },
    step: { type: Number, default: 1 },
    runAfter: { type: Date, required: true },
    status: {
      type: String,
      enum: ["pending", "sent", "cancelled", "failed"],
      default: "pending",
    },
    templateName: { type: String },
    error: { type: String },
  },
  { timestamps: true, collection: "wa_followups" },
);
WaFollowupSchema.index({ status: 1, runAfter: 1 });
WaFollowupSchema.index(
  { conversationId: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } },
);

// Em desenvolvimento, recompila os models para o hot-reload aplicar mudanças
// de schema (mesmo padrão dos models da zerokm).
if (process.env.NODE_ENV === "development") {
  for (const name of [
    "WaSettings",
    "WaContact",
    "WaConversation",
    "WaMessage",
    "WaAiJob",
    "WaCampaign",
    "WaCampaignRecipient",
    "WaFollowup",
  ]) {
    if (mongoose.models[name]) delete mongoose.models[name];
  }
}

export const WaSettings: Model<IWaSettings> =
  mongoose.models.WaSettings || mongoose.model<IWaSettings>("WaSettings", WaSettingsSchema);
export const WaContact: Model<IWaContact> =
  mongoose.models.WaContact || mongoose.model<IWaContact>("WaContact", WaContactSchema);
export const WaConversation: Model<IWaConversation> =
  mongoose.models.WaConversation ||
  mongoose.model<IWaConversation>("WaConversation", WaConversationSchema);
export const WaMessage: Model<IWaMessage> =
  mongoose.models.WaMessage || mongoose.model<IWaMessage>("WaMessage", WaMessageSchema);
export const WaAiJob: Model<IWaAiJob> =
  mongoose.models.WaAiJob || mongoose.model<IWaAiJob>("WaAiJob", WaAiJobSchema);
export const WaCampaign: Model<IWaCampaign> =
  mongoose.models.WaCampaign || mongoose.model<IWaCampaign>("WaCampaign", WaCampaignSchema);
export const WaCampaignRecipient: Model<IWaCampaignRecipient> =
  mongoose.models.WaCampaignRecipient ||
  mongoose.model<IWaCampaignRecipient>("WaCampaignRecipient", WaCampaignRecipientSchema);
export const WaFollowup: Model<IWaFollowup> =
  mongoose.models.WaFollowup || mongoose.model<IWaFollowup>("WaFollowup", WaFollowupSchema);
