// Fotos dos carros do pátio do lojista (estoque local, RepasseVehicle com
// `lojistaId`). A zerokm não tem storage de arquivos: os bytes ficam aqui,
// como na mídia de saída (wa/models/midia.ts), mas SEM validade. A foto vive
// enquanto o carro estiver cadastrado, e é ela que vai na conversa e para a
// Meta pelo link público assinado (/api/wa/loja/estoque/foto/[id]).
//
// A ordem e a capa não ficam aqui: a lista `fotos` do carro guarda os ids na
// ordem de exibição (a primeira é a capa). Assim trocar a ordem é gravar uma
// lista só, sem renumerar documentos.
//
// Tamanho: o navegador reduz a foto para JPEG de ~1600px antes de enviar
// (wa/lib/foto-no-navegador.ts), então cada uma fica em algumas centenas de
// KB, bem abaixo do teto de 4 MB do corpo da requisição na Vercel e dos 16 MB
// de um documento do Mongo.

import mongoose, { Schema, Document, Model } from "mongoose";

export interface IWaFotoEstoque extends Document {
  /** Loja (WaStore) dona do carro. */
  tenantId: string;
  /** Carro (RepasseVehicle) do pátio. */
  veiculoId: mongoose.Types.ObjectId;
  mime: string;
  size: number;
  width?: number;
  height?: number;
  data: Buffer;
  createdBy?: string;
  createdAt: Date;
}

const WaFotoEstoqueSchema: Schema = new Schema(
  {
    tenantId: { type: String, required: true },
    veiculoId: { type: Schema.Types.ObjectId, ref: "RepasseVehicle", required: true },
    mime: { type: String, required: true },
    size: { type: Number, required: true },
    width: { type: Number },
    height: { type: Number },
    data: { type: Buffer, required: true },
    createdBy: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "wa_fotos_estoque" },
);
WaFotoEstoqueSchema.index({ veiculoId: 1 });
WaFotoEstoqueSchema.index({ tenantId: 1, veiculoId: 1 });

if (process.env.NODE_ENV === "development" && mongoose.models.WaFotoEstoque) {
  delete mongoose.models.WaFotoEstoque;
}

export const WaFotoEstoque: Model<IWaFotoEstoque> =
  mongoose.models.WaFotoEstoque || mongoose.model<IWaFotoEstoque>("WaFotoEstoque", WaFotoEstoqueSchema);
