// Agenda de visita e test drive da loja (regras em wa/lib/agenda.ts).
//
// O agendamento nasce de dois jeitos: pela IA da loja (agendar_visita, sempre
// "a confirmar", com o dia e a hora que o cliente pediu) ou pela equipe na
// tela da Agenda. Fica ligado à conversa e ao contato quando existem: é por
// eles que sai o lembrete da véspera (worker /api/wa/workers/agenda).
//
// A configuração (dias e horários de visita, duração, intervalo, lembrete)
// é da agenda, separada do horário de atendimento da loja.

import mongoose, { Schema, Document, Model } from "mongoose";
import type { StatusAgendamento, TipoAgendamento } from "@wa/lib/agenda";

// ── Agendamento ──────────────────────────────────────────────
export interface IWaAgendamento extends Document {
  /** Loja (WaStore). null = CNV. */
  tenantId: string | null;
  conversationId?: mongoose.Types.ObjectId | null;
  contactId?: mongoose.Types.ObjectId | null;
  /** Cópia do nome e do telefone: a agenda lista sem ler os contatos, e o
   *  agendamento de quem ligou (sem conversa) também tem quem chamar. */
  contatoNome?: string | null;
  contatoTelefone?: string | null;
  tipo: TipoAgendamento;
  /** Carro do pátio (RepasseVehicle), quando é um carro cadastrado. */
  veiculoId?: mongoose.Types.ObjectId | null;
  /** O carro em texto (o que a IA anotou ou a equipe digitou). */
  veiculo?: string | null;
  inicio: Date;
  duracaoMin: number;
  status: StatusAgendamento;
  /** A IA não entendeu o dia/horário do pedido: a equipe combina. */
  horarioAproximado?: boolean;
  /** E-mail de quem atende a visita. */
  responsavel?: string | null;
  observacao?: string | null;
  origem: "ia" | "equipe";
  criadoPor?: string | null;
  confirmadoEm?: Date | null;
  lembrete?: {
    /** Quando o worker tratou (enviou, avisou a equipe ou pulou). */
    em?: Date | null;
    via?: "texto" | "template" | "equipe" | "pulado" | null;
    erro?: string | null;
  };
  createdAt: Date;
  updatedAt: Date;
}

const WaAgendamentoSchema: Schema = new Schema(
  {
    tenantId: { type: String, default: null },
    conversationId: { type: Schema.Types.ObjectId, ref: "WaConversation", default: null },
    contactId: { type: Schema.Types.ObjectId, ref: "WaContact", default: null },
    contatoNome: { type: String, trim: true, maxlength: 120 },
    contatoTelefone: { type: String, trim: true, maxlength: 40 },
    tipo: { type: String, enum: ["visita", "test_drive"], default: "visita" },
    veiculoId: { type: Schema.Types.ObjectId, ref: "RepasseVehicle", default: null },
    veiculo: { type: String, trim: true, maxlength: 160 },
    inicio: { type: Date, required: true },
    duracaoMin: { type: Number, default: 60, min: 15, max: 480 },
    status: {
      type: String,
      enum: ["a_confirmar", "confirmado", "realizado", "faltou", "cancelado"],
      default: "a_confirmar",
    },
    horarioAproximado: { type: Boolean, default: false },
    responsavel: { type: String, lowercase: true, trim: true, default: null },
    observacao: { type: String, maxlength: 1000 },
    origem: { type: String, enum: ["ia", "equipe"], default: "equipe" },
    criadoPor: { type: String },
    confirmadoEm: { type: Date, default: null },
    lembrete: {
      em: { type: Date, default: null },
      via: { type: String, enum: ["texto", "template", "equipe", "pulado", null], default: null },
      erro: { type: String, default: null },
    },
  },
  { timestamps: true, collection: "wa_agendamentos" },
);
// A tela lê por período; o worker, os de amanhã ainda sem lembrete.
WaAgendamentoSchema.index({ tenantId: 1, inicio: 1 });
WaAgendamentoSchema.index({ status: 1, inicio: 1, "lembrete.em": 1 });
WaAgendamentoSchema.index({ conversationId: 1, inicio: -1 });

// ── Configuração da agenda ───────────────────────────────────
export interface IWaAgendaConfig extends Document {
  tenantId: string | null;
  dias: Array<{ dia: number; ativo: boolean; inicio: string; fim: string }>;
  duracaoMin: number;
  intervaloMin: number;
  simultaneas: number;
  antecedenciaMin: number;
  lembrete: { ativo: boolean; templateName?: string | null; templateLanguage?: string | null };
  atualizadoPor?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DiaSchema = new Schema(
  {
    dia: { type: Number, min: 0, max: 6, required: true },
    ativo: { type: Boolean, default: false },
    inicio: { type: String, default: "09:00" },
    fim: { type: String, default: "18:00" },
  },
  { _id: false },
);

const WaAgendaConfigSchema: Schema = new Schema(
  {
    tenantId: { type: String, default: null },
    dias: { type: [DiaSchema], default: [] },
    duracaoMin: { type: Number, default: 60 },
    intervaloMin: { type: Number, default: 0 },
    simultaneas: { type: Number, default: 1 },
    antecedenciaMin: { type: Number, default: 60 },
    lembrete: {
      ativo: { type: Boolean, default: true },
      templateName: { type: String, default: null },
      templateLanguage: { type: String, default: null },
    },
    atualizadoPor: { type: String },
  },
  { timestamps: true, collection: "wa_agenda_config" },
);
// Uma configuração por loja.
WaAgendaConfigSchema.index({ tenantId: 1 }, { unique: true });

if (process.env.NODE_ENV === "development") {
  for (const name of ["WaAgendamento", "WaAgendaConfig"]) {
    if (mongoose.models[name]) delete mongoose.models[name];
  }
}

export const WaAgendamento: Model<IWaAgendamento> =
  mongoose.models.WaAgendamento || mongoose.model<IWaAgendamento>("WaAgendamento", WaAgendamentoSchema);
export const WaAgendaConfig: Model<IWaAgendaConfig> =
  mongoose.models.WaAgendaConfig || mongoose.model<IWaAgendaConfig>("WaAgendaConfig", WaAgendaConfigSchema);
