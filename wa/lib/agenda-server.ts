// Agenda no servidor: ler a configuração e os horários ocupados de uma loja,
// o formato para a tela e o agendamento que a IA da loja cria. As contas são
// de wa/lib/agenda.ts (puras); aqui só a leitura e a gravação.

import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import RepasseVehicle from "@/models/RepasseVehicle";
import { WaAgendaConfig, WaAgendamento, type IWaAgendamento } from "@wa/models/agenda";
import type { IWaContact, IWaConversation } from "@wa/models/wa";
import type { IWaStore } from "@wa/models/store";
import { getStore } from "@wa/lib/store";
import {
  agendaTemDia,
  calcularHorariosLivres,
  conflitoDoHorario,
  dataLocal,
  horaLocal,
  horariosParaIa,
  inicioDoPedido,
  instanteLocal,
  normalizarConfig,
  ocupacoesDe,
  proximosDiasAbertos,
  rotuloDoDia,
  rotuloDoStatus,
  somarDias,
  type ConfigAgenda,
  type Ocupacao,
} from "@wa/lib/agenda";

const HORA = 3600_000;

/** Configuração gravada da loja. null = a loja ainda não configurou (a IA
 *  não oferece horário e agenda o que o cliente pediu). */
export async function configDaAgenda(tenantId: string | null): Promise<ConfigAgenda | null> {
  await dbConnect();
  const doc = await WaAgendaConfig.findOne({ tenantId }).lean();
  return doc ? normalizarConfig(doc) : null;
}

/** Configuração que serve para oferecer horário (gravada e com algum dia). */
export async function agendaComHorarios(tenantId: string | null): Promise<ConfigAgenda | null> {
  const c = await configDaAgenda(tenantId);
  return c && agendaTemDia(c) ? c : null;
}

/** Intervalos ocupados entre dois instantes. Pega também quem começou até 8h
 *  antes (visita longa que atravessa o começo do período). */
export async function ocupacoesDaLoja(
  tenantId: string | null,
  de: number,
  ate: number,
  exceto?: string | null,
): Promise<Ocupacao[]> {
  await dbConnect();
  const docs = await WaAgendamento.find({
    tenantId,
    status: { $in: ["a_confirmar", "confirmado"] },
    inicio: { $gte: new Date(de - 8 * HORA), $lt: new Date(ate) },
    ...(exceto && mongoose.isValidObjectId(exceto) ? { _id: { $ne: exceto } } : {}),
  })
    .select("inicio duracaoMin status")
    .lean();
  return ocupacoesDe(docs);
}

/** Horários livres de vários dias com uma leitura só do banco. */
export async function horariosLivresDaLoja(p: {
  tenantId: string | null;
  config: ConfigAgenda;
  dias: string[];
  duracaoMin?: number;
  exceto?: string | null;
  agora?: number;
}): Promise<Array<{ data: string; horas: string[] }>> {
  const dias = [...new Set(p.dias.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();
  if (!dias.length) return [];
  const agora = p.agora ?? Date.now();
  const ocupacoes = await ocupacoesDaLoja(
    p.tenantId,
    instanteLocal(dias[0], "00:00"),
    instanteLocal(somarDias(dias[dias.length - 1], 1), "00:00"),
    p.exceto,
  );
  return dias.map((data) => ({
    data,
    horas: calcularHorariosLivres({ config: p.config, data, agora, ocupacoes, duracaoMin: p.duracaoMin }),
  }));
}

/** Próximos dias com vaga (a partir de `desde`, ou de hoje). */
export async function proximosHorariosLivres(p: {
  tenantId: string | null;
  config: ConfigAgenda;
  desde?: string | null;
  quantosDias?: number;
  exceto?: string | null;
}): Promise<Array<{ data: string; horas: string[] }>> {
  const agora = Date.now();
  const abertos = proximosDiasAbertos(p.config, agora, 21).filter((d) => !p.desde || d >= p.desde);
  const porDia = await horariosLivresDaLoja({
    tenantId: p.tenantId,
    config: p.config,
    dias: abertos.slice(0, 10),
    agora,
    exceto: p.exceto,
  });
  return porDia.filter((d) => d.horas.length > 0).slice(0, p.quantosDias ?? 3);
}

/**
 * O horário entra na agenda da loja? Texto do motivo, ou null (cabe, ou a
 * loja não configurou a agenda: aí a equipe combina). `exceto` é o próprio
 * agendamento, na remarcação.
 */
export async function conflitoNaAgenda(p: {
  tenantId: string | null;
  inicio: Date;
  duracaoMin: number;
  exceto?: string | null;
  config?: ConfigAgenda | null;
}): Promise<{ motivo: "fechado" | "lotado"; texto: string; config: ConfigAgenda } | null> {
  const config = p.config === undefined ? await agendaComHorarios(p.tenantId) : p.config;
  if (!config) return null;
  const ini = p.inicio.getTime();
  const ocupacoes = await ocupacoesDaLoja(p.tenantId, ini, ini + p.duracaoMin * 60_000, p.exceto);
  const motivo = conflitoDoHorario({ config, inicio: p.inicio, duracaoMin: p.duracaoMin, ocupacoes });
  if (!motivo) return null;
  const quando = `${rotuloDoDia(dataLocal(p.inicio))} às ${horaLocal(p.inicio)}`;
  const texto =
    motivo === "fechado"
      ? `${quando} está fora do horário de visita da agenda.`
      : `${quando} já está lotado na agenda (${config.simultaneas === 1 ? "uma visita" : `${config.simultaneas} visitas`} ao mesmo tempo).`;
  return { motivo, texto, config };
}

/** O agendamento da conversa que um pedido novo remarca: o próximo que ainda
 *  ocupa a agenda, a confirmar ou já confirmado. */
async function agendamentoParaRemarcar(tenantId: string, conversationId: mongoose.Types.ObjectId | string, agora: number) {
  return WaAgendamento.findOne({
    tenantId,
    conversationId,
    status: { $in: ["a_confirmar", "confirmado"] },
    inicio: { $gte: new Date(agora - HORA) },
  }).sort({ inicio: 1 });
}

/**
 * Antes de a IA agendar: o horário pedido cabe (dia e hora de visita, com
 * vaga)? null = pode gravar. Senão, o texto que volta para a IA oferecer
 * outro horário (wa/lib/ai-loja.ts, validarAcao). Sem agenda configurada, a
 * IA agenda o que o cliente pediu e a equipe combina.
 */
export async function conferirPedidoDaIa(p: {
  tenantId: string;
  conversationId: mongoose.Types.ObjectId | string;
  input: { data_iso?: unknown; quando?: unknown };
}): Promise<string | null> {
  await dbConnect();
  const config = await agendaComHorarios(p.tenantId);
  if (!config) return null;
  const agora = Date.now();
  const { inicio } = inicioDoPedido(p.input, config, agora);
  const existente = await agendamentoParaRemarcar(p.tenantId, p.conversationId, agora);
  const exceto = existente ? String(existente._id) : null;
  const conflito = await conflitoNaAgenda({ tenantId: p.tenantId, inicio, duracaoMin: config.duracaoMin, exceto, config });
  if (!conflito) return null;
  const dia = dataLocal(inicio);
  const doDia = await horariosLivresDaLoja({ tenantId: p.tenantId, config, dias: [dia], exceto });
  const proximos = await proximosHorariosLivres({ tenantId: p.tenantId, config, desde: dia, exceto });
  return [
    `NÃO AGENDADO: ${conflito.texto}`,
    "Não diga que agendou. Ofereça ao cliente outro horário da lista e chame agendar_visita de novo quando ele escolher.",
    horariosParaIa([...doDia, ...proximos.filter((d) => d.data !== dia)], null, dia),
  ].join("\n");
}

export type AgendamentoDaTela = {
  id: string;
  tipo: "visita" | "test_drive";
  inicio: string;
  /** "AAAA-MM-DD" e "HH:MM" em Brasília (a tela não converte fuso). */
  data: string;
  hora: string;
  duracaoMin: number;
  status: IWaAgendamento["status"];
  horarioAproximado: boolean;
  contatoNome: string | null;
  contatoTelefone: string | null;
  conversationId: string | null;
  veiculoId: string | null;
  veiculo: string | null;
  responsavel: string | null;
  observacao: string | null;
  origem: "ia" | "equipe";
  criadoPor: string | null;
  lembrete: { em: string | null; via: string | null; erro: string | null };
  createdAt: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializarAgendamento(a: any): AgendamentoDaTela {
  const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : null);
  const id = (v: unknown) => (v ? String(v) : null);
  const inicio = new Date(a.inicio);
  return {
    id: String(a._id),
    tipo: a.tipo === "test_drive" ? "test_drive" : "visita",
    inicio: inicio.toISOString(),
    data: dataLocal(inicio),
    hora: horaLocal(inicio),
    duracaoMin: a.duracaoMin ?? 60,
    status: a.status,
    horarioAproximado: a.horarioAproximado === true,
    contatoNome: a.contatoNome ?? null,
    contatoTelefone: a.contatoTelefone ?? null,
    conversationId: id(a.conversationId),
    veiculoId: id(a.veiculoId),
    veiculo: a.veiculo ?? null,
    responsavel: a.responsavel ?? null,
    observacao: a.observacao ?? null,
    origem: a.origem === "ia" ? "ia" : "equipe",
    criadoPor: a.criadoPor ?? null,
    lembrete: { em: iso(a.lembrete?.em), via: a.lembrete?.via ?? null, erro: a.lembrete?.erro ?? null },
    createdAt: iso(a.createdAt) ?? new Date().toISOString(),
  };
}

/** Carro do pátio desta loja (só lojista tem pátio). */
export async function carroDaLoja(tenantId: string | null, veiculoId: string) {
  if (!mongoose.isValidObjectId(veiculoId)) return null;
  const store = await getStore(tenantId);
  if (!store || store.kind !== "lojista" || !store.ownerUserId) return null;
  return RepasseVehicle.findOne({ _id: veiculoId, lojistaId: store.ownerUserId })
    .select("marca modelo versao ano")
    .lean<{ _id: mongoose.Types.ObjectId; marca?: string; modelo?: string; versao?: string; ano?: string }>();
}

/** Carro do pátio pelo código que a IA viu na consulta ([L1A2B3]). */
async function carroPeloCodigo(
  store: Pick<IWaStore, "kind" | "ownerUserId">,
  ref: string,
): Promise<{ _id: mongoose.Types.ObjectId; titulo: string } | null> {
  const r = ref.trim().toUpperCase().replace(/^\[|\]$/g, "");
  if (store.kind !== "lojista" || !store.ownerUserId || !/^L[0-9A-F]{6}$/.test(r)) return null;
  const docs = await RepasseVehicle.find({ lojistaId: store.ownerUserId, ativo: true })
    .select("marca modelo versao ano")
    .limit(500)
    .lean();
  const d = docs.find((x) => String(x._id).slice(-6).toUpperCase() === r.slice(1));
  return d ? { _id: d._id as mongoose.Types.ObjectId, titulo: [d.marca, d.modelo, d.versao, d.ano].filter(Boolean).join(" ") } : null;
}

/**
 * Agendamento pedido pela IA (agendar_visita): sempre "a confirmar". Se a
 * conversa já tem um agendamento no futuro (a confirmar ou confirmado), ele é
 * remarcado em vez de virar dois na agenda: o confirmado volta para "a
 * confirmar" no horário novo e o lembrete da véspera volta a valer. O
 * horário já foi conferido antes (conferirPedidoDaIa).
 */
export async function agendarPelaIa(p: {
  store: Pick<IWaStore, "kind" | "ownerUserId"> & { _id: unknown };
  conv: Pick<IWaConversation, "_id" | "assignedTo">;
  contact: Pick<IWaContact, "_id" | "name" | "phone" | "whatsappPhone">;
  telefone: string | null;
  input: {
    tipo?: unknown;
    quando?: unknown;
    data_iso?: unknown;
    veiculo?: unknown;
    ref?: unknown;
    resumo?: unknown;
  };
}): Promise<IWaAgendamento> {
  await dbConnect();
  const tenantId = String(p.store._id);
  const config = await configDaAgenda(tenantId);
  const agora = Date.now();
  const { inicio, aproximado } = inicioDoPedido(p.input, config, agora);
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const carro = str(p.input.ref) ? await carroPeloCodigo(p.store, str(p.input.ref)) : null;
  const tipo: "visita" | "test_drive" = p.input.tipo === "test_drive" ? "test_drive" : "visita";
  const observacao = [
    `Pedido pela IA${str(p.input.quando) ? `: "${str(p.input.quando).slice(0, 120)}"` : ""}.`,
    str(p.input.resumo).slice(0, 600),
  ]
    .filter(Boolean)
    .join(" ");
  const dados = {
    tipo,
    inicio,
    horarioAproximado: aproximado,
    duracaoMin: config?.duracaoMin ?? 60,
    veiculoId: carro?._id ?? null,
    veiculo: (str(p.input.veiculo) || carro?.titulo || "").slice(0, 160) || null,
    observacao: observacao.slice(0, 1000),
    contatoNome: p.contact.name?.slice(0, 120) || null,
    contatoTelefone: p.telefone ?? p.contact.whatsappPhone ?? p.contact.phone,
  };

  const existente = await agendamentoParaRemarcar(tenantId, p.conv._id, agora);
  if (existente) {
    // A equipe vê de onde veio a remarcação (o horário antigo some da agenda).
    const antes = `Remarcado pela IA; antes: ${rotuloDoDia(dataLocal(existente.inicio))} às ${horaLocal(existente.inicio)} (${rotuloDoStatus(existente.status).toLowerCase()}).`;
    existente.set(dados);
    existente.set({
      status: "a_confirmar",
      confirmadoEm: null,
      observacao: `${antes} ${dados.observacao}`.slice(0, 1000),
      lembrete: { em: null, via: null, erro: null },
    });
    await existente.save();
    return existente;
  }
  return WaAgendamento.create({
    ...dados,
    tenantId,
    conversationId: p.conv._id,
    contactId: p.contact._id,
    status: "a_confirmar",
    responsavel: p.conv.assignedTo ?? null,
    origem: "ia",
    criadoPor: "IA",
  });
}
