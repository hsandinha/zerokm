// Ferramentas da Central que não são mensagem: etiquetas, mensagens
// programadas e o contador de uso do copiloto. Ficam fora de wa.ts para cada
// coleção nova não mexer no schema das mensagens e das conversas.

import mongoose, { Schema, Document, Model } from "mongoose";

// ── Etiqueta ─────────────────────────────────────────────────
// Por loja (e o CNV com as dele). A conversa guarda os ids em
// WaConversation.etiquetas: filtrar e contar é um índice só, sem junção.
export interface IWaEtiqueta extends Document {
  tenantId: string | null;
  nome: string;
  /** Nome em minúsculas, sem espaço sobrando: duas "VIP" na mesma loja confundem. */
  chave: string;
  /** Token de cor (COLUNA_CORES em wa/lib/stages.ts), a mesma paleta do funil. */
  cor: string;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WaEtiquetaSchema: Schema = new Schema(
  {
    tenantId: { type: String, default: null },
    nome: { type: String, required: true, trim: true, maxlength: 40 },
    chave: { type: String, required: true },
    cor: { type: String, default: "azul" },
    createdBy: { type: String },
  },
  { timestamps: true, collection: "wa_etiquetas" },
);
WaEtiquetaSchema.index({ tenantId: 1, chave: 1 }, { unique: true });

// ── Mensagem programada ──────────────────────────────────────
// Escrita na Central para sair depois. O worker /api/wa/workers/programadas
// manda na hora, como se a pessoa tivesse clicado em enviar. A janela vale
// na HORA DO ENVIO: aberta, sai o texto; fechada no WhatsApp, sai o template
// escolhido ao programar; sem template (ou Direct/Messenger fora do prazo),
// não sai, e fica o motivo na faixa e numa nota interna.
export type SituacaoProgramada = "programada" | "enviando" | "enviada" | "falhou" | "cancelada";

export interface IWaProgramada extends Document {
  tenantId: string | null;
  conversationId: mongoose.Types.ObjectId;
  texto: string;
  enviarEm: Date;
  /** Template que sai no lugar se a janela de 24h estiver fechada. */
  modelo?: {
    nome: string;
    idioma: string;
    params: string[];
    /** Texto renderizado (o que a Central e a IA leem depois). */
    texto: string;
  } | null;
  situacao: SituacaoProgramada;
  /** Por que não saiu. */
  erro?: string | null;
  /** Como saiu: o texto ou o template. */
  saiuComo?: "texto" | "template" | null;
  /** Quando o worker pegou (relógio do servidor). */
  pegoEm?: Date | null;
  enviadaEm?: Date | null;
  /** Quem programou: a mensagem sai em nome dele (authorEmail). */
  criadoPor: string;
  criadoPorNome?: string | null;
  /** A falha já foi vista (o "Ok" na faixa): some da conversa. */
  dispensada?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const WaProgramadaSchema: Schema = new Schema(
  {
    tenantId: { type: String, default: null },
    conversationId: { type: Schema.Types.ObjectId, ref: "WaConversation", required: true },
    texto: { type: String, required: true, maxlength: 4096 },
    enviarEm: { type: Date, required: true },
    modelo: {
      type: new Schema(
        {
          nome: { type: String, required: true },
          idioma: { type: String, default: "pt_BR" },
          params: { type: [String], default: [] },
          texto: { type: String, default: "" },
        },
        { _id: false },
      ),
      default: null,
    },
    situacao: {
      type: String,
      enum: ["programada", "enviando", "enviada", "falhou", "cancelada"],
      default: "programada",
    },
    erro: { type: String, default: null },
    saiuComo: { type: String, enum: ["texto", "template", null], default: null },
    pegoEm: { type: Date, default: null },
    enviadaEm: { type: Date, default: null },
    criadoPor: { type: String, required: true, lowercase: true, trim: true },
    criadoPorNome: { type: String, default: null },
    dispensada: { type: Boolean, default: false },
  },
  { timestamps: true, collection: "wa_programadas" },
);
WaProgramadaSchema.index({ situacao: 1, enviarEm: 1 });
WaProgramadaSchema.index({ conversationId: 1, situacao: 1 });

// ── Uso do copiloto ──────────────────────────────────────────
// Cada pedido é uma chamada paga na chave de IA da loja: um contador por loja
// e por dia segura clique repetido (ou script) virando conta alta.
export interface IWaCopilotoUso extends Document {
  /** tenantId da loja, ou "cnv". */
  chave: string;
  /** Dia em Brasília, "2026-11-06". */
  dia: string;
  contador: number;
  /** Some sozinho depois disto (índice TTL). */
  expiraEm: Date;
}

const WaCopilotoUsoSchema: Schema = new Schema(
  {
    chave: { type: String, required: true },
    dia: { type: String, required: true },
    contador: { type: Number, default: 0 },
    expiraEm: { type: Date, required: true },
  },
  { collection: "wa_copiloto_uso" },
);
WaCopilotoUsoSchema.index({ chave: 1, dia: 1 }, { unique: true });
WaCopilotoUsoSchema.index({ expiraEm: 1 }, { expireAfterSeconds: 0 });

if (process.env.NODE_ENV === "development") {
  for (const name of ["WaEtiqueta", "WaProgramada", "WaCopilotoUso"]) {
    if (mongoose.models[name]) delete mongoose.models[name];
  }
}

export const WaEtiqueta: Model<IWaEtiqueta> =
  mongoose.models.WaEtiqueta || mongoose.model<IWaEtiqueta>("WaEtiqueta", WaEtiquetaSchema);
export const WaProgramada: Model<IWaProgramada> =
  mongoose.models.WaProgramada || mongoose.model<IWaProgramada>("WaProgramada", WaProgramadaSchema);
export const WaCopilotoUso: Model<IWaCopilotoUso> =
  mongoose.models.WaCopilotoUso || mongoose.model<IWaCopilotoUso>("WaCopilotoUso", WaCopilotoUsoSchema);
