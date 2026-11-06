// Colunas do funil — lado do servidor. Ver wa/models/funil.ts para o desenho
// e wa/lib/stages.ts para a regra de qual coluna mostra o cartão.
//
// Dono sem coluna nenhuma ganha as padrão na primeira leitura. Apagar uma
// coluna devolve os cartões dela para a coluna de sistema da etapa (ou para
// "Sem etapa", se essa também foi apagada).

import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { WaFunilColuna, type IWaFunilColuna } from "@wa/models/funil";
import { WaConversation } from "@wa/models/wa";
import {
  COLUNA_CORES,
  colunaDoCartao,
  colunasPadrao,
  etapasDaColuna,
  type ColunaTipo,
  type FunilColuna,
  type Stage,
} from "@wa/lib/stages";
import { normalizarFollowup, type FollowupConfig } from "@wa/lib/automacoes";
import { eventoValido, type EventoMeta } from "@wa/lib/conversoes-meta";

export class FunilError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type ColunaLean = Pick<IWaFunilColuna, "name" | "color" | "position" | "systemKey" | "type" | "eventoMeta"> & {
  _id: unknown;
};

function paraColuna(doc: ColunaLean): FunilColuna {
  return {
    id: String(doc._id),
    name: doc.name,
    color: doc.color,
    position: doc.position,
    systemKey: (doc.systemKey ?? null) as Stage | null,
    type: doc.type,
    // Ausente fica ausente: a coluna antiga segue o tipo (eventoDaColuna).
    ...(doc.eventoMeta !== undefined ? { eventoMeta: doc.eventoMeta ?? null } : {}),
  };
}

function ehDuplicado(err: unknown): boolean {
  return (err as { code?: number })?.code === 11000;
}

/** Cria as colunas de sistema que faltam (todas, no dono novo). */
async function semearPadrao(tenantId: string | null, posicaoInicial: number): Promise<void> {
  const existentes = await WaFunilColuna.find({ tenantId, systemKey: { $ne: null } })
    .select("systemKey")
    .lean();
  const tem = new Set(existentes.map((c) => c.systemKey));
  const faltam = colunasPadrao(tenantId !== null).filter((c) => !tem.has(c.systemKey));
  for (const [i, c] of faltam.entries()) {
    try {
      await WaFunilColuna.create({ ...c, tenantId, position: posicaoInicial + i });
    } catch (err) {
      // Outra leitura criou a mesma coluna agora: fica a dela.
      if (!ehDuplicado(err)) throw err;
    }
  }
}

/** Colunas do dono, em ordem. Na primeira vez, cria as padrão. */
export async function colunasDo(tenantId: string | null): Promise<FunilColuna[]> {
  await dbConnect();
  let docs = await WaFunilColuna.find({ tenantId }).sort({ position: 1, createdAt: 1 }).lean();
  if (docs.length === 0) {
    await semearPadrao(tenantId, 0);
    docs = await WaFunilColuna.find({ tenantId }).sort({ position: 1, createdAt: 1 }).lean();
  }
  return docs.map(paraColuna);
}

/** Falta alguma coluna de sistema? (o quadro oferece restaurar) */
export function faltamColunasPadrao(colunas: FunilColuna[]): boolean {
  const tem = new Set(colunas.map((c) => c.systemKey).filter(Boolean));
  return colunasPadrao(false).some((c) => !tem.has(c.systemKey));
}

export async function restaurarColunasPadrao(tenantId: string | null): Promise<void> {
  await dbConnect();
  const ultima = await WaFunilColuna.findOne({ tenantId }).sort({ position: -1 }).select("position").lean();
  await semearPadrao(tenantId, (ultima?.position ?? -1) + 1);
}

function corValida(color: unknown): string {
  return typeof color === "string" && color in COLUNA_CORES ? color : "cinza";
}

function nomeValido(name: unknown): string {
  const nome = typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
  if (!nome) throw new FunilError(400, "Dê um nome para a coluna.");
  if (nome.length > 40) throw new FunilError(400, "Nome com até 40 caracteres.");
  return nome;
}

function tipoValido(type: unknown): ColunaTipo {
  return type === "won" || type === "lost" ? type : "open";
}

/** Evento para a Meta escolhido no modal: um dos nomes da Meta, ou nenhum
 *  (null ou vazio). Qualquer outro texto é recusado: a Meta só aceita estes. */
function eventoMetaValido(v: unknown): EventoMeta | null {
  if (v === null || v === "") return null;
  if (eventoValido(v)) return v;
  throw new FunilError(400, "Evento da Meta inválido.");
}

async function colunaDoDono(tenantId: string | null, id: string): Promise<IWaFunilColuna> {
  if (!mongoose.isValidObjectId(id)) throw new FunilError(404, "Coluna não encontrada.");
  const col = await WaFunilColuna.findOne({ _id: id, tenantId });
  if (!col) throw new FunilError(404, "Coluna não encontrada.");
  return col;
}

export async function criarColuna(
  tenantId: string | null,
  input: { name?: unknown; color?: unknown; type?: unknown; eventoMeta?: unknown },
): Promise<FunilColuna> {
  await dbConnect();
  const name = nomeValido(input.name);
  // Sem escolha, a coluna nova fica sem o campo e segue o tipo dela.
  const eventoMeta = input.eventoMeta === undefined ? undefined : eventoMetaValido(input.eventoMeta);
  await colunasDo(tenantId); // garante as padrão antes da primeira coluna nova
  const ultima = await WaFunilColuna.findOne({ tenantId }).sort({ position: -1 }).select("position").lean();
  const doc = await WaFunilColuna.create({
    tenantId,
    name,
    color: corValida(input.color),
    type: tipoValido(input.type),
    systemKey: null,
    position: (ultima?.position ?? -1) + 1,
    ...(eventoMeta !== undefined ? { eventoMeta } : {}),
  });
  return paraColuna(doc.toObject());
}

/** Nome, cor e evento da Meta de qualquer coluna; o tipo só das colunas
 *  próprias (o da de sistema vem da etapa). */
export async function editarColuna(
  tenantId: string | null,
  id: string,
  input: { name?: unknown; color?: unknown; type?: unknown; eventoMeta?: unknown },
): Promise<void> {
  await dbConnect();
  const col = await colunaDoDono(tenantId, id);
  if (input.name !== undefined) col.name = nomeValido(input.name);
  if (input.color !== undefined) col.color = corValida(input.color);
  if (input.type !== undefined && !col.systemKey) col.type = tipoValido(input.type);
  if (input.eventoMeta !== undefined) col.eventoMeta = eventoMetaValido(input.eventoMeta);
  await col.save();
}

/** Troca de lugar com a vizinha. Reescreve as posições 0..n, então posição
 *  repetida (de colunas antigas) não trava a troca. */
export async function moverColuna(tenantId: string | null, id: string, lado: "esquerda" | "direita"): Promise<void> {
  await dbConnect();
  const docs = await WaFunilColuna.find({ tenantId }).sort({ position: 1, createdAt: 1 }).select("_id").lean();
  const i = docs.findIndex((d) => String(d._id) === id);
  if (i < 0) throw new FunilError(404, "Coluna não encontrada.");
  const j = lado === "esquerda" ? i - 1 : i + 1;
  if (j < 0 || j >= docs.length) return;
  [docs[i], docs[j]] = [docs[j], docs[i]];
  await WaFunilColuna.bulkWrite(
    docs.map((d, position) => ({ updateOne: { filter: { _id: d._id }, update: { $set: { position } } } })),
  );
}

/** Apaga a coluna; os cartões dela voltam para a coluna da etapa. */
export async function apagarColuna(tenantId: string | null, id: string): Promise<void> {
  await dbConnect();
  const col = await colunaDoDono(tenantId, id);
  await WaConversation.updateMany({ tenantId, stageId: col._id }, { $set: { stageId: null } });
  await col.deleteOne();
}

/** Filtro do Mongo para os cartões que o quadro mostra nesta coluna (a
 *  mesma regra de `colunaDoCartao`, em consulta). */
export function filtroDaColuna(
  col: FunilColuna,
  colunas: FunilColuna[],
): Record<string, unknown> {
  const postos = {
    stageId: new mongoose.Types.ObjectId(col.id),
    stage: { $in: etapasDaColuna(col) },
  };
  if (!col.systemKey) return postos;
  // Etapa desta coluna sem coluna própria compatível: cai aqui.
  const compativeis = colunas
    .filter((c) => c.id !== col.id && etapasDaColuna(c).includes(col.systemKey!))
    .map((c) => new mongoose.Types.ObjectId(c.id));
  return { $or: [postos, { stage: col.systemKey, stageId: { $nin: compativeis } }] };
}

/** Filtro dos cartões que não cabem em nenhuma coluna ("Sem etapa"). */
export function filtroSemColuna(colunas: FunilColuna[]): Record<string, unknown> | null {
  const etapas = colunasPadrao(false).map((c) => c.systemKey as Stage);
  const orfas = etapas.filter((e) => !colunas.some((c) => c.systemKey === e));
  if (orfas.length === 0) return null;
  return {
    $or: orfas.map((e) => ({
      stage: e,
      stageId: {
        $nin: colunas
          .filter((c) => etapasDaColuna(c).includes(e))
          .map((c) => new mongoose.Types.ObjectId(c.id)),
      },
    })),
  };
}

/** Quantos cartões em cada coluna (chave = id; "sem" = sem coluna). */
export async function contarPorColuna(
  tenantId: string | null,
  colunas: FunilColuna[],
): Promise<Record<string, number>> {
  await dbConnect();
  const grupos = await WaConversation.aggregate<{ _id: { stage: string; stageId: unknown }; n: number }>([
    { $match: { tenantId } },
    { $group: { _id: { stage: "$stage", stageId: "$stageId" }, n: { $sum: 1 } } },
  ]);
  const out: Record<string, number> = {};
  for (const g of grupos) {
    const col = colunaDoCartao(
      { stage: g._id.stage, stageId: g._id.stageId ? String(g._id.stageId) : null },
      colunas,
    );
    const key = col?.id ?? "sem";
    out[key] = (out[key] ?? 0) + g.n;
  }
  return out;
}

/** Coluna pelo id, do dono. */
export async function colunaPorId(tenantId: string | null, id: string): Promise<FunilColuna> {
  await dbConnect();
  return paraColuna((await colunaDoDono(tenantId, id)).toObject());
}

// ── Follow-up da coluna ──────────────────────────────────────
// A regra mora na coluna (wa/models/funil.ts); quem manda é
// wa/lib/funil-followup.ts, e a conferência dos campos é a de
// wa/lib/automacoes.ts (a mesma da tela).

/** Follow-up de cada coluna do dono (chave = id da coluna). */
export async function followupsDoDono(tenantId: string | null): Promise<Record<string, FollowupConfig>> {
  await dbConnect();
  const docs = await WaFunilColuna.find({ tenantId }).select("followup").lean();
  return Object.fromEntries(
    docs.map((d) => [String(d._id), normalizarFollowup(d.followup as Record<string, unknown> | undefined).config]),
  );
}

/** Grava o follow-up de uma coluna do dono. Configuração que não fecha (ligado
 *  sem texto, 24h ou mais sem template) volta com o motivo. */
export async function salvarFollowupDaColuna(
  tenantId: string | null,
  id: string,
  input: Record<string, unknown>,
): Promise<FollowupConfig> {
  await dbConnect();
  const col = await colunaDoDono(tenantId, id);
  const { config, erro } = normalizarFollowup(input);
  if (erro) throw new FunilError(400, erro);
  await WaFunilColuna.updateOne({ _id: col._id, tenantId }, { $set: { followup: config } });
  return config;
}

export type ColunaComFollowup = { id: string; tenantId: string | null; name: string; followup: FollowupConfig };

/** Colunas com follow-up ligado, de todos os donos (o worker). */
export async function colunasComFollowupLigado(): Promise<ColunaComFollowup[]> {
  await dbConnect();
  const docs = await WaFunilColuna.find({ "followup.ativo": true }).select("tenantId name followup").lean();
  return docs.map((d) => ({
    id: String(d._id),
    tenantId: d.tenantId ?? null,
    name: d.name,
    followup: normalizarFollowup(d.followup as Record<string, unknown> | undefined).config,
  }));
}
