// Models operacionais do WhatsApp CNV — vivem no MESMO banco `zerokm`,
// em coleções novas prefixadas com `wa_` para não colidir com as da zerokm.

import mongoose, { Schema, Document, Model } from "mongoose";
import { OrigemSchema, type WaOrigem } from "@wa/models/origem";

// ── Configuração (documento único) ───────────────────────────
export interface IWaSettings extends Document {
  // IA
  assistantName: string;
  aiActive: boolean;
  maxTurns: number;
  systemPrompt?: string; // em branco = prompt de fábrica
  knowledgeBase?: string; // explicativo institucional do CNV ({{conhecimento}})
  greeting?: string;
  extraInstructions?: string;
  // Legado: o WABA do CNV migra sozinho para wa_channels na primeira leitura
  // (ver channels.ts). Ficam no schema só para essa migração conseguir ler.
  wabaPhoneNumberId?: string;
  wabaId?: string;
  wabaToken?: string;
  wabaAppSecret?: string;
  wabaVerifyToken?: string;
  wabaDisplayPhone?: string;
  /** Conta do CNV no Chatrun Conexão (onde ficam os canais da Vera). */
  chatrunAccountId?: string;
  /** A conta acima é a do CNV (criada pelo nome ou devolvida pela Meta no
   *  convite). Conta antiga, achada pelo e-mail de quem conectou, não vale. */
  chatrunAccountProprio?: boolean;
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
    chatrunAccountId: { type: String },
    chatrunAccountProprio: { type: Boolean },
  },
  { timestamps: true, collection: "wa_settings" },
);

// ── Contato ──────────────────────────────────────────────────
export interface IWaContact extends Document {
  // formato +5531999999999 (canônico). Contato do Instagram e do Messenger
  // não tem telefone: a chave vira "ig:<IGSID>" ou "fb:<PSID>", igual ao
  // Chatrun — unicidade e todo caminho que já usa `phone` continuam valendo.
  // O SMS usa o telefone canônico: é o mesmo contato do WhatsApp.
  phone: string;
  /** Loja dona do contato (WaStore). null/ausente = CNV. O mesmo telefone
   *  pode ser contato de várias lojas — cada uma tem o seu. */
  tenantId?: string | null;
  name?: string;
  email?: string;
  document?: string; // CPF/CNPJ (dígitos)
  company?: string;
  city?: string;
  state?: string;
  cnae?: string;
  source: "whatsapp" | "instagram" | "messenger" | "sms" | "cnpja" | "csv" | "manual" | "procob";
  optOut: boolean;
  igUserId?: string;
  igUsername?: string;
  /** Id da pessoa na Página do Facebook (PSID). Contato do Messenger. */
  fbPsid?: string;
  /** Celular que a pessoa informou fora do WhatsApp (ex.: no Direct, para o cadastro). */
  whatsappPhone?: string;

  /** Anúncio por onde a pessoa chegou pela primeira vez (wa/lib/origem-loja.ts). */
  origemPrimeira?: WaOrigem | null;
  /** O anúncio mais recente por onde ela chegou. */
  origemUltima?: WaOrigem | null;

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
    phone: { type: String, required: true },
    tenantId: { type: String, default: null },
    name: { type: String },
    email: { type: String },
    document: { type: String },
    company: { type: String },
    city: { type: String },
    state: { type: String },
    cnae: { type: String },
    source: {
      type: String,
      enum: ["whatsapp", "instagram", "messenger", "sms", "cnpja", "csv", "manual", "procob"],
      default: "whatsapp",
    },
    optOut: { type: Boolean, default: false },
    igUserId: { type: String },
    igUsername: { type: String },
    fbPsid: { type: String },
    whatsappPhone: { type: String },

    origemPrimeira: { type: OrigemSchema, default: undefined },
    origemUltima: { type: OrigemSchema, default: undefined },

    userId: { type: String },
    firebaseUid: { type: String },
    targetId: { type: Schema.Types.ObjectId, ref: "WaTarget" },
  },
  { timestamps: true, collection: "wa_contacts" },
);
// Unicidade por loja. O índice antigo `phone_1` (único global) é removido
// pelo scripts/migrar-atendimento-lojas.mjs — sem isso, o mesmo telefone não
// conseguiria ser contato do CNV e de uma loja ao mesmo tempo.
WaContactSchema.index({ tenantId: 1, phone: 1 }, { unique: true });
WaContactSchema.index({ name: 1 });
WaContactSchema.index({ document: 1 });

// ── Ficha do contato (cadastro à mão, importação, automações) ─
// Bloco à parte (a interface se junta à de cima): o que a loja preenche na
// ficha. Sem `tipo` gravado o contato é cliente (todo mundo que já existia).
export interface IWaContact {
  tipo?: "cliente" | "fornecedor" | "parceiro" | "outros";
  /** Aniversário "AAAA-MM-DD". Mês e dia ficam também separados: o filtro de
   *  aniversariantes e a automação do dia consultam pelo índice. */
  birthDate?: string;
  birthMonth?: number;
  birthDay?: number;
  address?: { zip?: string; street?: string; number?: string; complement?: string; district?: string };
  notes?: string;
}
WaContactSchema.add({
  tipo: { type: String, enum: ["cliente", "fornecedor", "parceiro", "outros"] },
  birthDate: { type: String },
  birthMonth: { type: Number },
  birthDay: { type: Number },
  address: {
    zip: { type: String },
    street: { type: String },
    number: { type: String },
    complement: { type: String },
    district: { type: String },
  },
  notes: { type: String, maxlength: 2000 },
});
WaContactSchema.index({ tenantId: 1, birthMonth: 1, birthDay: 1 });

// ── Conversa ─────────────────────────────────────────────────
export type WaConversationStatus = "ai_active" | "waiting_human" | "human_active" | "closed";

// Etapa do funil do CNV. Avança sozinha pelo fluxo (disparo → resposta →
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
  /** Loja (WaStore). null/ausente = CNV. Igual ao do contato. */
  tenantId?: string | null;
  /** Canal por onde a conversa acontece. Ausente = WhatsApp do CNV (conversas
   *  de antes dos canais). */
  channelId?: mongoose.Types.ObjectId;
  status: WaConversationStatus;
  stage: WaStage;
  /** Coluna do funil em que o cartão foi posto à mão (WaFunilColuna). Ausente
   *  ou incompatível com a etapa = a coluna de sistema da etapa. */
  stageId?: mongoose.Types.ObjectId | null;
  stageChangedAt: Date;
  /** E-mail de quem assumiu a conversa na Central (filtro "Minhas"). */
  assignedTo?: string;
  /** Desde quando espera um humano. Base do SLA da caixa de entrada. */
  waitingSince?: Date | null;
  outcome?: "interessado" | "sem_interesse" | "sem_resposta" | "opt_out" | null;
  transferReason?: string;
  campaignId?: mongoose.Types.ObjectId;

  /** Anúncio que abriu (ou reabriu) a conversa: o cartão no topo e a Origem. */
  origem?: WaOrigem | null;
  /** Etiquetas da loja (WaEtiqueta) aplicadas na conversa. */
  etiquetas?: mongoose.Types.ObjectId[];

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
    tenantId: { type: String, default: null },
    channelId: { type: Schema.Types.ObjectId, ref: "WaChannel" },
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
    stageId: { type: Schema.Types.ObjectId, ref: "WaFunilColuna", default: null },
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

    origem: { type: OrigemSchema, default: undefined },
    etiquetas: { type: [{ type: Schema.Types.ObjectId, ref: "WaEtiqueta" }], default: undefined },

    lastMessageAt: { type: Date },
    lastInboundAt: { type: Date },
    lastMessagePreview: { type: String },
    unreadCount: { type: Number, default: 0 },
  },
  { timestamps: true, collection: "wa_conversations" },
);
WaConversationSchema.index({ lastMessageAt: -1 });
WaConversationSchema.index({ tenantId: 1, lastMessageAt: -1 });
WaConversationSchema.index({ stage: 1, stageChangedAt: -1 });
WaConversationSchema.index({ tenantId: 1, stageId: 1 });
WaConversationSchema.index({ status: 1, waitingSince: 1 });
WaConversationSchema.index({ assignedTo: 1, status: 1 });

// Filtro por etiqueta na Central e o relatório de Origens por período.
WaConversationSchema.index({ tenantId: 1, etiquetas: 1 });
WaConversationSchema.index({ tenantId: 1, "origem.em": -1 });
// ── Follow-up da coluna e automações ─────────────────────────
// Bloco à parte (a interface se junta à de cima). O follow-up conta os toques
// da coluna em que o cartão está (outra coluna recomeça do zero) e a resposta
// do cliente zera a contagem (wa/lib/inbound.ts).
export interface IWaConversation {
  /** Quando foi encerrada (pós-atendimento). Gravado sozinho pelo gancho abaixo. */
  closedAt?: Date | null;
  followupCount?: number;
  followupLastAt?: Date | null;
  followupColunaId?: mongoose.Types.ObjectId | null;
  /** Última mensagem automática (follow-up ou automação): uma não sai em
   *  cima da outra. */
  ultimoAutomaticoAt?: Date | null;
}
WaConversationSchema.add({
  closedAt: { type: Date, default: null },
  followupCount: { type: Number, default: 0 },
  followupLastAt: { type: Date, default: null },
  followupColunaId: { type: Schema.Types.ObjectId, ref: "WaFunilColuna", default: null },
  ultimoAutomaticoAt: { type: Date, default: null },
});
WaConversationSchema.index({ status: 1, closedAt: -1 });
// Todo caminho que encerra (Central, IA, opt-out) grava só `status: "closed"`:
// o horário do encerramento sai daqui, sem cada um precisar lembrar.
function marcarEncerramento(this: mongoose.Query<unknown, unknown>) {
  const u = this.getUpdate() as Record<string, unknown> | null;
  if (!u || Array.isArray(u)) return;
  const set = (u.$set ?? {}) as Record<string, unknown>;
  const status = u.status ?? set.status;
  if (status === "closed" && u.closedAt === undefined && set.closedAt === undefined) {
    this.set("closedAt", new Date());
  }
}
WaConversationSchema.pre(["updateOne", "updateMany", "findOneAndUpdate"], marcarEncerramento);
WaConversationSchema.pre("save", function (this: IWaConversation) {
  if (!this.isNew && this.isModified("status") && this.status === "closed") this.closedAt = new Date();
});

// ── Mensagem ─────────────────────────────────────────────────
export interface IWaMessage extends Document {
  conversationId: mongoose.Types.ObjectId;
  direction: "inbound" | "outbound";
  sender: "contact" | "ai" | "human" | "system";

  /** Quem da equipe escreveu (sender "human" pela Central). Os relatórios
   *  por atendente leem este campo; mensagem antiga ou do celular não tem. */
  authorEmail?: string;
  authorName?: string;

  content?: string;
  mediaType: string; // text | image | audio | video | document | sticker | template | unknown
  mediaId?: string; // media id da Meta (proxy sob demanda em /api/wa/media)
  externalId?: string; // wamid
  status?: string; // sent | delivered | read | failed
  /** Motivo devolvido pela Meta quando o status vira failed ("130472: …"). */
  error?: string;
  reaction?: string;
  /** Canal SMS: por onde a mensagem foi de fato. Com agente RCS sai "rcs", e
   *  o status da Zenvia corrige para "sms" quando ela caiu para SMS. */
  via?: "sms" | "rcs";
  /** wamid da mensagem citada (resposta a uma mensagem). Vale nos dois
   *  sentidos: o cliente respondendo a algo nosso e a equipe citando o cliente. */
  contextExternalId?: string;
  /** Arquivo mandado pela Central (WaMidiaSaida). O mediaId acima é só da Meta,
   *  para o que chega; o que sai mora aqui. */
  midiaId?: string;
  /** Mídia mandada por link público (foto do carro do catálogo). */
  mediaUrl?: string;
  /** Nome do documento, para a Central mostrar o arquivo pelo nome. */
  filename?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WaMessageSchema: Schema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: "WaConversation", required: true },
    direction: { type: String, enum: ["inbound", "outbound"], required: true },
    sender: { type: String, enum: ["contact", "ai", "human", "system"], required: true },

    authorEmail: { type: String, lowercase: true, trim: true },
    authorName: { type: String },

    content: { type: String },
    mediaType: { type: String, default: "text" },
    mediaId: { type: String },
    externalId: { type: String, unique: true, sparse: true },
    status: { type: String },
    error: { type: String },
    reaction: { type: String },
    via: { type: String, enum: ["sms", "rcs"] },
    contextExternalId: { type: String },
    midiaId: { type: String },
    mediaUrl: { type: String },
    filename: { type: String },
  },
  { timestamps: true, collection: "wa_messages" },
);
WaMessageSchema.index({ conversationId: 1, createdAt: 1 });
WaMessageSchema.index({ createdAt: -1 });
// O proxy de mídia acha a mensagem pelo id da Meta.
WaMessageSchema.index({ mediaId: 1 }, { sparse: true });

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

/** Fontes de público. As da loja (contatos, coluna, colar, csv) são as únicas
 *  que uma loja pode usar; cnpja, targets e pessoa são a prospecção do CNV. */
export type WaCampaignSource =
  | "cnpja"
  | "csv"
  | "manual"
  | "targets"
  | "pessoa"
  | "contatos"
  | "coluna"
  | "colar"
  | "misto";

export const FONTES_DA_LOJA = ["csv", "contatos", "coluna", "colar"] as const;
export type FonteDaLoja = (typeof FONTES_DA_LOJA)[number];

/** Arquivo do cabeçalho de mídia do template (wa/lib/midia-saida.ts). É o
 *  mesmo para todos os destinatários da campanha. */
export type WaHeaderMedia = {
  midiaId: string;
  tipo: "image" | "video" | "document";
  filename?: string | null;
  mime?: string | null;
};

export interface IWaCampaign extends Document {
  /** Loja que dispara (WaStore). null/ausente = CNV. */
  tenantId?: string | null;
  name: string;
  templateName: string;
  templateLanguage: string;
  /** Corpo do template no momento do disparo, com {{n}} — o texto de cada
   *  destinatário sai daqui + params. Sem isto a Central e a IA veriam só um
   *  rótulo no lugar da mensagem de abertura. */
  templateBody?: string;
  /** Cabeçalho de texto do template (com {{1}} quando tem variável). */
  templateHeaderText?: string;
  templateCategory?: string;
  status: WaCampaignStatus;
  source: WaCampaignSource;
  /** Todas as fontes somadas no público (a loja pode juntar várias). */
  fontes?: string[];
  filters?: {
    cnae?: string;
    uf?: string;
    city?: string;
    /** Coluna do funil (fonte "coluna"). */
    colunaId?: string;
    colunaNome?: string;
    /** Contatos: só quem escreveu nas últimas 24h. */
    janela24h?: boolean;
    /** Contatos: origem do cadastro (whatsapp, sms, csv, manual...). */
    origem?: string;
  };
  importId?: mongoose.Types.ObjectId;
  /** Como cada {{n}} do template é preenchido (ver src/lib/campaign-params.ts). */
  paramsMap: Array<{ type: string; value?: string }>;
  /** Cabeçalho de texto com {{1}}: de onde vem o valor. */
  headerParamsMap?: Array<{ type: string; value?: string }>;
  /** Botões de link dinâmico (URL com {{1}} no fim): o índice do botão no
   *  template e de onde vem o final do endereço. */
  buttonParamsMap?: Array<{ index: number; type: string; value?: string }>;
  /** Cabeçalho de imagem, vídeo ou documento. Sem ele a Meta recusa 100% dos
   *  envios de um template com mídia no cabeçalho. */
  headerMedia?: WaHeaderMedia | null;
  /** Por que o worker pausou a campanha (WhatsApp desconectado, arquivo do
   *  cabeçalho vencido, template recusado). Iniciar ou retomar limpa. */
  lastError?: string | null;
  /** Última rodada do worker: quem rodou há mais tempo vai primeiro. */
  lastRunAt?: Date | null;
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

const HeaderMediaSchema = new Schema(
  {
    midiaId: { type: String, required: true },
    tipo: { type: String, enum: ["image", "video", "document"], required: true },
    filename: String,
    mime: String,
  },
  { _id: false },
);

const WaCampaignSchema: Schema = new Schema(
  {
    tenantId: { type: String, default: null },
    name: { type: String, required: true },
    templateName: { type: String, required: true },
    templateLanguage: { type: String, default: "pt_BR" },
    templateBody: { type: String },
    templateHeaderText: { type: String },
    templateCategory: { type: String },
    status: {
      type: String,
      enum: ["draft", "scheduled", "running", "paused", "completed", "cancelled", "failed"],
      default: "draft",
    },
    source: {
      type: String,
      enum: ["cnpja", "csv", "manual", "targets", "pessoa", "contatos", "coluna", "colar", "misto"],
      default: "manual",
    },
    fontes: { type: [String], default: undefined },
    filters: {
      cnae: String,
      uf: String,
      city: String,
      colunaId: String,
      colunaNome: String,
      janela24h: Boolean,
      origem: String,
    },
    importId: { type: Schema.Types.ObjectId, ref: "WaImport" },
    paramsMap: { type: [{ _id: false, type: { type: String }, value: String }], default: [] },
    headerParamsMap: { type: [{ _id: false, type: { type: String }, value: String }], default: [] },
    buttonParamsMap: {
      type: [{ _id: false, index: Number, type: { type: String }, value: String }],
      default: [],
    },
    headerMedia: { type: HeaderMediaSchema, default: null },
    lastError: { type: String, default: null },
    lastRunAt: { type: Date, default: null },
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
  /** Mesma loja da campanha — a resposta só é atribuída dentro da loja. */
  tenantId?: string | null;
  targetId?: mongoose.Types.ObjectId;
  /** Sócio dono deste número. Vários destinatários com o mesmo partnerId são
   *  a MESMA pessoa — quando um responde, os outros são cancelados. */
  partnerId?: mongoose.Types.ObjectId;
  /** Ordem de tentativa dentro da mesma pessoa (1 = melhor número). */
  attempt: number;
  phone: string;
  name?: string;
  params: string[]; // variáveis {{1}}, {{2}}... do template
  /** Valor do {{1}} do cabeçalho de texto (vazio = cabeçalho sem variável). */
  headerParams: string[];
  /** Final da URL de cada botão de link dinâmico, pelo índice do botão. */
  buttonParams: Array<{ index: number; value: string }>;
  /** "sending" = reservado por uma rodada do worker e a caminho da Meta. Nunca
   *  volta sozinho para "pending": se a rodada cair, vira "failed" (ver
   *  wa/lib/campaign-queue.ts). */
  status: "pending" | "sending" | "sent" | "delivered" | "read" | "failed" | "replied" | "skipped";
  /** Quando a rodada reservou (relógio do banco). */
  claimedAt?: Date;
  sentAt?: Date;
  repliedAt?: Date;
  externalId?: string;
  error?: string;
  conversationId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const WaCampaignRecipientSchema: Schema = new Schema(
  {
    campaignId: { type: Schema.Types.ObjectId, ref: "WaCampaign", required: true },
    tenantId: { type: String, default: null },
    targetId: { type: Schema.Types.ObjectId, ref: "WaTarget" },
    partnerId: { type: Schema.Types.ObjectId, ref: "WaPartner" },
    attempt: { type: Number, default: 1 },
    phone: { type: String, required: true },
    name: { type: String },
    params: { type: [String], default: [] },
    headerParams: { type: [String], default: [] },
    buttonParams: { type: [{ _id: false, index: Number, value: String }], default: [] },
    status: {
      type: String,
      enum: ["pending", "sending", "sent", "delivered", "read", "failed", "replied", "skipped"],
      default: "pending",
    },
    claimedAt: { type: Date },
    sentAt: { type: Date },
    repliedAt: { type: Date },
    externalId: { type: String },
    error: { type: String },
    conversationId: { type: Schema.Types.ObjectId, ref: "WaConversation" },
  },
  { timestamps: true, collection: "wa_campaignrecipients" },
);
WaCampaignRecipientSchema.index({ campaignId: 1, status: 1 });
WaCampaignRecipientSchema.index({ phone: 1, sentAt: -1 });
// Atribuição de resposta (o último disparo para este número, nesta loja) e a
// checagem de "já recebeu este modelo" da reserva.
WaCampaignRecipientSchema.index({ tenantId: 1, phone: 1, sentAt: -1 });
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
