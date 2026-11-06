// Automações de mensagem da loja: pós-atendimento (agradecimento e avaliação
// no Google), pós-venda (acompanhamento depois da venda fechada) e
// aniversário. Uma por tipo e por dono (loja, ou o CNV com tenantId null).
// O que cada uma é e o texto padrão estão em wa/lib/automacoes.ts; quem
// recebe e como sai, em wa/lib/automacoes-servidor.ts.
//
// WaAutomacaoEnvio guarda cada tentativa com uma CHAVE única por evento (a
// venda, o encerramento, o aniversário do ano). A linha é reservada ANTES do
// envio: duas rodadas do worker nunca mandam a mesma mensagem duas vezes, e o
// que foi pulado não volta a ser avaliado. O follow-up da coluna do funil
// também registra aqui (tipo "funil"), para o gestor ver o histórico junto.

import mongoose, { Schema, Document, Model } from "mongoose";

export type WaAutomacaoTipo = "pos_atendimento" | "pos_venda" | "aniversario";

export interface IWaAutomacao extends Document {
  /** Loja (WaStore). null = CNV. */
  tenantId: string | null;
  tipo: WaAutomacaoTipo;
  ativa: boolean;
  /** Pós-atendimento: horas depois de encerrada. Pós-venda: dias depois da
   *  venda. Aniversário: não usa. */
  espera: number;
  /** Aniversário: a partir de que hora do dia sai (Brasília). */
  hora: number;
  /** Texto com {{nome}}, {{loja}} e {{link_avaliacao}}: vai dentro da janela de 24h. */
  texto: string;
  /** Link de avaliação no Google (pós-atendimento). */
  linkAvaliacao?: string | null;
  /** Template aprovado para fora da janela. Sem ele, fora da janela não sai. */
  template?: string | null;
  templateIdioma: string;
  /** Campo de cada variável do corpo do template, na ordem. */
  templateVars: string[];
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WaAutomacaoSchema: Schema = new Schema(
  {
    tenantId: { type: String, default: null },
    tipo: { type: String, enum: ["pos_atendimento", "pos_venda", "aniversario"], required: true },
    ativa: { type: Boolean, default: false },
    espera: { type: Number, default: 24 },
    hora: { type: Number, default: 9 },
    texto: { type: String, default: "", maxlength: 1000 },
    linkAvaliacao: { type: String, default: null },
    template: { type: String, default: null },
    templateIdioma: { type: String, default: "pt_BR" },
    templateVars: { type: [String], default: [] },
    updatedBy: { type: String },
  },
  { timestamps: true, collection: "wa_automacoes" },
);
WaAutomacaoSchema.index({ tenantId: 1, tipo: 1 }, { unique: true });
WaAutomacaoSchema.index({ ativa: 1 });

export type WaEnvioTipo = WaAutomacaoTipo | "funil";
export type WaEnvioSituacao = "enviando" | "enviada" | "pulada" | "falhou";

export interface IWaAutomacaoEnvio extends Document {
  tenantId: string | null;
  tipo: WaEnvioTipo;
  /** Identifica o evento (venda, encerramento, aniversário do ano, toque). */
  chave: string;
  contactId?: mongoose.Types.ObjectId | null;
  conversationId?: mongoose.Types.ObjectId | null;
  situacao: WaEnvioSituacao;
  /** whatsapp | instagram | messenger */
  canal?: string | null;
  /** texto | ia | modelo */
  como?: string | null;
  motivo?: string | null;
  externalId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const WaAutomacaoEnvioSchema: Schema = new Schema(
  {
    tenantId: { type: String, default: null },
    tipo: { type: String, enum: ["pos_atendimento", "pos_venda", "aniversario", "funil"], required: true },
    chave: { type: String, required: true },
    contactId: { type: Schema.Types.ObjectId, ref: "WaContact", default: null },
    conversationId: { type: Schema.Types.ObjectId, ref: "WaConversation", default: null },
    situacao: { type: String, enum: ["enviando", "enviada", "pulada", "falhou"], default: "enviando" },
    canal: { type: String, default: null },
    como: { type: String, default: null },
    motivo: { type: String, default: null },
    externalId: { type: String, default: null },
  },
  { timestamps: true, collection: "wa_automacao_envios" },
);
// A reserva: um evento, um envio.
WaAutomacaoEnvioSchema.index({ tenantId: 1, tipo: 1, chave: 1 }, { unique: true });
WaAutomacaoEnvioSchema.index({ tenantId: 1, createdAt: -1 });
WaAutomacaoEnvioSchema.index({ conversationId: 1 });
WaAutomacaoEnvioSchema.index({ contactId: 1 });

if (process.env.NODE_ENV === "development") {
  for (const name of ["WaAutomacao", "WaAutomacaoEnvio"]) {
    if (mongoose.models[name]) delete mongoose.models[name];
  }
}

export const WaAutomacao: Model<IWaAutomacao> =
  mongoose.models.WaAutomacao || mongoose.model<IWaAutomacao>("WaAutomacao", WaAutomacaoSchema);
export const WaAutomacaoEnvio: Model<IWaAutomacaoEnvio> =
  mongoose.models.WaAutomacaoEnvio ||
  mongoose.model<IWaAutomacaoEnvio>("WaAutomacaoEnvio", WaAutomacaoEnvioSchema);
