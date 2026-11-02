// Escolha da Página do Facebook (o `messenger_escolhas` do Chatrun, 088).
// Quem administra mais de uma Página escolhe qual conectar depois do login.
// O token de usuário fica aqui (criptografado) só até a escolha, por 15
// minutos: o login volta sem sessão garantida, então cookie não serve. O
// índice TTL apaga sozinho o que venceu; a leitura também confere o prazo,
// porque o TTL do Mongo passa de minuto em minuto.
//
// A lista de Páginas vai SEM token: o token de cada Página é buscado de novo
// com o token do login na hora de conectar.

import mongoose, { Schema, Document, Model } from "mongoose";

export const MESSENGER_CHOICE_TTL_MS = 15 * 60_000;

export type MessengerChoicePage = {
  id: string;
  name: string;
  pictureUrl: string | null;
  /** Pode responder mensagens pela Página (tarefa MESSAGING ou MANAGE). */
  canMessage: boolean;
};

export interface IWaMessengerChoice extends Document {
  /** Dono do canal que vai nascer. null = CNV. */
  tenantId: string | null;
  /** E-mail de quem fez o login (vem do state assinado). */
  by: string;
  fbUserId?: string | null;
  /** Token de usuário de longa duração, criptografado. */
  userToken: string;
  pages: MessengerChoicePage[];
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const WaMessengerChoiceSchema: Schema = new Schema(
  {
    tenantId: { type: String, default: null },
    by: { type: String, required: true },
    fbUserId: { type: String, default: null },
    userToken: { type: String, required: true },
    pages: [
      {
        _id: false,
        id: { type: String, required: true },
        name: { type: String, required: true },
        pictureUrl: { type: String, default: null },
        canMessage: { type: Boolean, default: true },
      },
    ],
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + MESSENGER_CHOICE_TTL_MS),
    },
  },
  { timestamps: true, collection: "wa_messenger_choices" },
);
WaMessengerChoiceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

if (process.env.NODE_ENV === "development" && mongoose.models.WaMessengerChoice) {
  delete mongoose.models.WaMessengerChoice;
}

export const WaMessengerChoice: Model<IWaMessengerChoice> =
  mongoose.models.WaMessengerChoice ||
  mongoose.model<IWaMessengerChoice>("WaMessengerChoice", WaMessengerChoiceSchema);
