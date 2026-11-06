// Operação da equipe: quem está atendendo (status e sinal de vida), os
// aparelhos inscritos nos avisos (push), o registro de cada atendimento
// humano e o controle do aviso fora do horário.
//
// Ficam fora de wa_conversations de propósito: são da equipe, mudam a cada
// minuto (o sinal de vida) e as métricas de Resultados precisam do histórico
// de cada passagem pela fila, que a conversa não guarda (o waitingSince e o
// assignedTo dela são só o estado de agora).

import mongoose, { Schema, Document, Model } from "mongoose";
import type { StatusAtendente } from "@wa/lib/equipe";

// ── Status de quem atende ────────────────────────────────────
export interface IWaAtendente extends Document {
  /** Loja (WaStore). null = CNV. */
  tenantId: string | null;
  email: string;
  /** Nome para a linha do tempo ("Distribuída para Ana"). */
  nome?: string | null;
  status: StatusAtendente;
  pausaMotivo?: string | null;
  /** Último sinal do navegador. Sem sinal há 3 min = Ausente. */
  vistoEm: Date;
  /** Quando o status mudou ("em pausa há 20 min"). */
  statusDesde: Date;
  /** A aba estava na frente no último sinal (o push não sai). */
  foco: boolean;
  /** Rodízio: quem recebeu há mais tempo é o próximo. */
  ultimaAtribuicaoEm?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const WaAtendenteSchema: Schema = new Schema(
  {
    tenantId: { type: String, default: null },
    email: { type: String, required: true, lowercase: true, trim: true },
    nome: { type: String, default: null },
    status: { type: String, enum: ["online", "pausa", "ausente"], default: "online" },
    pausaMotivo: { type: String, default: null },
    vistoEm: { type: Date, default: Date.now },
    statusDesde: { type: Date, default: Date.now },
    foco: { type: Boolean, default: false },
    ultimaAtribuicaoEm: { type: Date, default: null },
  },
  { timestamps: true, collection: "wa_atendentes" },
);
WaAtendenteSchema.index({ tenantId: 1, email: 1 }, { unique: true });
WaAtendenteSchema.index({ tenantId: 1, status: 1, vistoEm: -1 });

// ── Aparelho inscrito nos avisos ─────────────────────────────
export interface IWaPushInscricao extends Document {
  tenantId: string | null;
  email: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
  ultimoUsoEm?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const WaPushInscricaoSchema: Schema = new Schema(
  {
    tenantId: { type: String, default: null },
    email: { type: String, required: true, lowercase: true, trim: true },
    endpoint: { type: String, required: true },
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
    userAgent: { type: String },
    ultimoUsoEm: { type: Date, default: null },
  },
  { timestamps: true, collection: "wa_push_inscricoes" },
);
// O mesmo navegador é um aparelho só (trocar de loja move a inscrição).
WaPushInscricaoSchema.index({ endpoint: 1 }, { unique: true });
WaPushInscricaoSchema.index({ tenantId: 1, email: 1 });

// ── Atendimento humano (uma passagem pela equipe) ────────────
// Abre quando a conversa entra na fila (ou alguém assume direto) e fecha
// quando ela volta para a IA ou é encerrada. É a base do tempo de primeira
// resposta da equipe e do desempenho por atendente.
export interface IWaAtendimento extends Document {
  tenantId: string | null;
  conversationId: mongoose.Types.ObjectId;
  /** true enquanto a conversa está com a equipe (um aberto por conversa). */
  aberto: boolean;
  abertoEm: Date;
  /** Por que veio para a equipe (transferReason da conversa). */
  motivo?: string | null;
  /** Responsável atual (ou o último, depois de fechado). */
  atendente?: string | null;
  atribuidoEm?: Date | null;
  /** Chegou para a pessoa pela distribuição automática. */
  distribuida: boolean;
  transferencias: number;
  primeiraRespostaEm?: Date | null;
  /** Quem respondeu primeiro: o autor da mensagem quando gravado, senão o
   *  responsável da conversa naquele momento. */
  primeiraRespostaPor?: string | null;
  encerradoEm?: Date | null;
  desfecho?: "encerrada" | "devolvida_ia" | null;
  encerradoPor?: string | null;
  /** Entrou na fila com a loja fechada: distribuição, aviso e SLA esperam a
   *  próxima abertura. */
  aguardandoAbertura: boolean;
  /** Aviso (push) de "entrou na fila" já saiu para esta passagem. */
  filaAvisadaEm?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const WaAtendimentoSchema: Schema = new Schema(
  {
    tenantId: { type: String, default: null },
    conversationId: { type: Schema.Types.ObjectId, ref: "WaConversation", required: true },
    aberto: { type: Boolean, default: true },
    abertoEm: { type: Date, default: Date.now },
    motivo: { type: String, default: null },
    atendente: { type: String, default: null },
    atribuidoEm: { type: Date, default: null },
    distribuida: { type: Boolean, default: false },
    transferencias: { type: Number, default: 0 },
    primeiraRespostaEm: { type: Date, default: null },
    primeiraRespostaPor: { type: String, default: null },
    encerradoEm: { type: Date, default: null },
    desfecho: { type: String, enum: ["encerrada", "devolvida_ia", null], default: null },
    encerradoPor: { type: String, default: null },
    aguardandoAbertura: { type: Boolean, default: false },
    filaAvisadaEm: { type: Date, default: null },
  },
  { timestamps: true, collection: "wa_atendimentos" },
);
// Um atendimento aberto por conversa: a corrida entre o worker e a varredura
// perde no 11000 e lê o que já existe.
WaAtendimentoSchema.index(
  { conversationId: 1 },
  { unique: true, partialFilterExpression: { aberto: true } },
);
WaAtendimentoSchema.index({ tenantId: 1, abertoEm: -1 });
WaAtendimentoSchema.index({ aberto: 1, tenantId: 1 });

// ── Aviso fora do horário, por conversa ──────────────────────
export interface IWaConversaOperacao extends Document {
  conversationId: mongoose.Types.ObjectId;
  tenantId: string | null;
  /** Última mensagem automática fora do horário (no máximo uma a cada N h). */
  foraDoHorarioEm?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const WaConversaOperacaoSchema: Schema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: "WaConversation", required: true, unique: true },
    tenantId: { type: String, default: null },
    foraDoHorarioEm: { type: Date, default: null },
  },
  { timestamps: true, collection: "wa_conversa_operacao" },
);

export const WaAtendente: Model<IWaAtendente> =
  mongoose.models.WaAtendente || mongoose.model<IWaAtendente>("WaAtendente", WaAtendenteSchema);
export const WaPushInscricao: Model<IWaPushInscricao> =
  mongoose.models.WaPushInscricao || mongoose.model<IWaPushInscricao>("WaPushInscricao", WaPushInscricaoSchema);
export const WaAtendimento: Model<IWaAtendimento> =
  mongoose.models.WaAtendimento || mongoose.model<IWaAtendimento>("WaAtendimento", WaAtendimentoSchema);
export const WaConversaOperacao: Model<IWaConversaOperacao> =
  mongoose.models.WaConversaOperacao ||
  mongoose.model<IWaConversaOperacao>("WaConversaOperacao", WaConversaOperacaoSchema);
