// Resultados da loja: o que a fila tem agora, o que entrou e virou venda no
// período, quanto a IA e a equipe demoram para responder, o que saiu no mês
// e, para o gestor, o desempenho de cada pessoa da equipe.
//
// De onde vem cada número:
//   - conversas e leads: wa_conversations (lastInboundAt, createdAt) e as
//     mensagens recebidas no período;
//   - visitas pedidas: a linha "Para a equipe (visita|test_drive)" que a IA da
//     loja grava ao pedir a visita (vale também para o histórico antigo);
//   - vendas: conversa na etapa ganho com stageChangedAt no período;
//   - 1ª resposta da IA: primeira mensagem do cliente no período até a
//     primeira fala da IA (até 1 h; mais que isso não foi resposta a ela);
//   - 1ª resposta da equipe e desempenho: wa_atendimentos (wa/lib/fila.ts),
//     que só existem a partir desta versão;
//   - autor das mensagens da equipe: `authorEmail` no WaMessage quando
//     existir; sem ele, o responsável da conversa (assignedTo/atendimento).

import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { WaCampaign, WaContact, WaConversation, WaMessage } from "@wa/models/wa";
import { WaChannel } from "@wa/models/channel";
import { WaAtendente, WaAtendimento } from "@wa/models/operacao";
import { operacaoDaLoja } from "@wa/lib/operacao";
import { estadoDoHorario } from "@wa/lib/horario";
import { statusEfetivo, type StatusAtendente } from "@wa/lib/equipe";
import { inicioDoDia, inicioDoMes, media, mediana, type Intervalo } from "@wa/lib/periodo";
import type { MembroDaEquipe } from "@wa/lib/central";

export const ROTULO_DO_CANAL: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
  sms: "SMS",
};

type Tempo = { mediana: number | null; media: number | null; n: number };

export type ResultadosDaLoja = {
  periodo: { id: string; rotulo: string; de: string; ate: string };
  agora: {
    fila: number;
    semResponsavel: number;
    slaViolado: number;
    comEquipe: number;
    comIa: number;
    aguardandoAbertura: number;
    slaMinutos: number;
    horario: { ativo: boolean; aberto: boolean; quandoVolta: string };
  };
  conversas: { hoje: number; semana: number; mes: number; periodo: number };
  leadsNovos: number;
  visitasPedidas: number;
  transferencias: number;
  vendas: number;
  resposta: { ia: Tempo; equipe: Tempo & { semResposta: number } };
  mensagensMes: { total: number; ia: number; equipe: number; automaticas: number; campanhas: number };
  campanhasMes: { total: number; enviadas: number; entregues: number; lidas: number; respondidas: number };
  porCanal: Array<{ canal: string; rotulo: string; conversas: number; leads: number; vendas: number }>;
};

export type PessoaDoDesempenho = {
  email: string;
  nome: string | null;
  papel: "gestor" | "atendente" | null;
  status: StatusAtendente;
  statusDesde: string | null;
  pausaMotivo: string | null;
  assumidas: number;
  resolvidas: number;
  vendas: number;
  respostaMedia: number | null;
  respostaN: number;
  /** Mensagens que a pessoa escreveu (só com `authorEmail` gravado). */
  mensagens: number | null;
  agora: Array<{ conversationId: string; cliente: string; status: string; desde: string | null; espera: boolean }>;
};

export type DesempenhoDaEquipe = {
  pessoas: PessoaDoDesempenho[];
  /** As mensagens da equipe já têm autor gravado? */
  comAutor: boolean;
};

const IA_RESPOSTA_MAX_S = 3600;
const VISITA = /^— Para a equipe \((visita|test_drive)\)/;
const TRANSFERENCIA = /^— (Para a equipe|Transferido para atendimento humano) \(/;

type ConvBase = { _id: mongoose.Types.ObjectId; channelId?: mongoose.Types.ObjectId | null };

/** Conversas da loja com movimento desde `desde`. Toda mensagem gravada mexe
 *  na conversa (lastMessageAt), e o `updatedAt` vem junto: filtrar por ele
 *  nunca perde mensagem do período e evita mandar ao banco os milhares de
 *  contatos de campanha que nunca responderam. */
async function conversasDaLoja(tenantId: string | null, desde: Date): Promise<ConvBase[]> {
  return (await WaConversation.find({ tenantId, updatedAt: { $gte: desde } })
    .select("_id channelId")
    .lean()) as ConvBase[];
}

async function canalPorConversa(tenantId: string | null, convs: ConvBase[]): Promise<Map<string, string>> {
  const canais = await WaChannel.find({ tenantId }).select("kind").lean();
  const kind = new Map(canais.map((c) => [String(c._id), c.kind as string]));
  // Conversa sem canal é do WhatsApp (anterior aos canais).
  return new Map(convs.map((c) => [String(c._id), (c.channelId && kind.get(String(c.channelId))) || "whatsapp"]));
}

function tempo(valores: number[]): Tempo {
  return { mediana: mediana(valores), media: media(valores), n: valores.length };
}

export async function resultadosDaLoja(tenantId: string | null, periodo: Intervalo): Promise<ResultadosDaLoja> {
  await dbConnect();
  const { de, ate } = periodo;
  const agora = new Date();
  const op = await operacaoDaLoja(tenantId);
  const mes = inicioDoMes(agora);
  const convs = await conversasDaLoja(tenantId, de < mes ? de : mes);
  const ids = convs.map((c) => c._id);
  const noPeriodo = { $gte: de, $lt: ate };
  const slaCorte = new Date(agora.getTime() - op.slaMinutos * 60_000);

  const [
    porStatus,
    fila,
    semResponsavel,
    slaViolado,
    aguardandoAbertura,
    hoje,
    semana,
    noMes,
    recebidas,
    leads,
    vendas,
    linhas,
    respostaIa,
    atendimentos,
    enviadas,
    campanhas,
  ] = await Promise.all([
    WaConversation.aggregate<{ _id: string; n: number }>([
      { $match: { tenantId } },
      { $group: { _id: "$status", n: { $sum: 1 } } },
    ]),
    WaConversation.countDocuments({ tenantId, status: "waiting_human" }),
    WaConversation.countDocuments({ tenantId, status: "waiting_human", assignedTo: null }),
    WaConversation.countDocuments({ tenantId, status: "waiting_human", waitingSince: { $lt: slaCorte } }),
    WaAtendimento.countDocuments({ tenantId, aberto: true, aguardandoAbertura: true }),
    // lastInboundAt depois do início = o cliente escreveu nessa janela (que
    // termina agora): conta exata sem varrer as mensagens.
    WaConversation.countDocuments({ tenantId, lastInboundAt: { $gte: inicioDoDia(agora) } }),
    WaConversation.countDocuments({ tenantId, lastInboundAt: { $gte: new Date(inicioDoDia(agora).getTime() - 6 * 86400_000) } }),
    WaConversation.countDocuments({ tenantId, lastInboundAt: { $gte: mes } }),
    WaMessage.aggregate<{ _id: mongoose.Types.ObjectId }>([
      { $match: { conversationId: { $in: ids }, direction: "inbound", createdAt: noPeriodo } },
      { $group: { _id: "$conversationId" } },
    ]),
    // Lead novo: conversa criada no período em que o cliente escreveu (o
    // disparo de campanha sem resposta não é lead).
    WaConversation.find({ tenantId, createdAt: noPeriodo, lastInboundAt: { $ne: null } }).select("_id").lean(),
    WaConversation.find({ tenantId, stage: "ganho", stageChangedAt: noPeriodo }).select("_id").lean(),
    WaMessage.find({
      conversationId: { $in: ids },
      direction: "outbound",
      sender: "system",
      createdAt: noPeriodo,
      content: { $regex: "^— (Para a equipe|Transferido para atendimento humano) \\(" },
    })
      .select("content")
      .lean(),
    WaMessage.aggregate<{ seg: number }>([
      { $match: { conversationId: { $in: ids }, direction: "inbound", createdAt: noPeriodo } },
      { $sort: { createdAt: 1 } },
      { $group: { _id: "$conversationId", primeira: { $first: "$createdAt" } } },
      {
        $lookup: {
          from: WaMessage.collection.name,
          let: { c: "$_id", t: "$primeira" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$conversationId", "$$c"] },
                    { $gt: ["$createdAt", "$$t"] },
                    { $eq: ["$direction", "outbound"] },
                    { $eq: ["$sender", "ai"] },
                  ],
                },
              },
            },
            { $sort: { createdAt: 1 } },
            { $limit: 1 },
            { $project: { createdAt: 1 } },
          ],
          as: "r",
        },
      },
      { $unwind: "$r" },
      { $project: { seg: { $divide: [{ $subtract: ["$r.createdAt", "$primeira"] }, 1000] } } },
    ]),
    WaAtendimento.find({ tenantId, abertoEm: noPeriodo, aguardandoAbertura: false })
      .select("abertoEm primeiraRespostaEm aberto")
      .lean(),
    WaMessage.aggregate<{ _id: { sender: string; template: boolean }; n: number }>([
      {
        $match: {
          conversationId: { $in: ids },
          direction: "outbound",
          createdAt: { $gte: mes },
          // Só o que saiu de verdade: as linhas internas não têm wamid.
          externalId: { $exists: true },
        },
      },
      { $group: { _id: { sender: "$sender", template: { $eq: ["$mediaType", "template"] } }, n: { $sum: 1 } } },
    ]),
    WaCampaign.find({ tenantId, $or: [{ createdAt: { $gte: mes } }, { lastRunAt: { $gte: mes } }] })
      .select("sent delivered read replied status")
      .lean(),
  ]);

  const status: Record<string, number> = {};
  for (const g of porStatus) status[String(g._id)] = g.n;
  const canal = await canalPorConversa(tenantId, convs);

  const respostasEquipe: number[] = [];
  let semResposta = 0;
  for (const a of atendimentos) {
    if (a.primeiraRespostaEm) {
      respostasEquipe.push(Math.max(0, (new Date(a.primeiraRespostaEm).getTime() - new Date(a.abertoEm).getTime()) / 1000));
    } else if (a.aberto) semResposta++;
  }

  const msg = { total: 0, ia: 0, equipe: 0, automaticas: 0, campanhas: 0 };
  for (const g of enviadas) {
    msg.total += g.n;
    if (g._id.sender === "ai") msg.ia += g.n;
    else if (g._id.sender === "human") msg.equipe += g.n;
    else if (g._id.template) msg.campanhas += g.n;
    else msg.automaticas += g.n;
  }

  const camp = { total: campanhas.length, enviadas: 0, entregues: 0, lidas: 0, respondidas: 0 };
  for (const c of campanhas) {
    camp.enviadas += c.sent ?? 0;
    camp.entregues += c.delivered ?? 0;
    camp.lidas += c.read ?? 0;
    camp.respondidas += c.replied ?? 0;
  }

  const canais = new Map<string, { conversas: number; leads: number; vendas: number }>();
  const somar = (id: mongoose.Types.ObjectId, campo: "conversas" | "leads" | "vendas") => {
    const k = canal.get(String(id)) ?? "whatsapp";
    const linha = canais.get(k) ?? { conversas: 0, leads: 0, vendas: 0 };
    linha[campo]++;
    canais.set(k, linha);
  };
  for (const r of recebidas) somar(r._id, "conversas");
  for (const l of leads) somar(l._id as mongoose.Types.ObjectId, "leads");
  for (const v of vendas) somar(v._id as mongoose.Types.ObjectId, "vendas");

  const horario = estadoDoHorario(op.horario, agora);
  return {
    periodo: { id: periodo.id, rotulo: periodo.rotulo, de: de.toISOString(), ate: ate.toISOString() },
    agora: {
      fila,
      semResponsavel,
      slaViolado,
      comEquipe: status.human_active ?? 0,
      comIa: status.ai_active ?? 0,
      aguardandoAbertura,
      slaMinutos: op.slaMinutos,
      horario: { ativo: op.horario.ativo, aberto: horario.aberto, quandoVolta: horario.quandoVolta },
    },
    conversas: { hoje, semana, mes: noMes, periodo: recebidas.length },
    leadsNovos: leads.length,
    visitasPedidas: linhas.filter((l) => VISITA.test(l.content ?? "")).length,
    transferencias: linhas.filter((l) => TRANSFERENCIA.test(l.content ?? "")).length,
    vendas: vendas.length,
    resposta: {
      ia: tempo(respostaIa.map((r) => r.seg).filter((s) => s >= 0 && s <= IA_RESPOSTA_MAX_S)),
      equipe: { ...tempo(respostasEquipe), semResposta },
    },
    mensagensMes: msg,
    campanhasMes: camp,
    porCanal: [...canais.entries()]
      .map(([k, v]) => ({ canal: k, rotulo: ROTULO_DO_CANAL[k] ?? k, ...v }))
      .sort((a, b) => b.conversas - a.conversas || a.rotulo.localeCompare(b.rotulo)),
  };
}

function nomeDoCliente(c: { name?: string | null; igUsername?: string | null; phone?: string } | undefined): string {
  if (!c) return "Cliente";
  if (c.name?.trim()) return c.name.trim();
  if (c.igUsername) return `@${c.igUsername}`;
  return c.phone?.startsWith("+") ? c.phone : "Cliente";
}

/** Desempenho por pessoa no período, mais o "agora" (quem atende o quê). */
export async function desempenhoDaEquipe(
  tenantId: string | null,
  periodo: Intervalo,
  equipe: MembroDaEquipe[],
): Promise<DesempenhoDaEquipe> {
  await dbConnect();
  const { de, ate } = periodo;
  const noPeriodo = { $gte: de, $lt: ate };
  const ids = (await conversasDaLoja(tenantId, de)).map((c) => c._id);

  const [status, atendimentos, resolvidos, vendas, abertas, autores] = await Promise.all([
    WaAtendente.find({ tenantId }).lean(),
    WaAtendimento.find({
      tenantId,
      $or: [{ atribuidoEm: noPeriodo }, { primeiraRespostaEm: noPeriodo }],
    })
      .select("atendente atribuidoEm abertoEm primeiraRespostaEm primeiraRespostaPor")
      .lean(),
    WaAtendimento.find({ tenantId, desfecho: "encerrada", encerradoEm: noPeriodo })
      .select("atendente encerradoPor")
      .lean(),
    WaConversation.find({ tenantId, stage: "ganho", stageChangedAt: noPeriodo }).select("assignedTo").lean(),
    WaConversation.find({ tenantId, status: { $in: ["waiting_human", "human_active"] }, assignedTo: { $ne: null } })
      .select("assignedTo status waitingSince contactId updatedAt")
      .sort({ waitingSince: 1 })
      .limit(500)
      .lean(),
    WaMessage.aggregate<{ _id: string; n: number }>([
      {
        $match: {
          conversationId: { $in: ids },
          direction: "outbound",
          sender: "human",
          createdAt: noPeriodo,
          authorEmail: { $exists: true, $ne: null },
        },
      },
      { $group: { _id: { $toLower: "$authorEmail" }, n: { $sum: 1 } } },
    ]),
  ]);

  const abertosAgora = await WaAtendimento.find({ tenantId, aberto: true, conversationId: { $in: abertas.map((c) => c._id) } })
    .select("conversationId atribuidoEm")
    .lean();
  const atribuidoEm = new Map(abertosAgora.map((a) => [String(a.conversationId), a.atribuidoEm]));
  const contatos = await WaContact.find({ _id: { $in: abertas.map((c) => c.contactId) } })
    .select("name igUsername phone")
    .lean();
  const contato = new Map(contatos.map((c) => [String(c._id), c]));

  type Linha = PessoaDoDesempenho & { _respostas: number[]; _assumidas: Set<string> };
  const pessoas = new Map<string, Linha>();
  const linha = (email: string | null | undefined): Linha | null => {
    const e = email?.toLowerCase().trim();
    if (!e) return null;
    let p = pessoas.get(e);
    if (!p) {
      const m = equipe.find((x) => x.email === e);
      p = {
        email: e,
        nome: m?.name ?? null,
        papel: m?.role ?? null,
        status: "ausente",
        statusDesde: null,
        pausaMotivo: null,
        assumidas: 0,
        resolvidas: 0,
        vendas: 0,
        respostaMedia: null,
        respostaN: 0,
        mensagens: null,
        agora: [],
        _respostas: [],
        _assumidas: new Set(),
      };
      pessoas.set(e, p);
    }
    return p;
  };

  for (const m of equipe) linha(m.email);
  for (const s of status) {
    const p = linha(s.email);
    if (!p) continue;
    p.nome = p.nome ?? s.nome ?? null;
    p.status = statusEfetivo(s);
    p.statusDesde = s.statusDesde ? new Date(s.statusDesde).toISOString() : null;
    p.pausaMotivo = p.status === "pausa" ? (s.pausaMotivo ?? null) : null;
  }
  for (const a of atendimentos) {
    if (a.atribuidoEm && a.atendente && a.atribuidoEm >= de && a.atribuidoEm < ate) {
      linha(a.atendente)?._assumidas.add(String(a._id));
    }
    if (a.primeiraRespostaEm && a.primeiraRespostaEm >= de && a.primeiraRespostaEm < ate) {
      const p = linha(a.primeiraRespostaPor ?? a.atendente);
      p?._respostas.push(Math.max(0, (a.primeiraRespostaEm.getTime() - a.abertoEm.getTime()) / 1000));
    }
  }
  for (const r of resolvidos) {
    const p = linha(r.encerradoPor ?? r.atendente);
    if (p) p.resolvidas++;
  }
  for (const v of vendas) {
    const p = linha(v.assignedTo);
    if (p) p.vendas++;
  }
  const comAutor = autores.length > 0;
  for (const a of autores) {
    const p = linha(a._id);
    if (p) p.mensagens = a.n;
  }
  for (const c of abertas) {
    const p = linha(c.assignedTo);
    if (!p) continue;
    const desde = atribuidoEm.get(String(c._id)) ?? (c.status === "waiting_human" ? c.waitingSince : c.updatedAt);
    p.agora.push({
      conversationId: String(c._id),
      cliente: nomeDoCliente(contato.get(String(c.contactId))),
      status: c.status,
      desde: desde ? new Date(desde).toISOString() : null,
      espera: c.status === "waiting_human",
    });
  }

  const ordem: Record<StatusAtendente, number> = { online: 0, pausa: 1, ausente: 2 };
  return {
    comAutor,
    pessoas: [...pessoas.values()]
      .map(({ _respostas, _assumidas, ...p }) => ({
        ...p,
        assumidas: _assumidas.size,
        respostaMedia: media(_respostas),
        respostaN: _respostas.length,
        mensagens: comAutor ? (p.mensagens ?? 0) : null,
      }))
      .sort(
        (a, b) =>
          ordem[a.status] - ordem[b.status] ||
          b.agora.length - a.agora.length ||
          b.assumidas - a.assumidas ||
          (a.nome ?? a.email).localeCompare(b.nome ?? b.email),
      ),
  };
}
