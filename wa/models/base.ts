// Base de prospecção: as empresas a acionar, os sócios delas e o que a Procob
// já respondeu sobre cada documento.
//
// A regra que sustenta o custo: NADA é pesquisado duas vezes. `WaLookup`
// guarda a resposta crua de cada consulta paga, chaveada por produto +
// documento — reabrir a tela lê daqui, não da API.

import mongoose, { Schema, Document, Model } from "mongoose";

// ── Importações (auditoria e reprocesso sem novo upload) ─────
export interface IWaImport extends Document {
  kind: "csv" | "cnpja" | "manual";
  filename?: string;
  /** De coluna do arquivo → campo canônico (ver src/lib/audience/mapping.ts). */
  mapping?: Record<string, string>;
  rowsTotal: number;
  rowsOk: number;
  rowsError: number;
  status: "processing" | "done" | "failed";
  error?: string;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WaImportSchema: Schema = new Schema(
  {
    kind: { type: String, enum: ["csv", "cnpja", "manual"], required: true },
    filename: { type: String },
    mapping: { type: Schema.Types.Mixed },
    rowsTotal: { type: Number, default: 0 },
    rowsOk: { type: Number, default: 0 },
    rowsError: { type: Number, default: 0 },
    status: { type: String, enum: ["processing", "done", "failed"], default: "processing" },
    error: { type: String },
    createdBy: { type: String },
  },
  { timestamps: true, collection: "wa_imports" },
);

/** Linha bruta como veio. Guardar o cru é o que permite reprocessar quando o
 *  mapeamento de colunas estiver errado — sem pedir o arquivo de novo. */
export interface IWaImportRow extends Document {
  importId: mongoose.Types.ObjectId;
  line?: number;
  raw: Record<string, unknown>;
  status: "pending" | "ok" | "error" | "skipped";
  error?: string;
  createdAt: Date;
}

const WaImportRowSchema: Schema = new Schema(
  {
    importId: { type: Schema.Types.ObjectId, ref: "WaImport", required: true },
    line: { type: Number },
    raw: { type: Schema.Types.Mixed, required: true },
    status: { type: String, enum: ["pending", "ok", "error", "skipped"], default: "pending" },
    error: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "wa_import_rows" },
);
WaImportRowSchema.index({ importId: 1, status: 1 });

// ── Sócio (pessoa por trás do CNPJ) ──────────────────────────
export interface IWaPartner extends Document {
  taxId?: string; // CPF em dígitos, quando houver
  name: string;
  kind: "PF" | "PJ";
  /** `false` é "não há indício de óbito", não "está vivo": só vira `true` com
   *  evidência da Procob, e nunca volta atrás sozinho. Sócio falecido não
   *  entra em campanha — o telefone costuma ser de um familiar. */
  deceased: boolean;
  enrichedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const WaPartnerSchema: Schema = new Schema(
  {
    taxId: { type: String, index: true, sparse: true },
    name: { type: String, required: true },
    kind: { type: String, enum: ["PF", "PJ"], default: "PF" },
    deceased: { type: Boolean, default: false },
    enrichedAt: { type: Date },
  },
  { timestamps: true, collection: "wa_partners" },
);
// Com CPF, o documento é a chave. Sem CPF, o nome é a única possível — evita
// duplicar o mesmo sócio a cada importação.
WaPartnerSchema.index({ taxId: 1 }, { unique: true, sparse: true });

/** Telefones e e-mails candidatos do sócio, com a pontuação da Procob. Quem
 *  decide qual vira contato de WhatsApp é a pessoa na tela. */
export interface IWaPartnerContact extends Document {
  partnerId: mongoose.Types.ObjectId;
  kind: "celular" | "fixo" | "comercial" | "outros" | "email";
  value: string; // dígitos (ddd+número) ou e-mail
  e164?: string; // +55DDD9XXXXXXXX quando é telefone válido
  operator?: string;
  score?: number; // `pontuacao` da Procob
  infoAge?: string; // `idade_informacao`
  preferred: boolean; // veio em contato_preferencial
  source: string;
  lookupId?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const WaPartnerContactSchema: Schema = new Schema(
  {
    partnerId: { type: Schema.Types.ObjectId, ref: "WaPartner", required: true },
    kind: {
      type: String,
      enum: ["celular", "fixo", "comercial", "outros", "email"],
      required: true,
    },
    value: { type: String, required: true },
    e164: { type: String },
    operator: { type: String },
    score: { type: Number },
    infoAge: { type: String },
    preferred: { type: Boolean, default: false },
    source: { type: String, default: "procob" },
    lookupId: { type: Schema.Types.ObjectId, ref: "WaLookup" },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "wa_partner_contacts" },
);
WaPartnerContactSchema.index({ partnerId: 1, kind: 1, value: 1 }, { unique: true });

// ── Alvo (a empresa a acionar) ───────────────────────────────
export type WaTargetStatus =
  | "new" // importado, sem telefone ainda
  | "ready" // com telefone, pronto para campanha
  | "on_hold" // sócio já abordado por outra empresa dele
  | "queued"
  | "sent"
  | "replied"
  | "won"
  | "lost"
  | "suppressed";

export interface IWaTarget extends Document {
  cnpj: string;
  legalName?: string;
  tradeName?: string;
  city?: string;
  state?: string;
  cnae?: string;
  phone?: string; // canônico: +55DDD9XXXXXXXX
  phoneSource?: "cnpja" | "csv" | "procob" | "manual";
  contactName?: string;
  email?: string;
  /** O sócio-gancho (um só). Todos os outros ficam em `partners`. */
  partnerId?: mongoose.Types.ObjectId;
  partners: Array<{ partnerId: mongoose.Types.ObjectId; role?: string; active: boolean }>;
  status: WaTargetStatus;
  suppressedReason?: string;
  /** Ordem da fila — quanto maior, primeiro. */
  priority?: number;
  source: "cnpja" | "csv" | "manual" | "procob";
  importId?: mongoose.Types.ObjectId;
  raw?: Record<string, unknown>;
  heldAt?: Date;
  heldBecauseTargetId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const WaTargetSchema: Schema = new Schema(
  {
    cnpj: { type: String, required: true, unique: true },
    legalName: { type: String },
    tradeName: { type: String },
    city: { type: String },
    state: { type: String },
    cnae: { type: String },
    phone: { type: String },
    phoneSource: { type: String, enum: ["cnpja", "csv", "procob", "manual"] },
    contactName: { type: String },
    email: { type: String },
    partnerId: { type: Schema.Types.ObjectId, ref: "WaPartner" },
    partners: {
      type: [
        {
          _id: false,
          partnerId: { type: Schema.Types.ObjectId, ref: "WaPartner" },
          role: String,
          active: { type: Boolean, default: true },
        },
      ],
      default: [],
    },
    status: {
      type: String,
      enum: ["new", "ready", "on_hold", "queued", "sent", "replied", "won", "lost", "suppressed"],
      default: "new",
    },
    suppressedReason: { type: String },
    priority: { type: Number },
    source: { type: String, enum: ["cnpja", "csv", "manual", "procob"], default: "manual" },
    importId: { type: Schema.Types.ObjectId, ref: "WaImport" },
    raw: { type: Schema.Types.Mixed },
    heldAt: { type: Date },
    heldBecauseTargetId: { type: Schema.Types.ObjectId, ref: "WaTarget" },
  },
  { timestamps: true, collection: "wa_targets" },
);
WaTargetSchema.index({ status: 1, priority: -1 });
WaTargetSchema.index({ phone: 1 });
WaTargetSchema.index({ "partners.partnerId": 1 });

// ── Consulta à Procob ────────────────────────────────────────
export interface IWaLookup extends Document {
  product: string; // L0006, L0001…
  document: string; // CPF/CNPJ em dígitos
  code: string; // 000 ok, 001 sem registro
  message?: string;
  content?: unknown;
  saldo?: string; // saldo devolvido no envelope, se vier
  sandbox: boolean;
  requestedBy?: string;
  // Desnormalizado para a tela de pesquisas filtrar sem varrer o JSON inteiro.
  subjectName?: string;
  phones: string[];
  emails: string[];
  summary?: Record<string, unknown>;
  indexedAt?: Date;
  refreshedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const WaLookupSchema: Schema = new Schema(
  {
    product: { type: String, required: true },
    document: { type: String, required: true },
    code: { type: String, required: true },
    message: { type: String },
    content: { type: Schema.Types.Mixed },
    saldo: { type: String },
    sandbox: { type: Boolean, default: false },
    requestedBy: { type: String },
    subjectName: { type: String },
    phones: { type: [String], default: [] },
    emails: { type: [String], default: [] },
    summary: { type: Schema.Types.Mixed },
    indexedAt: { type: Date },
    refreshedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: "wa_lookups" },
);
WaLookupSchema.index({ product: 1, document: 1 }, { unique: true });
WaLookupSchema.index({ refreshedAt: -1 });
WaLookupSchema.index({ subjectName: 1 });
WaLookupSchema.index({ phones: 1 });
WaLookupSchema.index({ emails: 1 });

/** Saldo da Procob (documento único). A API não tem rota de recarga: o saldo
 *  vem no envelope de toda resposta e é regravado aqui de graça. O header lê
 *  esta linha — ir à Procob só no clique explícito. */
export interface IWaProcobBalance extends Document {
  saldo?: string;
  code?: string;
  message?: string;
  sandbox: boolean;
  checkedAt: Date;
}

const WaProcobBalanceSchema: Schema = new Schema(
  {
    saldo: { type: String },
    code: { type: String },
    message: { type: String },
    sandbox: { type: Boolean, default: false },
    checkedAt: { type: Date, default: new Date(0) },
  },
  { collection: "wa_procob_balance" },
);

if (process.env.NODE_ENV === "development") {
  for (const name of [
    "WaImport",
    "WaImportRow",
    "WaPartner",
    "WaPartnerContact",
    "WaTarget",
    "WaLookup",
    "WaProcobBalance",
  ]) {
    if (mongoose.models[name]) delete mongoose.models[name];
  }
}

export const WaImport: Model<IWaImport> =
  mongoose.models.WaImport || mongoose.model<IWaImport>("WaImport", WaImportSchema);
export const WaImportRow: Model<IWaImportRow> =
  mongoose.models.WaImportRow || mongoose.model<IWaImportRow>("WaImportRow", WaImportRowSchema);
export const WaPartner: Model<IWaPartner> =
  mongoose.models.WaPartner || mongoose.model<IWaPartner>("WaPartner", WaPartnerSchema);
export const WaPartnerContact: Model<IWaPartnerContact> =
  mongoose.models.WaPartnerContact ||
  mongoose.model<IWaPartnerContact>("WaPartnerContact", WaPartnerContactSchema);
export const WaTarget: Model<IWaTarget> =
  mongoose.models.WaTarget || mongoose.model<IWaTarget>("WaTarget", WaTargetSchema);
export const WaLookup: Model<IWaLookup> =
  mongoose.models.WaLookup || mongoose.model<IWaLookup>("WaLookup", WaLookupSchema);
export const WaProcobBalance: Model<IWaProcobBalance> =
  mongoose.models.WaProcobBalance ||
  mongoose.model<IWaProcobBalance>("WaProcobBalance", WaProcobBalanceSchema);
