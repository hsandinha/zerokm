// Tarefas da equipe (wa/models/tarefa.ts): validação, filtros da tela e a
// criação usada pelas rotas, pelo lembrete da véspera e pela IA.

import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { WaTarefa } from "@wa/models/tarefa";

export type FiltroTarefas = "abertas" | "minhas" | "atrasadas" | "feitas" | "todas";

export function ehFiltroTarefas(v: unknown): v is FiltroTarefas {
  return v === "abertas" || v === "minhas" || v === "atrasadas" || v === "feitas" || v === "todas";
}

/** Filtro do Mongo para cada aba da tela (sem o tenant, que a rota põe). */
export function filtroDasTarefas(filtro: FiltroTarefas, email: string, agora: Date = new Date()): Record<string, unknown> {
  switch (filtro) {
    case "minhas":
      return { feita: false, responsavel: email.toLowerCase() };
    case "atrasadas":
      return { feita: false, prazo: { $lt: agora } };
    case "feitas":
      return { feita: true };
    case "todas":
      return {};
    default:
      return { feita: false };
  }
}

export function tarefaAtrasada(t: { feita: boolean; prazo?: Date | string | null }, agora: Date = new Date()): boolean {
  return !t.feita && !!t.prazo && new Date(t.prazo).getTime() < agora.getTime();
}

export type EntradaTarefa = {
  titulo?: string;
  descricao?: string | null;
  prazo?: Date | null;
  responsavel?: string | null;
  conversationId?: string | null;
  feita?: boolean;
};

/** Valida o que veio da tela. `partial` = edição. Prazo em ISO; sem fuso, é
 *  Brasília (o que o <input type="datetime-local"> manda). */
export function validarTarefa(input: Record<string, unknown>, partial = false): { data: EntradaTarefa; errors: string[] } {
  const errors: string[] = [];
  const data: EntradaTarefa = {};
  const has = (k: string) => !partial || Object.prototype.hasOwnProperty.call(input, k);
  const txt = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

  if (has("titulo")) {
    const t = txt(input.titulo, 200);
    if (!t) errors.push("Escreva o que precisa ser feito.");
    else data.titulo = t;
  }
  if (has("descricao")) data.descricao = txt(input.descricao, 2000) || null;
  if (has("prazo")) {
    const p = txt(input.prazo, 40);
    if (!p) data.prazo = null;
    else {
      const semFuso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(p);
      const soDia = /^\d{4}-\d{2}-\d{2}$/.test(p);
      const d = new Date(soDia ? `${p}T18:00:00-03:00` : semFuso ? `${p.slice(0, 16)}:00-03:00` : p);
      if (Number.isNaN(d.getTime())) errors.push("Prazo inválido.");
      else data.prazo = d;
    }
  }
  if (has("responsavel")) {
    const r = txt(input.responsavel, 200).toLowerCase();
    if (r && !/^[^\s@]+@[^\s@]+$/.test(r)) errors.push("Responsável inválido.");
    else data.responsavel = r || null;
  }
  if (has("conversationId")) {
    const id = txt(input.conversationId, 24);
    if (id && !mongoose.isValidObjectId(id)) errors.push("Conversa inválida.");
    else data.conversationId = id || null;
  }
  if (Object.prototype.hasOwnProperty.call(input, "feita")) data.feita = input.feita === true;
  return { data, errors };
}

export type TarefaDaTela = {
  id: string;
  titulo: string;
  descricao: string | null;
  prazo: string | null;
  responsavel: string | null;
  conversationId: string | null;
  contatoNome: string | null;
  agendamentoId: string | null;
  feita: boolean;
  feitaEm: string | null;
  feitaPor: string | null;
  origem: "equipe" | "agenda" | "ia";
  criadoPor: string | null;
  createdAt: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializarTarefa(t: any): TarefaDaTela {
  const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : null);
  const id = (v: unknown) => (v ? String(v) : null);
  return {
    id: String(t._id),
    titulo: t.titulo,
    descricao: (t.descricao as string) ?? null,
    prazo: iso(t.prazo),
    responsavel: (t.responsavel as string) ?? null,
    conversationId: id(t.conversationId),
    contatoNome: (t.contatoNome as string) ?? null,
    agendamentoId: id(t.agendamentoId),
    feita: t.feita === true,
    feitaEm: iso(t.feitaEm),
    feitaPor: (t.feitaPor as string) ?? null,
    origem: t.origem ?? "equipe",
    criadoPor: (t.criadoPor as string) ?? null,
    createdAt: iso(t.createdAt) ?? new Date().toISOString(),
  };
}

/** Cria a tarefa (rotas, lembrete da véspera, IA). `semRepetir`: se a
 *  conversa já tem uma tarefa aberta com o mesmo título, devolve ela em vez
 *  de criar outra (o cliente pedindo a mesma foto duas vezes). */
export async function criarTarefa(p: {
  tenantId: string | null;
  titulo: string;
  descricao?: string | null;
  prazo?: Date | null;
  responsavel?: string | null;
  conversationId?: mongoose.Types.ObjectId | string | null;
  contactId?: mongoose.Types.ObjectId | string | null;
  contatoNome?: string | null;
  agendamentoId?: mongoose.Types.ObjectId | string | null;
  origem: "equipe" | "agenda" | "ia";
  criadoPor?: string | null;
  semRepetir?: boolean;
}) {
  await dbConnect();
  const titulo = p.titulo.slice(0, 200).trim();
  if (p.semRepetir && p.conversationId) {
    const aberta = await WaTarefa.findOne({
      tenantId: p.tenantId,
      conversationId: p.conversationId,
      feita: { $ne: true },
      titulo,
    });
    if (aberta) return aberta;
  }
  return WaTarefa.create({
    tenantId: p.tenantId,
    titulo,
    descricao: p.descricao?.slice(0, 2000) || undefined,
    prazo: p.prazo ?? null,
    responsavel: p.responsavel?.toLowerCase() || null,
    conversationId: p.conversationId || null,
    contactId: p.contactId || null,
    contatoNome: p.contatoNome?.slice(0, 120) || undefined,
    agendamentoId: p.agendamentoId || null,
    origem: p.origem,
    criadoPor: p.criadoPor ?? null,
  });
}
