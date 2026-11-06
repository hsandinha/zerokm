// Ferramentas da equipe na Central: notas internas e respostas rápidas.
//
// As duas são do atendimento, não do cliente: nada daqui sai pelo WhatsApp
// sozinho. A nota fica só na linha do tempo da equipe; a resposta rápida é
// um texto pronto que a pessoa escolhe e manda (com o {{nome}} já trocado).

import mongoose, { Schema, Document, Model } from "mongoose";

// ── Nota interna ─────────────────────────────────────────────
// Fica fora de wa_messages de propósito: a IA lê o histórico de mensagens
// para responder, e uma nota ("cliente difícil, não dar desconto") nunca pode
// virar contexto do que se diz ao cliente.
export interface IWaNote extends Document {
  conversationId: mongoose.Types.ObjectId;
  /** Loja (WaStore). null = CNV. Igual ao da conversa. */
  tenantId: string | null;
  authorEmail: string;
  authorName?: string;
  text: string;
  createdAt: Date;
  updatedAt: Date;
}

const WaNoteSchema: Schema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: "WaConversation", required: true },
    tenantId: { type: String, default: null },
    authorEmail: { type: String, required: true, lowercase: true, trim: true },
    authorName: { type: String },
    text: { type: String, required: true, maxlength: 4000 },
  },
  { timestamps: true, collection: "wa_notes" },
);
WaNoteSchema.index({ conversationId: 1, createdAt: -1 });

// ── Resposta rápida ──────────────────────────────────────────
// Por loja: cada uma tem o próprio jeito de falar (e o CNV, o dele).
export interface IWaQuickReply extends Document {
  tenantId: string | null;
  title: string;
  /** Atalho sem a barra ("bomdia"): digitar "/bom" no campo filtra por ele. */
  shortcut: string;
  /** Texto com {{nome}} (primeiro nome do contato). */
  text: string;
  category?: string;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WaQuickReplySchema: Schema = new Schema(
  {
    tenantId: { type: String, default: null },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    shortcut: { type: String, required: true, trim: true, lowercase: true, maxlength: 30 },
    text: { type: String, required: true, maxlength: 4000 },
    category: { type: String, trim: true, maxlength: 40 },
    createdBy: { type: String },
  },
  { timestamps: true, collection: "wa_quick_replies" },
);
// O atalho é a chave de quem digita: dois iguais na mesma loja confundiriam.
WaQuickReplySchema.index({ tenantId: 1, shortcut: 1 }, { unique: true });

if (process.env.NODE_ENV === "development") {
  for (const name of ["WaNote", "WaQuickReply"]) {
    if (mongoose.models[name]) delete mongoose.models[name];
  }
}

export const WaNote: Model<IWaNote> =
  mongoose.models.WaNote || mongoose.model<IWaNote>("WaNote", WaNoteSchema);
export const WaQuickReply: Model<IWaQuickReply> =
  mongoose.models.WaQuickReply || mongoose.model<IWaQuickReply>("WaQuickReply", WaQuickReplySchema);
