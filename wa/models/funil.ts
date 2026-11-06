// Colunas do funil, por dono (loja ou CNV). Mesmo desenho do Chatrun
// (lead_stages): a coluna é onde o cartão fica; a etapa da conversa
// (WaConversation.stage) é o que o sistema sabe dela e continua sendo o que a
// IA, os KPIs, os webhooks e a API pública leem.
//
// - Coluna de sistema (`systemKey`): a de uma etapa automática. A IA e o
//   disparo levam o cartão para ela. Dá para renomear, mudar a cor, mover e
//   até apagar (o quadro oferece "Restaurar colunas padrão").
// - Coluna própria (`systemKey` null): criada pela loja. `type` diz o que ela
//   significa: em andamento, venda fechada ou perdido.
//
// Qual coluna mostra um cartão é decidido na leitura (wa/lib/stages.ts,
// `colunaDoCartao`), então quem grava só a etapa não precisa saber de coluna.

import mongoose, { Schema, Document, Model } from "mongoose";
import type { WaStage } from "@wa/models/wa";
import { EVENTOS_META, type EventoMeta } from "@wa/lib/conversoes-meta";

export type WaColunaTipo = "open" | "won" | "lost";

export interface IWaFunilColuna extends Document {
  /** Loja (WaStore). null = CNV. */
  tenantId: string | null;
  name: string;
  /** Token de cor (COLUNA_CORES em wa/lib/stages.ts). */
  color: string;
  position: number;
  systemKey: WaStage | null;
  type: WaColunaTipo;
  createdAt: Date;
  updatedAt: Date;
}

const WaFunilColunaSchema: Schema = new Schema(
  {
    tenantId: { type: String, default: null },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    color: { type: String, default: "cinza" },
    position: { type: Number, default: 0 },
    systemKey: {
      type: String,
      enum: ["abordado", "conversa", "cadastro", "pagamento", "ganho", "perdido", null],
      default: null,
    },
    type: { type: String, enum: ["open", "won", "lost"], default: "open" },
  },
  { timestamps: true, collection: "wa_funil_colunas" },
);
WaFunilColunaSchema.index({ tenantId: 1, position: 1 });
// Uma coluna de sistema por etapa e por dono: duas leituras simultâneas do
// quadro vazio não criam as colunas padrão em dobro.
WaFunilColunaSchema.index(
  { tenantId: 1, systemKey: 1 },
  { unique: true, partialFilterExpression: { systemKey: { $type: "string" } } },
);

// ── Follow-up automático da coluna ───────────────────────────
// "Nesta coluna, se o cliente não responder em 48h, manda um follow-up; no
// máximo 2." Dentro da janela de 24h vai o texto (ou a IA escreve, com o texto
// como orientação); fora dela só o template aprovado, e sem template a
// conversa é pulada. O worker é /api/wa/workers/funil-followup
// (wa/lib/funil-followup.ts); a contagem fica na conversa.
export interface IWaFunilColuna {
  followup?: {
    ativo: boolean;
    /** Horas sem resposta do cliente antes do toque. */
    horas: number;
    /** Máximo de toques enquanto o cliente não responde. */
    maximo: number;
    modo: "ia" | "texto";
    /** Texto com {{nome}} (modo texto) ou orientação para a IA (modo ia). */
    texto?: string;
    /** Template aprovado para quando a janela de 24h já fechou. */
    template?: string | null;
    templateIdioma: string;
    /** Campo de cada variável do corpo do template, na ordem ({{1}}, {{2}}...). */
    templateVars: string[];
  };
}
WaFunilColunaSchema.add({
  followup: {
    ativo: { type: Boolean, default: false },
    horas: { type: Number, default: 24, min: 1, max: 720 },
    maximo: { type: Number, default: 1, min: 1, max: 10 },
    modo: { type: String, enum: ["ia", "texto"], default: "texto" },
    texto: { type: String, maxlength: 1000 },
    template: { type: String, default: null },
    templateIdioma: { type: String, default: "pt_BR" },
    templateVars: { type: [String], default: [] },
  },
});
WaFunilColunaSchema.index({ "followup.ativo": 1 });

// ── Evento para a Meta ───────────────────────────────────────
// Quando um cartão que veio de anúncio entra na coluna, este evento volta
// para o anúncio pela API de Conversões (wa/lib/conversoes-meta.ts). Sem
// default de propósito: coluna sem o campo (as de antes) segue o tipo
// (venda fechada = Purchase, as outras nada); null = nenhum, escolhido.
export interface IWaFunilColuna {
  eventoMeta?: EventoMeta | null;
}
WaFunilColunaSchema.add({
  eventoMeta: { type: String, enum: [...EVENTOS_META, null] },
});

export const WaFunilColuna: Model<IWaFunilColuna> =
  mongoose.models.WaFunilColuna ||
  mongoose.model<IWaFunilColuna>("WaFunilColuna", WaFunilColunaSchema);
