// O carro ligado à conversa: o último que a equipe ("Enviar carro" na
// Central) ou a IA (fotos do pátio) mandou para o cliente. Um por conversa,
// sobrescrito a cada envio. É o valor da venda que vai para a Meta quando o
// cartão entra na coluna de venda (wa/lib/conversoes-meta-servidor.ts).
//
// O preço é o que o cliente viu (com a margem da loja), gravado no envio: o
// carro pode sair do estoque depois de vendido.

import mongoose, { Schema, Document, Model } from "mongoose";

export interface IWaCarroDaConversa extends Document {
  tenantId: string | null;
  conversationId: mongoose.Types.ObjectId;
  /** Código do carro na consulta (o mesmo que a IA usa). */
  ref: string;
  titulo?: string | null;
  /** Origem do carro na busca do estoque: pátio, 0km da rede, repasse. */
  origem?: string | null;
  preco: number;
  /** Quem mandou: "human" (Central) ou "ai". */
  por?: string | null;
  em: Date;
  createdAt: Date;
  updatedAt: Date;
}

const WaCarroDaConversaSchema: Schema = new Schema(
  {
    tenantId: { type: String, default: null },
    conversationId: { type: Schema.Types.ObjectId, ref: "WaConversation", required: true },
    ref: { type: String, required: true, trim: true, maxlength: 20 },
    titulo: { type: String, trim: true, maxlength: 200, default: null },
    origem: { type: String, default: null },
    preco: { type: Number, min: 0, default: 0 },
    por: { type: String, default: null },
    em: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: "wa_carros_conversa" },
);
WaCarroDaConversaSchema.index({ conversationId: 1 }, { unique: true });

export const WaCarroDaConversa: Model<IWaCarroDaConversa> =
  mongoose.models.WaCarroDaConversa ||
  mongoose.model<IWaCarroDaConversa>("WaCarroDaConversa", WaCarroDaConversaSchema);
