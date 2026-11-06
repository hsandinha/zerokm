// Tarefas da equipe da loja: "ligar para o Carlos amanhã", "mandar as fotos
// do Onix", "confirmar o test drive de sábado". Podem estar ligadas a uma
// conversa (a Central cria pela rota /api/wa/conversations/[id]/tarefas) e
// nascem também sozinhas: do lembrete da véspera que não pôde sair (janela de
// 24h fechada e sem template) e da IA quando o cliente pede foto de um carro
// que ainda não tem.
//
// Fica fora do CRM da concessionária (LeadTask) de propósito: é do
// atendimento, vale para o lojista também, e não depende do CRM liberado.

import mongoose, { Schema, Document, Model } from "mongoose";

export interface IWaTarefa extends Document {
  /** Loja (WaStore). null = CNV. */
  tenantId: string | null;
  titulo: string;
  descricao?: string | null;
  prazo?: Date | null;
  /** E-mail de quem faz. Vazio = qualquer um da equipe. */
  responsavel?: string | null;
  conversationId?: mongoose.Types.ObjectId | null;
  contactId?: mongoose.Types.ObjectId | null;
  /** Cópia do nome do contato para a lista não ler os contatos. */
  contatoNome?: string | null;
  agendamentoId?: mongoose.Types.ObjectId | null;
  feita: boolean;
  feitaEm?: Date | null;
  feitaPor?: string | null;
  origem: "equipe" | "agenda" | "ia";
  criadoPor?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const WaTarefaSchema: Schema = new Schema(
  {
    tenantId: { type: String, default: null },
    titulo: { type: String, required: true, trim: true, maxlength: 200 },
    descricao: { type: String, trim: true, maxlength: 2000 },
    prazo: { type: Date, default: null },
    responsavel: { type: String, lowercase: true, trim: true, default: null },
    conversationId: { type: Schema.Types.ObjectId, ref: "WaConversation", default: null },
    contactId: { type: Schema.Types.ObjectId, ref: "WaContact", default: null },
    contatoNome: { type: String, trim: true, maxlength: 120 },
    agendamentoId: { type: Schema.Types.ObjectId, ref: "WaAgendamento", default: null },
    feita: { type: Boolean, default: false },
    feitaEm: { type: Date, default: null },
    feitaPor: { type: String, default: null },
    origem: { type: String, enum: ["equipe", "agenda", "ia"], default: "equipe" },
    criadoPor: { type: String },
  },
  { timestamps: true, collection: "wa_tarefas" },
);
WaTarefaSchema.index({ tenantId: 1, feita: 1, prazo: 1 });
WaTarefaSchema.index({ tenantId: 1, responsavel: 1, feita: 1 });
WaTarefaSchema.index({ conversationId: 1, feita: 1 });

if (process.env.NODE_ENV === "development" && mongoose.models.WaTarefa) {
  delete mongoose.models.WaTarefa;
}

export const WaTarefa: Model<IWaTarefa> =
  mongoose.models.WaTarefa || mongoose.model<IWaTarefa>("WaTarefa", WaTarefaSchema);
