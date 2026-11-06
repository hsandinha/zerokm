// Automações da loja, lado do servidor: a configuração (uma por tipo e por
// dono) e a rodada do worker /api/wa/workers/automacoes. O que cada uma é
// está em wa/lib/automacoes.ts; o envio, em wa/lib/envio-automatico.ts.
//
// Quem recebe, em cada rodada:
//   • pós-atendimento: conversa encerrada há X horas (até 3 dias além), em que
//     o cliente escreveu até 7 dias antes do encerramento e não voltou depois
//     dele. Uma vez por atendimento (a chave é a última mensagem do cliente) e
//     no máximo uma a cada 30 dias por conversa; responder só a uma automação
//     não conta como atendimento. Quem saiu por opt-out ou disse que não tem
//     interesse não recebe;
//   • pós-venda: conversa que foi para venda fechada (etapa ganho) há X dias
//     (até 3 dias além). Uma vez por venda;
//   • aniversário: contato com aniversário hoje, a partir da hora escolhida.
//     Uma vez por ano.
//
// Antes de reservar, o que não pode sair AGORA fica para a próxima rodada
// (outra automática há menos de 12h, cadência de campanha prestes a sair);
// depois de reservado, o evento nunca volta: saiu, pulou ou falhou, uma vez.

import type { Types } from "mongoose";
import dbConnect from "@/lib/mongodb";
import { WaContact, WaConversation, WaFollowup, WaMessage, type IWaContact } from "@wa/models/wa";
import { WaAutomacao, WaAutomacaoEnvio, type IWaAutomacao } from "@wa/models/automacao";
import {
  ATENDIMENTO_RECENTE_MS,
  DIA_MS,
  HORA_MS,
  INTERVALO_DA_AVALIACAO_MS,
  INTERVALO_ENTRE_AUTOMATICAS_MS,
  TIPOS_DE_AUTOMACAO,
  agoraEmBrasilia,
  automacaoPadrao,
  automaticaRecente,
  diasDeAniversarioDe,
  horarioPermitido,
  motivoParaNaoAvaliar,
  normalizarAutomacao,
  preencherTexto,
  primeiroNome,
  type AutomacaoConfig,
  type DadosDaMensagem,
  type TipoAutomacao,
} from "@wa/lib/automacoes";
import { Rodada, concluirEnvio, enviarAutomatico, reservarEnvio, type PedidoDeEnvio } from "@wa/lib/envio-automatico";

export class AutomacaoError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "AutomacaoError";
  }
}

// ── Configuração ─────────────────────────────────────────────

function paraConfig(doc: Partial<IWaAutomacao> | null, tipo: TipoAutomacao): AutomacaoConfig {
  if (!doc) return automacaoPadrao(tipo);
  return normalizarAutomacao(tipo, doc as unknown as Record<string, unknown>).config;
}

/** As três automações do dono; a que nunca foi salva vem com o padrão (desligada). */
export async function automacoesDoDono(tenantId: string | null): Promise<AutomacaoConfig[]> {
  await dbConnect();
  const docs = await WaAutomacao.find({ tenantId }).lean();
  return TIPOS_DE_AUTOMACAO.map((tipo) => paraConfig(docs.find((d) => d.tipo === tipo) ?? null, tipo));
}

export async function salvarAutomacao(
  tenantId: string | null,
  tipo: unknown,
  input: Record<string, unknown>,
  por: string,
): Promise<AutomacaoConfig> {
  if (!TIPOS_DE_AUTOMACAO.includes(tipo as TipoAutomacao)) throw new AutomacaoError("Automação inválida.");
  const { config, erro } = normalizarAutomacao(tipo as TipoAutomacao, input);
  if (erro) throw new AutomacaoError(erro);
  await dbConnect();
  const { tipo: _t, ...campos } = config;
  void _t;
  await WaAutomacao.updateOne(
    { tenantId, tipo: tipo as TipoAutomacao },
    { $set: { ...campos, updatedBy: por } },
    { upsert: true },
  );
  return config;
}

export type EnvioRecente = {
  id: string;
  tipo: string;
  situacao: string;
  canal: string | null;
  como: string | null;
  motivo: string | null;
  contato: string | null;
  conversationId: string | null;
  criadoEm: string;
};

export async function enviosRecentes(tenantId: string | null, limite = 40): Promise<EnvioRecente[]> {
  await dbConnect();
  const envios = await WaAutomacaoEnvio.find({ tenantId }).sort({ createdAt: -1 }).limit(limite).lean();
  const contatos = await WaContact.find({
    _id: { $in: envios.map((e) => e.contactId).filter((id): id is Types.ObjectId => Boolean(id)) },
    tenantId,
  })
    .select("name phone")
    .lean();
  const porId = new Map(contatos.map((c) => [String(c._id), c]));
  return envios.map((e) => {
    const c = e.contactId ? porId.get(String(e.contactId)) : null;
    return {
      id: String(e._id),
      tipo: e.tipo,
      situacao: e.situacao,
      canal: e.canal ?? null,
      como: e.como ?? null,
      motivo: e.motivo ?? null,
      contato: c ? c.name || c.phone : null,
      conversationId: e.conversationId ? String(e.conversationId) : null,
      criadoEm: new Date(e.createdAt).toISOString(),
    };
  });
}

// ── Rodada do worker ─────────────────────────────────────────

export type ResultadoDasAutomacoes = { enviadas: number; puladas: number; falhas: number; adiadas: number };

type Contexto = {
  rodada: Rodada;
  res: ResultadoDasAutomacoes;
  limite: number;
};

const esgotado = (ctx: Contexto) => ctx.rodada.esgotada || ctx.res.enviadas + ctx.res.falhas >= ctx.limite;

export async function runAutomacoes(opts: { limite?: number; prazoMs?: number } = {}): Promise<ResultadoDasAutomacoes> {
  const res: ResultadoDasAutomacoes = { enviadas: 0, puladas: 0, falhas: 0, adiadas: 0 };
  // Nada automático de madrugada: fica para a manhã.
  if (!horarioPermitido()) return res;
  await dbConnect();
  const ativas = await WaAutomacao.find({ ativa: true }).lean();
  const ctx: Contexto = { rodada: new Rodada(opts.prazoMs), res, limite: opts.limite ?? 40 };

  for (const doc of ativas) {
    if (esgotado(ctx)) break;
    const tenantId = doc.tenantId ?? null;
    const dono = await ctx.rodada.dono(tenantId);
    if (!dono.liberado) continue;
    const cfg = paraConfig(doc, doc.tipo);
    if (!cfg.texto) continue;
    try {
      if (cfg.tipo === "pos_atendimento") await posAtendimento(ctx, tenantId, cfg, dono.nome);
      else if (cfg.tipo === "pos_venda") await posVenda(ctx, tenantId, cfg, dono.nome);
      else await aniversarios(ctx, tenantId, cfg, dono.nome);
    } catch (err) {
      // Uma loja com problema não segura as outras.
      console.error("[automacoes]", cfg.tipo, tenantId, err);
    }
  }
  return res;
}

function dadosDe(contato: Pick<IWaContact, "name">, loja: string, cfg: AutomacaoConfig): DadosDaMensagem {
  return {
    nome: primeiroNome(contato.name),
    nome_completo: (contato.name ?? "").trim(),
    loja,
    link_avaliacao: cfg.linkAvaliacao,
  };
}

type ConversaLean = {
  _id: Types.ObjectId;
  contactId: Types.ObjectId;
  channelId?: Types.ObjectId | null;
  lastInboundAt?: Date | null;
  ultimoAutomaticoAt?: Date | null;
};

/** Pode sair agora? Outra automática há pouco, ou a cadência da campanha
 *  saindo nas próximas horas: fica para depois (sem reservar). */
async function deveAdiar(conv: ConversaLean): Promise<boolean> {
  if (automaticaRecente(conv.ultimoAutomaticoAt)) return true;
  const cadencia = await WaFollowup.exists({
    conversationId: conv._id,
    status: "pending",
    runAfter: { $lte: new Date(Date.now() + INTERVALO_ENTRE_AUTOMATICAS_MS) },
  });
  return Boolean(cadencia);
}

async function chavesFeitas(tenantId: string | null, tipo: TipoAutomacao, chaves: string[]): Promise<Set<string>> {
  if (chaves.length === 0) return new Set();
  const feitos = await WaAutomacaoEnvio.find({ tenantId, tipo, chave: { $in: chaves } }).select("chave").lean();
  return new Set(feitos.map((f) => f.chave));
}

/** Reserva, manda e registra um evento. */
async function disparar(
  ctx: Contexto,
  tipo: TipoAutomacao,
  chave: string,
  pedido: PedidoDeEnvio,
): Promise<void> {
  const envioId = await reservarEnvio({
    tenantId: pedido.tenantId,
    tipo,
    chave,
    contactId: pedido.contact._id,
    conversationId: pedido.conversation?._id ?? null,
  });
  if (!envioId) return; // outra rodada já cuidou
  const saida = await enviarAutomatico(ctx.rodada, pedido);
  await concluirEnvio(envioId, saida);
  if (saida.situacao === "enviada") ctx.res.enviadas++;
  else if (saida.situacao === "falhou") ctx.res.falhas++;
  else ctx.res.puladas++;
}

function pedidoDe(
  tenantId: string | null,
  contato: IWaContact,
  conv: ConversaLean | null,
  cfg: AutomacaoConfig,
  loja: string,
): PedidoDeEnvio {
  const dados = dadosDe(contato, loja, cfg);
  return {
    tenantId,
    contact: contato,
    conversation: conv as PedidoDeEnvio["conversation"],
    texto: async () => {
      const t = preencherTexto(cfg.texto, dados);
      return t ? { texto: t, como: "texto" } : null;
    },
    template: cfg.template ? { nome: cfg.template, idioma: cfg.templateIdioma, vars: cfg.templateVars } : null,
    dados,
  };
}

/** Janela de busca: do prazo até 3 dias além (ligar a automação não manda
 *  para o histórico inteiro). */
function janelaDoPrazo(esperaMs: number): { ate: Date; desde: Date } {
  const agora = Date.now();
  return { ate: new Date(agora - esperaMs), desde: new Date(agora - esperaMs - 3 * DIA_MS) };
}

/** As datas que decidem se a conversa conta como atendimento
 *  (motivoParaNaoAvaliar): o último pedido de avaliação, a última automação
 *  antes da última mensagem do cliente e o que ele escreveu antes dela. */
async function historicoDaAvaliacao(
  tenantId: string | null,
  conv: { _id: Types.ObjectId; closedAt?: Date | null; lastInboundAt?: Date | null },
) {
  const fechada = new Date(conv.closedAt!).getTime();
  const cliente = new Date(conv.lastInboundAt!).getTime();
  const envios = await WaAutomacaoEnvio.find({
    tenantId,
    conversationId: conv._id,
    tipo: { $in: TIPOS_DE_AUTOMACAO },
    situacao: { $in: ["enviada", "enviando"] },
    createdAt: { $gte: new Date(Math.min(Date.now() - INTERVALO_DA_AVALIACAO_MS, fechada - ATENDIMENTO_RECENTE_MS)) },
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .select("tipo createdAt")
    .lean();
  const ultimaAvaliacaoEm = envios.find((e) => e.tipo === "pos_atendimento")?.createdAt ?? null;
  const ultimaAutomacaoEm = envios.find((e) => new Date(e.createdAt).getTime() < cliente)?.createdAt ?? null;
  const antes = ultimaAutomacaoEm
    ? await WaMessage.findOne({ conversationId: conv._id, direction: "inbound", createdAt: { $lt: ultimaAutomacaoEm } })
        .sort({ createdAt: -1 })
        .select("createdAt")
        .lean()
    : null;
  return { ultimaAvaliacaoEm, ultimaAutomacaoEm, clienteAntesDaAutomacaoEm: antes?.createdAt ?? null };
}

/** Registra o evento como pulado: o motivo fica no histórico e ele não volta. */
async function pular(
  ctx: Contexto,
  tipo: TipoAutomacao,
  chave: string,
  p: { tenantId: string | null; contactId: Types.ObjectId; conversationId: Types.ObjectId },
  motivo: string,
): Promise<void> {
  const envioId = await reservarEnvio({ ...p, tipo, chave });
  if (!envioId) return;
  await concluirEnvio(envioId, { situacao: "pulada", motivo });
  ctx.res.puladas++;
}

async function posAtendimento(ctx: Contexto, tenantId: string | null, cfg: AutomacaoConfig, loja: string) {
  const { ate, desde } = janelaDoPrazo(cfg.espera * HORA_MS);
  const convs = await WaConversation.find({
    tenantId,
    status: "closed",
    closedAt: { $lte: ate, $gte: desde },
    lastInboundAt: { $ne: null },
    outcome: { $nin: ["opt_out", "sem_interesse"] },
    // O encerramento grava closedAt = agora (wa/models/wa.ts): encerrar em
    // lote conversas paradas há meses não pode virar pedido de avaliação em
    // massa. Conta só quem escreveu perto do encerramento.
    $expr: { $gte: ["$lastInboundAt", { $subtract: ["$closedAt", ATENDIMENTO_RECENTE_MS] }] },
  })
    .sort({ closedAt: -1 })
    .limit(300)
    .lean();
  // Uma vez por atendimento: a chave é a última mensagem do cliente antes de
  // encerrar (encerrar de novo sem ele ter escrito não repete).
  const chave = (c: (typeof convs)[number]) => `${String(c._id)}:${new Date(c.lastInboundAt!).getTime()}`;
  const feitas = await chavesFeitas(tenantId, "pos_atendimento", convs.map(chave));
  for (const conv of convs) {
    if (esgotado(ctx)) return;
    if (feitas.has(chave(conv))) continue;
    // Ele voltou a escrever depois de encerrada: já é outro atendimento.
    if (new Date(conv.lastInboundAt!).getTime() > new Date(conv.closedAt!).getTime()) continue;
    // Reabrir com o "obrigado" e encerrar de novo não pede outra avaliação, e
    // responder a uma automação (aniversário, pós-venda) não é atendimento.
    const motivo = motivoParaNaoAvaliar({
      closedAt: conv.closedAt!,
      lastInboundAt: conv.lastInboundAt!,
      ...(await historicoDaAvaliacao(tenantId, conv)),
    });
    if (motivo) {
      await pular(ctx, "pos_atendimento", chave(conv), { tenantId, contactId: conv.contactId, conversationId: conv._id }, motivo);
      continue;
    }
    if (await deveAdiar(conv)) {
      ctx.res.adiadas++;
      continue;
    }
    const contato = await WaContact.findOne({ _id: conv.contactId, tenantId });
    if (!contato) continue;
    await disparar(ctx, "pos_atendimento", chave(conv), pedidoDe(tenantId, contato, conv, cfg, loja));
  }
}

async function posVenda(ctx: Contexto, tenantId: string | null, cfg: AutomacaoConfig, loja: string) {
  const { ate, desde } = janelaDoPrazo(cfg.espera * DIA_MS);
  const convs = await WaConversation.find({
    tenantId,
    stage: "ganho",
    stageChangedAt: { $lte: ate, $gte: desde },
  })
    .sort({ stageChangedAt: -1 })
    .limit(300)
    .lean();
  // Uma vez por venda: mudar de uma coluna de venda para outra não mexe na
  // data (wa/lib/conversation-stage.ts); reabrir e vender de novo, sim.
  const chave = (c: (typeof convs)[number]) => `${String(c._id)}:${new Date(c.stageChangedAt).getTime()}`;
  const feitas = await chavesFeitas(tenantId, "pos_venda", convs.map(chave));
  for (const conv of convs) {
    if (esgotado(ctx)) return;
    if (feitas.has(chave(conv))) continue;
    if (await deveAdiar(conv)) {
      ctx.res.adiadas++;
      continue;
    }
    const contato = await WaContact.findOne({ _id: conv.contactId, tenantId });
    if (!contato) continue;
    await disparar(ctx, "pos_venda", chave(conv), pedidoDe(tenantId, contato, conv, cfg, loja));
  }
}

async function aniversarios(ctx: Contexto, tenantId: string | null, cfg: AutomacaoConfig, loja: string) {
  const hoje = agoraEmBrasilia();
  if (hoje.hora < cfg.hora) return;
  const contatos = await WaContact.find({
    tenantId,
    optOut: { $ne: true },
    $or: diasDeAniversarioDe(hoje).map((d) => ({ birthMonth: d.mes, birthDay: d.dia })),
  })
    .limit(2000)
    .exec();
  const chave = (c: IWaContact) => `${String(c._id)}:${hoje.ano}`;
  const feitas = await chavesFeitas(tenantId, "aniversario", contatos.map(chave));
  for (const contato of contatos) {
    if (esgotado(ctx)) return;
    if (feitas.has(chave(contato))) continue;
    // Aniversário é no dia: não espera outra automática (as outras é que
    // esperam por ele).
    const conv = await WaConversation.findOne({ contactId: contato._id }).lean();
    await disparar(ctx, "aniversario", chave(contato), {
      ...pedidoDe(tenantId, contato, conv, cfg, loja),
      criarConversa: true,
    });
  }
}
