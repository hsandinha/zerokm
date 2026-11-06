// Mídia de SAÍDA: o arquivo que a equipe anexa na Central ou que vai no
// cabeçalho de um template de campanha. A Meta (via gateway) baixa pelo link
// público assinado de /api/wa/midia/[id]; a zerokm não tem storage de
// arquivos, então os bytes ficam aqui, com validade.
//
// Limites: um documento do Mongo tem até 16 MB e a Vercel aceita até ~4,5 MB
// no corpo da requisição, então o envio para por volta de 4 MB.

import mongoose, { Schema, Document, Model } from "mongoose";

export interface IWaMidiaSaida extends Document {
  /** Loja (WaStore). null = CNV. */
  tenantId: string | null;
  mime: string;
  filename?: string;
  size: number;
  data: Buffer;
  /** Some sozinha depois disto (índice TTL). */
  expiresAt: Date;
  createdBy?: string;
  createdAt: Date;
}

const WaMidiaSaidaSchema: Schema = new Schema(
  {
    tenantId: { type: String, default: null },
    mime: { type: String, required: true },
    filename: { type: String },
    size: { type: Number, required: true },
    data: { type: Buffer, required: true },
    expiresAt: { type: Date, required: true },
    createdBy: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "wa_midias_saida" },
);
WaMidiaSaidaSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const WaMidiaSaida: Model<IWaMidiaSaida> =
  mongoose.models.WaMidiaSaida || mongoose.model<IWaMidiaSaida>("WaMidiaSaida", WaMidiaSaidaSchema);
