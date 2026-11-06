// API de Conversões da Meta para mensagens: lado do servidor. As regras
// (quando manda, o user_data de cada canal, o prazo e as tentativas) estão em
// wa/lib/conversoes-meta.ts; aqui ficam o banco e a chamada à Meta.
//
// O caminho:
//   1. O cartão entra numa coluna (wa/lib/conversation-stage.ts, a IA ao
//      encerrar, a chegada de uma conversa nova pelo anúncio). Se a coluna
//      tem evento, `registrarEventoDaColuna` grava um registro em
//      wa_eventos_meta: o índice único {tenantId, conversationId, evento}
//      garante que a mesma venda nunca sai duas vezes.
//   2. O envio sai logo, depois da resposta da rota (`after`), sem travar
//      quem moveu o cartão.
//   3. O que falhou volta pelo worker /api/wa/workers/conversoes-meta, com
//      tentativas limitadas e no máximo 7 dias depois (a Meta recusa
//      event_time mais velho).
// Sem configuração, sem clique do anúncio ou sem o id do canal, o registro
// fica "ignorado" com o motivo e não é tentado de novo.

import { after } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import RepasseVehicle from "@/models/RepasseVehicle";
import { WaContact, WaConversation, WaSettings } from "@wa/models/wa";
import { WaChannel } from "@wa/models/channel";
import { WaFunilColuna } from "@wa/models/funil";
import { WaAgendamento } from "@wa/models/agenda";
import { WaCarroDaConversa } from "@wa/models/carro-conversa";
import { WaConversoesMeta, WaEventoMeta, type IWaEventoMeta } from "@wa/models/conversoes-meta";
import { encrypt } from "@wa/lib/crypto";
import { safeDecrypt } from "@wa/lib/channels";
import { chatrunConfigured, getConnection } from "@wa/lib/chatrun";
import { GRAPH_VERSION } from "@wa/lib/meta";
import { colunaDoCartao, colunasPadrao, type Stage } from "@wa/lib/stages";
import {
  MAX_TENTATIVAS,
  MOTIVO,
  configCompleta,
  dentroDoPrazo,
  erroDefinitivo,
  eventoComValor,
  eventoDaColuna,
  montarPayloadMeta,
  montarUserData,
  motivoSemEnvio,
  normalizarConfig,
  proximaTentativa,
  valorEmReais,
  type CanalMeta,
  type ConfigEntrada,
  type EventoMeta,
  type EventoMetaPayload,
  type IdsDoCanal,
  type SituacaoEventoMeta,
  type UserDataMeta,
} from "@wa/lib/conversoes-meta";

const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
/** Quanto tempo a reserva segura o registro (o envio leva segundos). */
const RESERVA_MS = 2 * 60_000;
/** A conversa nasceu agora: o cartão acabou de entrar na primeira coluna. */
const CONVERSA_NOVA_MS = 5 * 60_000;

type Id = mongoose.Types.ObjectId | string;

function ehDuplicado(err: unknown): boolean {
  return (err as { code?: number })?.code === 11000;
}

// ── Configuração ─────────────────────────────────────────────

export type ConfigPublica = {
  ativo: boolean;
  datasetId: string;
  /** Há token salvo. O token em si nunca sai do servidor. */
  temToken: boolean;
  testEventCode: string;
  valorPadrao: number | null;
  ultimoTeste: { em: string; ok: boolean; mensagem: string } | null;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
};

export async function configDoDono(tenantId: string | null): Promise<ConfigPublica> {
  await dbConnect();
  const c = await WaConversoesMeta.findOne({ tenantId }).lean();
  return {
    ativo: Boolean(c?.ativo),
    datasetId: c?.datasetId ?? "",
    temToken: Boolean(c?.token),
    testEventCode: c?.testEventCode ?? "",
    valorPadrao: c?.valorPadrao ?? null,
    ultimoTeste: c?.ultimoTeste
      ? { em: new Date(c.ultimoTeste.em).toISOString(), ok: Boolean(c.ultimoTeste.ok), mensagem: c.ultimoTeste.mensagem ?? "" }
      : null,
    atualizadoEm: c?.updatedAt ? new Date(c.updatedAt).toISOString() : null,
    atualizadoPor: c?.atualizadoPor ?? null,
  };
}

export class ConversoesMetaError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Grava o formulário. Token em branco mantém o salvo; o novo é criptografado. */
export async function salvarConfig(
  tenantId: string | null,
  input: ConfigEntrada,
  por: string,
): Promise<ConfigPublica> {
  await dbConnect();
  const atual = await WaConversoesMeta.findOne({ tenantId }).select("token").lean();
  const r = normalizarConfig(input, Boolean(atual?.token));
  if (r.config === null) throw new ConversoesMetaError(400, r.erro);
  const config = r.config;
  await WaConversoesMeta.updateOne(
    { tenantId },
    {
      $set: {
        ativo: config.ativo,
        datasetId: config.datasetId || null,
        testEventCode: config.testEventCode,
        valorPadrao: config.valorPadrao,
        atualizadoPor: por,
        ...(config.token ? { token: encrypt(config.token) } : {}),
      },
      $setOnInsert: { tenantId },
    },
    { upsert: true },
  );
  // Token trocado (ou religado): o que estava esperando a próxima tentativa
  // sai na próxima rodada do worker, sem esperar a espera inteira.
  if (config.ativo) {
    await WaEventoMeta.updateMany({ tenantId, status: "pendente" }, { $set: { proximaEm: new Date() } });
  }
  return configDoDono(tenantId);
}

// ── Chamada à Meta ───────────────────────────────────────────

type RespostaMeta =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; code: number | null; mensagem: string; fbtraceId: string | null };

async function graph(path: string, token: string, init?: RequestInit): Promise<RespostaMeta> {
  try {
    const res = await fetch(`${GRAPH}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok) return { ok: true, body };
    const e = (body.error ?? {}) as { message?: string; error_user_msg?: string; code?: number; fbtrace_id?: string };
    return {
      ok: false,
      status: res.status,
      code: typeof e.code === "number" ? e.code : null,
      mensagem: traduzirErro(e.code ?? null, e.error_user_msg || e.message || `A Meta respondeu ${res.status}.`),
      fbtraceId: e.fbtrace_id ?? null,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      code: null,
      mensagem: err instanceof Error && err.name === "TimeoutError" ? "A Meta não respondeu a tempo." : "Sem resposta da Meta.",
      fbtraceId: null,
    };
  }
}

/** Os erros que o lojista resolve sozinho, em português; o resto vai como veio. */
function traduzirErro(code: number | null, original: string): string {
  if (code === 190) return "Token inválido ou vencido. Gere um novo no Gerenciador de Eventos.";
  if (code === 10 || code === 200) return `O token não tem permissão neste conjunto de dados. (${original})`;
  if (code === 803) return "Conjunto de dados não encontrado. Confira o ID no Gerenciador de Eventos.";
  return original.slice(0, 300);
}

export async function postarEventos(datasetId: string, token: string, payload: EventoMetaPayload): Promise<RespostaMeta> {
  return graph(`/${encodeURIComponent(datasetId)}/events`, token, { method: "POST", body: JSON.stringify(payload) });
}

// ── Identificadores do canal ─────────────────────────────────

const CAMPOS_DO_CANAL = "kind tenantId provider chatrunConnectionId wabaId fbPageId igUserId status";

type CanalLean = {
  kind: string;
  provider?: string | null;
  chatrunConnectionId?: string | null;
  wabaId?: string | null;
  fbPageId?: string | null;
  igUserId?: string | null;
};

/**
 * A conta do canal por onde o anúncio trouxe a pessoa: o WABA do número
 * (pelo gateway vem da conexão; no WhatsApp direto do CNV, do canal, do
 * WaSettings antigo ou do META_WABA_ID), a Página do Messenger ou a conta do
 * Instagram. A conversa que trocou de canal (o mesmo telefone escreveu por
 * SMS) usa o canal daquele tipo do dono.
 */
export async function idsDoCanal(
  conv: { tenantId?: string | null; channelId?: unknown },
  canal: CanalMeta,
): Promise<IdsDoCanal> {
  await dbConnect();
  const tenantId = conv.tenantId ?? null;
  let doc: CanalLean | null = null;
  if (conv.channelId) {
    const d = await WaChannel.findById(conv.channelId).select(CAMPOS_DO_CANAL).lean<CanalLean>();
    if (d && d.kind === canal) doc = d;
  }
  if (!doc) {
    doc = await WaChannel.findOne({ tenantId, kind: canal, status: { $ne: "disconnected" } })
      .sort({ createdAt: 1 })
      .select(CAMPOS_DO_CANAL)
      .lean<CanalLean>();
  }

  if (canal === "messenger") return { pageId: doc?.fbPageId || null };
  if (canal === "instagram") return { igAccountId: doc?.igUserId || null };

  let wabaId = doc?.wabaId || null;
  if (!wabaId && doc?.provider === "chatrun" && doc.chatrunConnectionId && chatrunConfigured()) {
    // Canal conectado antes do gateway mandar o WABA: pergunta à conexão.
    wabaId = (await getConnection(doc.chatrunConnectionId).catch(() => null))?.waba_id || null;
  }
  if (!wabaId && tenantId === null) {
    const s = await WaSettings.findOne().select("wabaId").lean();
    wabaId = s?.wabaId || process.env.META_WABA_ID || null;
  }
  return { wabaId };
}

// ── Valor da venda ───────────────────────────────────────────

/**
 * O preço do carro ligado à conversa: o último que a equipe ou a IA mandou
 * (wa_carros_conversa) ou, sem envio, o carro do pátio do agendamento de
 * visita/test drive mais recente. Sem carro, o valor padrão da configuração;
 * sem ele, 0. Sempre em reais.
 */
export async function valorDaVenda(
  tenantId: string | null,
  conversationId: Id,
  valorPadrao?: number | null,
): Promise<number> {
  await dbConnect();
  const carro = await WaCarroDaConversa.findOne({ conversationId, tenantId }).select("preco").lean();
  if (carro && valorEmReais(carro.preco) > 0) return valorEmReais(carro.preco);
  const visita = await WaAgendamento.findOne({ conversationId, tenantId, veiculoId: { $ne: null } })
    .sort({ inicio: -1 })
    .select("veiculoId")
    .lean();
  if (visita?.veiculoId) {
    const v = await RepasseVehicle.findById(visita.veiculoId).select("preco").lean<{ preco?: number }>();
    if (v && valorEmReais(v.preco) > 0) return valorEmReais(v.preco);
  }
  return valorEmReais(valorPadrao ?? 0);
}

/** Grava o carro que acabou de ir para o cliente como o carro da conversa.
 *  Best-effort: nunca derruba o envio. */
export async function ligarCarroNaConversa(p: {
  conversationId: string;
  oferta: { ref: string; titulo?: string | null; preco?: number | null; origem?: string | null };
  por: "human" | "ai";
}): Promise<void> {
  try {
    await dbConnect();
    const conv = await WaConversation.findById(p.conversationId).select("tenantId").lean();
    if (!conv) return;
    await WaCarroDaConversa.updateOne(
      { conversationId: conv._id },
      {
        $set: {
          tenantId: conv.tenantId ?? null,
          ref: p.oferta.ref,
          titulo: p.oferta.titulo ?? null,
          origem: p.oferta.origem ?? null,
          preco: valorEmReais(p.oferta.preco),
          por: p.por,
          em: new Date(),
        },
      },
      { upsert: true },
    );
  } catch (err) {
    console.warn("[conversoes-meta] carro da conversa não gravado:", err instanceof Error ? err.message : err);
  }
}

// ── Registro (o cartão entrou numa coluna) ───────────────────

type ColunaParaEvento = {
  id: string;
  name: string;
  systemKey: Stage | null;
  type: "open" | "won" | "lost";
  eventoMeta?: EventoMeta | null;
};

/** As colunas do dono, sem semear: dono que nunca abriu o quadro segue as
 *  padrão (as mesmas que o quadro criaria). */
async function colunasParaEvento(tenantId: string | null): Promise<ColunaParaEvento[]> {
  const docs = await WaFunilColuna.find({ tenantId })
    .sort({ position: 1, createdAt: 1 })
    .select("name systemKey type eventoMeta")
    .lean();
  if (docs.length === 0) {
    return colunasPadrao(tenantId !== null).map((c) => ({
      id: `padrao:${c.systemKey}`,
      name: c.name,
      systemKey: c.systemKey,
      type: c.type,
      eventoMeta: c.eventoMeta,
    }));
  }
  return docs.map((d) => ({
    id: String(d._id),
    name: d.name,
    systemKey: (d.systemKey ?? null) as Stage | null,
    type: d.type,
    ...(d.eventoMeta !== undefined ? { eventoMeta: d.eventoMeta ?? null } : {}),
  }));
}

/**
 * O cartão desta conversa acabou de entrar numa coluna: se a coluna manda
 * evento para a Meta, grava na fila (uma vez por conversa e evento) e tenta
 * mandar logo. Nunca lança: o evento é um extra e não pode travar quem
 * moveu o cartão. Devolve o id do registro novo (null = nada a registrar).
 *
 * `soConversaNova`: chamada pela chegada do anúncio. Só vale para a conversa
 * que acabou de nascer (o cartão entrou agora na primeira coluna); a
 * conversa antiga que recebe um clique novo não reenvia a coluna em que já
 * estava (a venda do mês passado não vira venda do anúncio de hoje).
 */
export async function registrarEventoDaColuna(p: {
  conversationId: Id;
  por?: string | null;
  soConversaNova?: boolean;
}): Promise<string | null> {
  try {
    await dbConnect();
    const conv = await WaConversation.findById(p.conversationId)
      .select("tenantId contactId channelId stage stageId origem createdAt")
      .lean();
    if (!conv) return null;
    if (p.soConversaNova && Date.now() - new Date(conv.createdAt).getTime() > CONVERSA_NOVA_MS) return null;
    const tenantId = conv.tenantId ?? null;

    const colunas = await colunasParaEvento(tenantId);
    const coluna = colunaDoCartao({ stage: conv.stage, stageId: conv.stageId ? String(conv.stageId) : null }, colunas);
    const evento = eventoDaColuna(coluna);
    if (!coluna || !evento) return null;
    // O índice único garante; a leitura só poupa o trabalho de montar.
    if (await WaEventoMeta.exists({ tenantId, conversationId: conv._id, evento })) return null;

    const config = await WaConversoesMeta.findOne({ tenantId }).select("ativo datasetId token valorPadrao").lean();
    const origem = conv.origem ?? null;
    const motivo = motivoSemEnvio({ config, origem });
    const valor = eventoComValor(evento) && !motivo ? await valorDaVenda(tenantId, conv._id, config?.valorPadrao) : null;
    const agora = new Date();

    let id: string;
    try {
      const doc = await WaEventoMeta.create({
        tenantId,
        conversationId: conv._id,
        contactId: conv.contactId ?? null,
        evento,
        canal: origem?.canal ?? null,
        idOrigem: origem?.idOrigem ?? null,
        colunaId: mongoose.isValidObjectId(coluna.id) ? coluna.id : null,
        colunaNome: coluna.name,
        por: p.por ?? null,
        valor,
        moeda: "BRL",
        quando: agora,
        status: motivo ? "ignorado" : "pendente",
        motivo,
        tentativas: 0,
        proximaEm: motivo ? null : agora,
      });
      id = String(doc._id);
    } catch (err) {
      // Duas mudanças simultâneas: fica o primeiro registro.
      if (ehDuplicado(err)) return null;
      throw err;
    }
    if (!motivo) agendarEnvio(id);
    return id;
  } catch (err) {
    console.error(
      `[conversoes-meta] evento da coluna não registrado (${String(p.conversationId)}):`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/** Manda depois da resposta (a rota não espera a Meta). Fora de uma
 *  requisição (teste, script) o after não existe: roda solto. */
function agendarEnvio(id: string): void {
  const enviar = () =>
    enviarEventoMeta(id)
      .then(() => undefined)
      .catch((err) => console.error("[conversoes-meta] envio falhou:", err instanceof Error ? err.message : err));
  try {
    after(enviar);
  } catch {
    void enviar();
  }
}

// ── Envio ────────────────────────────────────────────────────

/** Registro que pode ser pego agora: na fila e vencido, ou com a reserva
 *  presa (quem reservou caiu no meio). */
function disponivel(agora: Date): mongoose.QueryFilter<IWaEventoMeta> {
  return {
    $or: [
      { status: "pendente", proximaEm: { $lte: agora } },
      { status: "enviando", reservadoAte: { $lt: agora } },
    ],
  };
}

function reserva(agora: Date) {
  return { $set: { status: "enviando", reservadoAte: new Date(agora.getTime() + RESERVA_MS) }, $inc: { tentativas: 1 } };
}

/** Tenta mandar um registro (o envio na hora). null = outro já pegou. */
export async function enviarEventoMeta(id: Id, agora = new Date()): Promise<SituacaoEventoMeta | null> {
  await dbConnect();
  const ev = await WaEventoMeta.findOneAndUpdate({ _id: id, ...disponivel(agora) }, reserva(agora), { new: true }).lean();
  if (!ev) return null;
  return processarReservado(ev as unknown as IWaEventoMeta, agora);
}

type Fim = Partial<
  Pick<IWaEventoMeta, "status" | "motivo" | "proximaEm" | "enviadoEm" | "ultimoErro" | "fbtraceId" | "canal">
>;

async function processarReservado(ev: IWaEventoMeta, agora: Date): Promise<SituacaoEventoMeta> {
  const fim = async (set: Fim): Promise<SituacaoEventoMeta> => {
    await WaEventoMeta.updateOne({ _id: ev._id, status: "enviando" }, { $set: { ...set, reservadoAte: null } });
    return set.status as SituacaoEventoMeta;
  };
  if (!dentroDoPrazo(new Date(ev.quando), agora.getTime())) return fim({ status: "falhou", motivo: MOTIVO.prazo });

  const config = await WaConversoesMeta.findOne({ tenantId: ev.tenantId ?? null }).lean();
  const token = safeDecrypt(config?.token);
  // Desligaram (ou apagaram) depois que o evento entrou na fila.
  if (!configCompleta(config) || !token) return fim({ status: "ignorado", motivo: MOTIVO.semConfiguracao });

  const conv = await WaConversation.findById(ev.conversationId).select("tenantId channelId contactId origem").lean();
  if (!conv) return fim({ status: "ignorado", motivo: "conversa apagada" });
  const origem = conv.origem ?? null;
  const motivo = motivoSemEnvio({ config, origem });
  if (motivo || !origem) return fim({ status: "ignorado", motivo: motivo ?? MOTIVO.semAnuncio });

  const contato = await WaContact.findById(conv.contactId).select("phone fbPsid igUserId").lean();
  const ids = await idsDoCanal(conv, origem.canal);
  const ud = montarUserData({ origem, contato: contato ?? {}, ids });
  if (!ud.ok) return fim({ status: "ignorado", motivo: ud.motivo, canal: origem.canal });

  const payload = montarPayloadMeta({
    evento: ev.evento,
    quando: new Date(ev.quando),
    canal: origem.canal,
    userData: ud.userData,
    valor: ev.valor,
    eventId: String(ev._id),
  });
  const r = await postarEventos(config!.datasetId!, token, payload);
  if (r.ok) {
    return fim({
      status: "enviado",
      enviadoEm: new Date(),
      ultimoErro: null,
      motivo: null,
      canal: origem.canal,
      fbtraceId: typeof r.body.fbtrace_id === "string" ? r.body.fbtrace_id : null,
    });
  }
  const definitivo = erroDefinitivo(r.status, r.code);
  const prox = definitivo ? null : proximaTentativa(ev.tentativas, new Date(ev.quando), agora.getTime());
  if (prox) return fim({ status: "pendente", proximaEm: prox, ultimoErro: r.mensagem, fbtraceId: r.fbtraceId });
  return fim({
    status: "falhou",
    ultimoErro: r.mensagem,
    fbtraceId: r.fbtraceId,
    motivo: definitivo ? "recusado pela Meta" : ev.tentativas >= MAX_TENTATIVAS ? MOTIVO.tentativas : MOTIVO.prazo,
  });
}

export type RodadaConversoes = { processados: number; enviados: number; reagendados: number; falharam: number; ignorados: number };

/** Worker: reenvia o que falhou (e pega o que ficou preso), um por vez com
 *  reserva atômica, até o teto da rodada. */
export async function reenviarEventosMeta(opts: { max?: number; prazoMs?: number } = {}): Promise<RodadaConversoes> {
  await dbConnect();
  const max = opts.max ?? 50;
  const prazoMs = opts.prazoMs ?? 50_000;
  const inicio = Date.now();
  const out: RodadaConversoes = { processados: 0, enviados: 0, reagendados: 0, falharam: 0, ignorados: 0 };
  while (out.processados < max && Date.now() - inicio < prazoMs) {
    const agora = new Date();
    const ev = await WaEventoMeta.findOneAndUpdate(disponivel(agora), reserva(agora), {
      new: true,
      sort: { proximaEm: 1 },
    }).lean();
    if (!ev) break;
    out.processados++;
    const s = await processarReservado(ev as unknown as IWaEventoMeta, agora).catch(async (err) => {
      // Erro nosso (banco, código): devolve para a fila em vez de prender.
      console.error("[conversoes-meta] worker:", err instanceof Error ? err.message : err);
      const prox = proximaTentativa(ev.tentativas, new Date(ev.quando), agora.getTime());
      await WaEventoMeta.updateOne(
        { _id: ev._id, status: "enviando" },
        {
          $set: prox
            ? { status: "pendente", proximaEm: prox, reservadoAte: null }
            : { status: "falhou", motivo: MOTIVO.tentativas, reservadoAte: null },
        },
      );
      return (prox ? "pendente" : "falhou") as SituacaoEventoMeta;
    });
    if (s === "enviado") out.enviados++;
    else if (s === "pendente") out.reagendados++;
    else if (s === "falhou") out.falharam++;
    else out.ignorados++;
  }
  return out;
}

// ── Testar conexão ───────────────────────────────────────────

export type ResultadoTeste = {
  ok: boolean;
  mensagem: string;
  dataset?: { id: string; name: string | null };
  /** Evento de teste (só com o código de teste). */
  teste?: { enviado: boolean; mensagem: string };
};

/** A conversa mais recente do dono que veio de anúncio e tem tudo para
 *  montar o user_data: o evento de teste sai igual a um de verdade. */
async function amostraParaTeste(
  tenantId: string | null,
): Promise<{ canal: CanalMeta; userData: UserDataMeta; conversationId: unknown } | null> {
  const convs = await WaConversation.find({ tenantId, origem: { $ne: null } })
    .sort({ "origem.em": -1 })
    .limit(15)
    .select("tenantId channelId contactId origem")
    .lean();
  for (const c of convs) {
    if (!c.origem || motivoSemEnvio({ config: { ativo: true, datasetId: "x", token: "x" }, origem: c.origem })) continue;
    const contato = await WaContact.findById(c.contactId).select("phone fbPsid igUserId").lean();
    const ud = montarUserData({ origem: c.origem, contato: contato ?? {}, ids: await idsDoCanal(c, c.origem.canal) });
    if (ud.ok) return { canal: c.origem.canal, userData: ud.userData, conversationId: c._id };
  }
  return null;
}

/**
 * Confere o token e o conjunto de dados na Meta (GET no dataset) e, com o
 * código de teste, manda um evento de teste (aparece em Testar eventos e
 * não conta para o anúncio). Usa o que está no formulário; o que vier em
 * branco sai do que está salvo.
 */
export async function testarConexao(
  tenantId: string | null,
  input: { datasetId?: unknown; token?: unknown; testEventCode?: unknown },
): Promise<ResultadoTeste> {
  await dbConnect();
  const salvo = await WaConversoesMeta.findOne({ tenantId }).lean();
  const datasetId = (typeof input.datasetId === "string" ? input.datasetId.replace(/\s+/g, "") : "") || salvo?.datasetId || "";
  const token = (typeof input.token === "string" ? input.token.trim() : "") || safeDecrypt(salvo?.token) || "";
  const codigo =
    typeof input.testEventCode === "string" ? input.testEventCode.trim() : (salvo?.testEventCode ?? "").trim();

  let resultado: ResultadoTeste;
  if (!/^\d{6,30}$/.test(datasetId) || !token) {
    resultado = { ok: false, mensagem: "Informe o ID do conjunto de dados e o token de acesso." };
  } else {
    const r = await graph(`/${datasetId}?fields=id,name`, token);
    if (!r.ok) {
      resultado = { ok: false, mensagem: r.mensagem };
    } else {
      const dataset = { id: String(r.body.id ?? datasetId), name: typeof r.body.name === "string" ? r.body.name : null };
      resultado = {
        ok: true,
        mensagem: `Conectado ao conjunto de dados ${dataset.name ? `"${dataset.name}"` : dataset.id}.`,
        dataset,
      };
      if (codigo) resultado.teste = await eventoDeTeste(tenantId, datasetId, token, codigo, salvo?.valorPadrao ?? null);
    }
  }

  if (salvo) {
    const mensagem = resultado.teste ? `${resultado.mensagem} ${resultado.teste.mensagem}` : resultado.mensagem;
    await WaConversoesMeta.updateOne(
      { _id: salvo._id },
      { $set: { ultimoTeste: { em: new Date(), ok: resultado.ok && resultado.teste?.enviado !== false, mensagem } } },
    );
  }
  return resultado;
}

async function eventoDeTeste(
  tenantId: string | null,
  datasetId: string,
  token: string,
  codigo: string,
  valorPadrao: number | null,
): Promise<NonNullable<ResultadoTeste["teste"]>> {
  if (!/^[A-Za-z0-9_-]{2,40}$/.test(codigo)) return { enviado: false, mensagem: "Código de teste inválido." };
  const amostra = await amostraParaTeste(tenantId);
  if (!amostra) {
    return {
      enviado: false,
      mensagem:
        "O evento de teste precisa de uma conversa que veio de anúncio (no WhatsApp, com o clique do anúncio). Assim que chegar a primeira, teste de novo.",
    };
  }
  const valor = await valorDaVenda(tenantId, amostra.conversationId as Id, valorPadrao);
  const payload = montarPayloadMeta({
    evento: "Purchase",
    quando: new Date(),
    canal: amostra.canal,
    userData: amostra.userData,
    valor,
    testEventCode: codigo,
  });
  const r = await postarEventos(datasetId, token, payload);
  if (!r.ok) return { enviado: false, mensagem: `O evento de teste foi recusado: ${r.mensagem}` };
  return {
    enviado: true,
    mensagem: `Evento de teste (Purchase) enviado. Confira em Testar eventos, código ${codigo}.`,
  };
}

// ── Lista da tela ────────────────────────────────────────────

export type EventoMetaLinha = {
  id: string;
  conversationId: string;
  contato: string;
  evento: EventoMeta;
  canal: CanalMeta | null;
  colunaNome: string | null;
  valor: number | null;
  status: SituacaoEventoMeta;
  motivo: string | null;
  ultimoErro: string | null;
  tentativas: number;
  quando: string;
  enviadoEm: string | null;
};

const nomeDoContato = (c: { name?: string | null; igUsername?: string | null; phone?: string | null } | undefined): string => {
  if (!c) return "Contato apagado";
  if (c.name?.trim()) return c.name.trim();
  if (c.igUsername) return `@${c.igUsername}`;
  if (c.phone && !/^(ig|fb):/.test(c.phone)) return c.phone;
  return "Sem nome";
};

export async function eventosRecentes(tenantId: string | null, limite = 30): Promise<EventoMetaLinha[]> {
  await dbConnect();
  const evs = await WaEventoMeta.find({ tenantId }).sort({ createdAt: -1 }).limit(limite).lean();
  const ids = [...new Set(evs.map((e) => (e.contactId ? String(e.contactId) : null)).filter(Boolean))] as string[];
  const contatos = ids.length
    ? await WaContact.find({ _id: { $in: ids }, tenantId }).select("name igUsername phone").lean()
    : [];
  const porId = new Map(contatos.map((c) => [String(c._id), c]));
  return evs.map((e) => ({
    id: String(e._id),
    conversationId: String(e.conversationId),
    contato: nomeDoContato(e.contactId ? porId.get(String(e.contactId)) : undefined),
    evento: e.evento,
    canal: (e.canal ?? null) as CanalMeta | null,
    colunaNome: e.colunaNome ?? null,
    valor: e.valor ?? null,
    status: e.status,
    motivo: e.motivo ?? null,
    ultimoErro: e.ultimoErro ?? null,
    tentativas: e.tentativas ?? 0,
    quando: new Date(e.quando).toISOString(),
    enviadoEm: e.enviadoEm ? new Date(e.enviadoEm).toISOString() : null,
  }));
}
