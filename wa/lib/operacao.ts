// Configuração da operação da equipe de uma loja (horário, distribuição e
// SLA), já completa e validada. Toda leitura passa por aqui: loja sem o
// bloco `operacao` (todas as de antes) continua como sempre foi, sem
// horário, com distribuição manual e SLA de 15 minutos.
//
// O CNV (tenantId null) não tem esse bloco: a Vera e a equipe do painel
// seguem 24h, manual e com o SLA padrão.

import dbConnect from "@/lib/mongodb";
import { WaStore, type IWaStore } from "@wa/models/store";
import { normalizarHorario, type HorarioLoja } from "@wa/lib/horario";
import { isModoDistribuicao, slaValido, type ModoDistribuicao } from "@wa/lib/equipe";
import { SLA_MINUTES } from "@wa/lib/stages";
import mongoose from "mongoose";

export type OperacaoDaLoja = {
  horario: HorarioLoja;
  distribuicao: ModoDistribuicao;
  slaMinutos: number;
};

export function operacaoPadrao(): OperacaoDaLoja {
  return { horario: normalizarHorario(null), distribuicao: "manual", slaMinutos: SLA_MINUTES };
}

export function operacaoDe(store: Pick<IWaStore, "operacao"> | null | undefined): OperacaoDaLoja {
  const op = store?.operacao;
  if (!op) return operacaoPadrao();
  // Subdocumento do mongoose: lê como objeto puro para o normalizador.
  const raw = (op as { toObject?: () => unknown }).toObject?.() ?? op;
  const r = raw as NonNullable<IWaStore["operacao"]>;
  return {
    horario: normalizarHorario(r.horario ?? null),
    distribuicao: isModoDistribuicao(r.distribuicao) ? r.distribuicao : "manual",
    slaMinutos: r.slaMinutos == null ? SLA_MINUTES : slaValido(r.slaMinutos),
  };
}

export async function operacaoDaLoja(tenantId: string | null | undefined): Promise<OperacaoDaLoja> {
  if (!tenantId || !mongoose.isValidObjectId(tenantId)) return operacaoPadrao();
  await dbConnect();
  const store = await WaStore.findById(tenantId).select("operacao").lean();
  return operacaoDe(store as Pick<IWaStore, "operacao"> | null);
}

/** Meta de primeira resposta da loja, em minutos. */
export async function slaDaLoja(tenantId: string | null | undefined): Promise<number> {
  return (await operacaoDaLoja(tenantId)).slaMinutos;
}
