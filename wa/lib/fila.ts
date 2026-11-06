// Fila da equipe: o que acontece quando uma conversa passa para os humanos.
//
// Cada passagem pela equipe vira um atendimento (WaAtendimento): quando
// entrou, quem pegou, quando respondeu e como terminou. Ao entrar na fila:
//   1. com a loja fechada (horário da Configuração), espera a abertura: a
//      distribuição, o aviso e o SLA começam no próximo expediente;
//   2. com a distribuição em rodízio, vai para o próximo Online (o SLA da
//      conversa passa a contar para ele, porque ela cai em "Minhas");
//   3. avisa por push o responsável ou, sem responsável, quem está Online.
//
// Os ganchos (worker da IA, inbound, ações da Central) chamam daqui para a
// resposta ser imediata; a varredura de 1 minuto (workers/equipe) pega o
// que entrou por um caminho sem gancho e abre o expediente das lojas.
// Nada daqui pode derrubar o atendimento: quem chama usa `.catch`.

import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { WaContact, WaConversation, WaMessage, type IWaConversation } from "@wa/models/wa";
import { WaAtendente, WaAtendimento, WaConversaOperacao, type IWaAtendimento } from "@wa/models/operacao";
import { operacaoDaLoja, type OperacaoDaLoja } from "@wa/lib/operacao";
import { avisoDeTransferenciaFora, estadoDoHorario, textoForaDoHorario } from "@wa/lib/horario";
import { SINAL_MAX_MS, escolherNoRodizio } from "@wa/lib/equipe";
import { enviarPush, urlDaConversa } from "@wa/lib/push";
import { emailsDaEquipe } from "@wa/lib/equipe-loja";
import { channelForConversation } from "@wa/lib/channels";
import { podeMandarLivre, sendAndLogText } from "@wa/lib/send";
import { emitEvent } from "@wa/lib/webhooks";

type Conversa = Pick<
  IWaConversation,
  "tenantId" | "status" | "assignedTo" | "waitingSince" | "transferReason" | "contactId" | "channelId" | "lastInboundAt"
> & { _id: mongoose.Types.ObjectId };

type Atendimento = Pick<
  IWaAtendimento,
  | "tenantId"
  | "abertoEm"
  | "atendente"
  | "distribuida"
  | "primeiraRespostaEm"
  | "aguardandoAbertura"
  | "filaAvisadaEm"
  | "transferencias"
> & { _id: mongoose.Types.ObjectId; conversationId: mongoose.Types.ObjectId };

const CAMPOS_DA_CONVERSA =
  "_id tenantId status assignedTo waitingSince transferReason contactId channelId lastInboundAt";

/** Resposta de gente há menos que isso: a conversa está sendo atendida, e o
 *  aviso de fora do horário não sai (mensagemParaEquipe). */
const CONVERSA_ATIVA_MS = 2 * 3600_000;

/** Conversa que entrou na fila há mais que isso, achada pela varredura, não
 *  gera aviso: na primeira rodada depois do deploy a fila antiga não pode
 *  virar uma avalanche de push. */
const AVISO_RECENTE_MS = 15 * 60_000;

function comEquipe(status: string | null | undefined): boolean {
  return status === "waiting_human" || status === "human_active";
}

async function lerConversa(conversationId: string | mongoose.Types.ObjectId): Promise<Conversa | null> {
  if (!mongoose.isValidObjectId(conversationId)) return null;
  return (await WaConversation.findById(conversationId).select(CAMPOS_DA_CONVERSA).lean()) as Conversa | null;
}

// ── Registro do atendimento ──────────────────────────────────

/** Primeira resposta de gente depois de `desde` (a Central grava sender "human"). */
async function primeiraResposta(
  conversationId: mongoose.Types.ObjectId,
  desde: Date,
): Promise<{ em: Date; por: string | null } | null> {
  const m = await WaMessage.findOne({
    conversationId,
    direction: "outbound",
    sender: "human",
    createdAt: { $gte: desde },
  })
    .sort({ createdAt: 1 })
    // `authorEmail`: quem escreveu, quando a Central passar a gravar. Até lá
    // vale o responsável da conversa.
    .select("createdAt authorEmail")
    .lean();
  if (!m) return null;
  const autor = (m as { authorEmail?: string | null }).authorEmail;
  return { em: m.createdAt, por: autor ? autor.toLowerCase() : null };
}

/**
 * Deixa o registro igual ao estado da conversa: abre o atendimento quando ela
 * está com a equipe, troca o responsável (contando transferência), anota a
 * primeira resposta e fecha quando ela volta para a IA ou é encerrada.
 */
export async function sincronizarAtendimento(
  conv: Conversa,
  opts: { por?: string | null } = {},
): Promise<Atendimento | null> {
  const agora = new Date();
  const aberto = (await WaAtendimento.findOne({ conversationId: conv._id, aberto: true }).lean()) as Atendimento | null;
  const responsavel = conv.assignedTo?.toLowerCase() ?? null;

  if (!comEquipe(conv.status)) {
    if (!aberto) return null;
    const resposta = aberto.primeiraRespostaEm ? null : await primeiraResposta(conv._id, aberto.abertoEm);
    await WaAtendimento.updateOne(
      { _id: aberto._id, aberto: true },
      {
        aberto: false,
        encerradoEm: agora,
        desfecho: conv.status === "closed" ? "encerrada" : "devolvida_ia",
        encerradoPor: opts.por ?? null,
        aguardandoAbertura: false,
        ...(resposta
          ? { primeiraRespostaEm: resposta.em, primeiraRespostaPor: resposta.por ?? aberto.atendente ?? null }
          : {}),
      },
    );
    return null;
  }

  if (!aberto) {
    try {
      const doc = await WaAtendimento.create({
        tenantId: conv.tenantId ?? null,
        conversationId: conv._id,
        aberto: true,
        distribuida: false,
        transferencias: 0,
        aguardandoAbertura: false,
        filaAvisadaEm: null,
        primeiraRespostaEm: null,
        // Humano que assumiu direto (sem passar pela fila) abre agora.
        abertoEm: conv.status === "waiting_human" && conv.waitingSince ? conv.waitingSince : agora,
        motivo: conv.transferReason ?? null,
        atendente: responsavel,
        atribuidoEm: responsavel ? agora : null,
      });
      return ((doc as { toObject?: () => unknown }).toObject?.() ?? doc) as unknown as Atendimento;
    } catch (err) {
      // Worker e varredura abriram juntos: fica o primeiro.
      if ((err as { code?: number })?.code !== 11000) throw err;
      return (await WaAtendimento.findOne({ conversationId: conv._id, aberto: true }).lean()) as Atendimento | null;
    }
  }

  const set: Record<string, unknown> = {};
  let transferencias = 0;
  if ((aberto.atendente ?? null) !== responsavel) {
    set.atendente = responsavel;
    if (responsavel) set.atribuidoEm = agora;
    // Dono trocado na mão deixa de ser "distribuída"; de uma pessoa para
    // outra conta como transferência.
    set.distribuida = false;
    if (aberto.atendente && responsavel) transferencias = 1;
  }
  if (!aberto.primeiraRespostaEm && conv.status === "human_active") {
    const r = await primeiraResposta(conv._id, aberto.abertoEm);
    if (r) {
      set.primeiraRespostaEm = r.em;
      set.primeiraRespostaPor = r.por ?? responsavel ?? aberto.atendente ?? null;
    }
  }
  if (!Object.keys(set).length) return aberto;
  await WaAtendimento.updateOne(
    { _id: aberto._id },
    { $set: set, ...(transferencias ? { $inc: { transferencias } } : {}) },
  );
  return { ...aberto, ...set, transferencias: aberto.transferencias + transferencias } as Atendimento;
}

// ── Quem está disponível ─────────────────────────────────────

type Disponivel = { _id: mongoose.Types.ObjectId; email: string; nome?: string | null; ultimaAtribuicaoEm?: Date | null; vistoEm: Date };

/** Online e com o painel aberto (sinal nos últimos 3 minutos). */
export async function onlineAgora(tenantId: string | null): Promise<Disponivel[]> {
  return (await WaAtendente.find({
    tenantId,
    status: "online",
    vistoEm: { $gt: new Date(Date.now() - SINAL_MAX_MS) },
  })
    .select("email nome ultimaAtribuicaoEm vistoEm")
    .lean()) as unknown as Disponivel[];
}

function nomeCurto(p: { email: string; nome?: string | null }): string {
  return p.nome?.trim() || p.email.split("@")[0].replace(/[._-]/g, " ");
}

async function nomeDoContato(contactId: mongoose.Types.ObjectId): Promise<string> {
  const c = await WaContact.findById(contactId).select("name phone igUsername").lean();
  if (!c) return "Cliente";
  if (c.name?.trim()) return c.name.trim();
  if (c.igUsername) return `@${c.igUsername}`;
  return c.phone?.startsWith("+") ? c.phone : "Cliente";
}

/**
 * Entrega a conversa ao próximo do rodízio. `deQuem`: o responsável que ela
 * tem agora (null na fila sem dono); só troca se ninguém mexeu nela no meio
 * do caminho. Devolve o e-mail de quem recebeu.
 */
async function distribuirConversa(
  conv: Conversa,
  deQuem: string | null,
  excluir: string | null,
): Promise<Disponivel | null> {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const escolhido = escolherNoRodizio(await onlineAgora(conv.tenantId ?? null), excluir ?? deQuem);
    if (!escolhido) return null;
    // Reserva a vez no rodízio. Outro worker pegou a mesma pessoa no mesmo
    // instante: tenta de novo com a lista fresca.
    const vez = await WaAtendente.updateOne(
      { _id: escolhido._id, ultimaAtribuicaoEm: escolhido.ultimaAtribuicaoEm ?? null },
      { ultimaAtribuicaoEm: new Date() },
    );
    if (!vez.modifiedCount) continue;
    const r = await WaConversation.updateOne(
      { _id: conv._id, status: "waiting_human", assignedTo: deQuem },
      { assignedTo: escolhido.email },
    );
    if (!r.modifiedCount) return null;
    await WaAtendimento.updateOne(
      { conversationId: conv._id, aberto: true },
      {
        $set: { atendente: escolhido.email, atribuidoEm: new Date(), distribuida: true },
        ...(deQuem ? { $inc: { transferencias: 1 } } : {}),
      },
    );
    await WaMessage.create({
      conversationId: conv._id,
      direction: "outbound",
      sender: "system",
      content: `Distribuída automaticamente para ${nomeCurto(escolhido)}.`,
      // "evento": a Central mostra como linha do tempo, nunca como balão.
      mediaType: "evento",
      status: "sent",
    });
    await emitEvent(
      "conversa.atribuida",
      { by: "distribuicao", assignedTo: escolhido.email },
      { conversationId: String(conv._id) },
    );
    return escolhido;
  }
  return null;
}

/** Distribui, se for o caso, e avisa quem precisa saber. */
async function encaminhar(conv: Conversa, at: Atendimento, op: OperacaoDaLoja, por: string | null): Promise<void> {
  const tenantId = conv.tenantId ?? null;
  const conversationId = String(conv._id);
  let responsavel = conv.assignedTo?.toLowerCase() ?? null;
  let distribuida = false;

  // Responsável de um ciclo anterior (a IA transferiu, o cliente voltou, o
  // expediente abriu) que não está Online agora: folga, painel fechado ou já
  // saiu da loja. Esperar só por ele deixaria o cliente sem resposta, então a
  // conversa conta como da fila: no rodízio sai do nome dele e vai para o
  // próximo Online; na distribuição manual fica com ele, mas quem está Online
  // também é avisado. A transferência feita na Central (`por`) vale mesmo
  // para quem está em Pausa.
  let ausente: string | null = null;
  if (responsavel && !por && tenantId) {
    const online = await onlineAgora(tenantId);
    if (!online.some((o) => o.email === responsavel)) ausente = responsavel;
  }
  if (ausente && op.distribuicao === "rodizio") {
    const r = await WaConversation.updateOne(
      { _id: conv._id, status: "waiting_human", assignedTo: conv.assignedTo },
      { assignedTo: null },
    );
    if (r.modifiedCount) {
      await WaAtendimento.updateOne({ _id: at._id }, { atendente: null, atribuidoEm: null, distribuida: false });
      responsavel = null;
    }
  }

  if (!responsavel && tenantId && op.distribuicao === "rodizio") {
    const quem = await distribuirConversa(conv, null, por);
    if (quem) {
      responsavel = quem.email;
      distribuida = true;
    }
  }

  const cliente = await nomeDoContato(conv.contactId);
  const url = urlDaConversa(tenantId, conversationId);
  if (responsavel && responsavel !== por) {
    await enviarPush({
      tenantId,
      emails: [responsavel],
      aviso: {
        titulo: distribuida
          ? "Conversa nova para você"
          : por
            ? "Conversa transferida para você"
            : "Conversa esperando você",
        corpo: cliente,
        url,
        tag: `conv-${conversationId}`,
      },
    });
  }
  const daFila = !responsavel || responsavel === ausente;
  if (daFila && !at.filaAvisadaEm) {
    const online = (await onlineAgora(tenantId)).map((p) => p.email).filter((e) => e !== por && e !== responsavel);
    await enviarPush({
      tenantId,
      emails: online,
      aviso: { titulo: "Conversa nova na fila", corpo: cliente, url, tag: `conv-${conversationId}` },
    });
  }
  await WaAtendimento.updateOne({ _id: at._id }, { filaAvisadaEm: new Date(), aguardandoAbertura: false });
}

/**
 * A conversa acabou de ir para a fila da equipe (waiting_human): registra,
 * distribui e avisa. `por`: quem fez isso na Central (não recebe aviso nem a
 * conversa de volta no rodízio).
 */
export async function entrouNaFila(conversationId: string, opts: { por?: string | null } = {}): Promise<void> {
  await dbConnect();
  const conv = await lerConversa(conversationId);
  if (!conv || conv.status !== "waiting_human") return;
  const por = opts.por?.toLowerCase() ?? null;
  const op = await operacaoDaLoja(conv.tenantId ?? null);
  const at = await sincronizarAtendimento(conv, { por });
  if (!at) return;

  // Loja fechada: a conversa fica marcada para o próximo expediente. Só a
  // transferência de uma pessoa para outra segue na hora (quem transferiu
  // está trabalhando, e o colega também pode estar).
  const transferenciaDireta = Boolean(por && conv.assignedTo && conv.assignedTo !== por);
  if (!estadoDoHorario(op.horario).aberto && !transferenciaDireta) {
    if (!at.aguardandoAbertura) await WaAtendimento.updateOne({ _id: at._id }, { aguardandoAbertura: true });
    return;
  }
  await encaminhar(conv, at, op, por);
}

/** Puxa a fila parada da loja para quem está Online (rodízio ligado e loja
 *  aberta). Chamado pelo sinal de vida de quem fica Online e pela varredura.
 *  Conversa distribuída para quem saiu (pausa, ausente, painel fechado) e
 *  ainda sem resposta volta para o rodízio; a transferida na mão fica, a não
 *  ser que a pessoa tenha saído da equipe. */
export async function distribuirFila(tenantId: string, opPronta?: OperacaoDaLoja): Promise<number> {
  await dbConnect();
  const op = opPronta ?? (await operacaoDaLoja(tenantId));
  if (op.distribuicao !== "rodizio" || !estadoDoHorario(op.horario).aberto) return 0;
  const online = await onlineAgora(tenantId);
  if (!online.length) return 0;
  const disponiveis = new Set(online.map((o) => o.email));

  const fila = (await WaConversation.find({ tenantId, status: "waiting_human" })
    .select(CAMPOS_DA_CONVERSA)
    .sort({ waitingSince: 1 })
    .limit(50)
    .lean()) as Conversa[];
  let n = 0;
  // Lida só se aparecer conversa transferida na mão para quem não está Online.
  let equipe: Set<string> | null = null;
  for (const c of fila) {
    const dono = c.assignedTo?.toLowerCase() ?? null;
    if (dono && disponiveis.has(dono)) continue;
    const at = await sincronizarAtendimento(c);
    if (!at || at.aguardandoAbertura) continue;
    // A transferida na mão espera a pessoa, a não ser que ela tenha saído da
    // equipe: aí ninguém a atenderia.
    if (dono && !at.distribuida) {
      equipe ??= await emailsDaEquipe(tenantId);
      if (equipe.has(dono)) continue;
    }
    const quem = await distribuirConversa(c, c.assignedTo ?? null, null);
    if (!quem) break;
    n++;
    await enviarPush({
      tenantId,
      emails: [quem.email],
      aviso: {
        titulo: "Conversa nova para você",
        corpo: await nomeDoContato(c.contactId),
        url: urlDaConversa(tenantId, String(c._id)),
        tag: `conv-${String(c._id)}`,
      },
    });
    await WaAtendimento.updateOne({ _id: at._id }, { filaAvisadaEm: new Date() });
  }
  return n;
}

// ── Aviso ao cliente fora do horário ─────────────────────────

/** Texto fixo que o worker da IA manda quando ela falha e a loja está aberta. */
export const FALA_UM_INSTANTE =
  "Um instante — vou pedir para alguém da nossa equipe continuar seu atendimento por aqui. 😊";

/** Falas fixas de transferência: dizem que alguém vai assumir, não quando.
 *  Depois delas, com a loja fechada, o aviso de horário ainda é devido. A do
 *  limite de mensagens mora em wa/lib/ai-loja.ts (o teste confere o texto). */
export const FALAS_DE_TRANSFERENCIA = [
  FALA_UM_INSTANTE,
  "Vou chamar um vendedor da nossa equipe para continuar com você, um instante! 😊",
];

/**
 * O que foi dito ao cliente depois da última mensagem dele: "fala" (a IA,
 * ou o sistema com envio de verdade), "transferencia" (só uma fala fixa de
 * transferência) ou null (nada). As linhas internas ("Para a equipe") não
 * têm wamid e não contam.
 */
async function respostaDepoisDoCliente(
  conversationId: mongoose.Types.ObjectId,
): Promise<"fala" | "transferencia" | null> {
  const ultima = await WaMessage.findOne({ conversationId, direction: "inbound" })
    .sort({ createdAt: -1 })
    .select("createdAt")
    .lean();
  if (!ultima) return null;
  const falas = await WaMessage.find({
    conversationId,
    direction: "outbound",
    createdAt: { $gte: ultima.createdAt },
    $or: [{ sender: "ai" }, { sender: "system", externalId: { $exists: true } }],
  })
    .select("content")
    .limit(20)
    .lean();
  if (!falas.length) return null;
  const fixa = (m: { content?: string | null }) => FALAS_DE_TRANSFERENCIA.includes((m.content ?? "").trim());
  return falas.every(fixa) ? "transferencia" : "fala";
}

/**
 * Mensagem automática fora do horário: no máximo uma a cada N horas por
 * conversa, só dentro da janela de texto livre, nunca para quem pediu para
 * sair e nunca por SMS (cada envio é pago pela loja).
 */
async function avisarForaDoHorario(
  conv: Conversa,
  op: OperacaoDaLoja,
  modo: "cliente" | "transferencia",
): Promise<boolean> {
  if (!conv.tenantId || !op.horario.ativo || estadoDoHorario(op.horario).aberto) return false;
  const contato = await WaContact.findById(conv.contactId).select("phone optOut").lean();
  if (!contato || contato.optOut) return false;
  const canal = await channelForConversation(conv);
  if (canal.kind === "sms" || !podeMandarLivre(canal.kind, conv.lastInboundAt)) return false;

  // Reserva a vez antes de mandar: dois inbounds juntos mandariam duas.
  const limite = new Date(Date.now() - op.horario.intervaloHoras * 3600_000);
  const reservado = await WaConversaOperacao.findOneAndUpdate(
    { conversationId: conv._id, $or: [{ foraDoHorarioEm: null }, { foraDoHorarioEm: { $lt: limite } }] },
    { $set: { foraDoHorarioEm: new Date(), tenantId: conv.tenantId } },
  );
  if (!reservado) {
    // Já existe e o aviso é recente.
    if (await WaConversaOperacao.exists({ conversationId: conv._id })) return false;
    try {
      await WaConversaOperacao.create({ conversationId: conv._id, tenantId: conv.tenantId, foraDoHorarioEm: new Date() });
    } catch (err) {
      // Outro inbound criou no mesmo instante: ele manda.
      if ((err as { code?: number })?.code === 11000) return false;
      throw err;
    }
  }
  const texto = modo === "transferencia" ? avisoDeTransferenciaFora(op.horario) : textoForaDoHorario(op.horario);
  await sendAndLogText({ conversationId: String(conv._id), to: contato.phone, text: texto, sender: "system" });
  return true;
}

// ── Ganchos ──────────────────────────────────────────────────

/**
 * Depois de um turno da IA (worker): se a conversa foi para a fila, distribui
 * e avisa; com a loja fechada, diz ao cliente quando a equipe volta. A IA
 * que acabou de falar ("um vendedor já assume") ganha o aviso de quando; sem
 * IA (desligada, sem chave, sem assinatura), vai a mensagem automática.
 */
export async function aposTurnoDaIa(conversationId: string, statusAntes: string | null | undefined): Promise<void> {
  if (statusAntes !== "ai_active") return;
  await dbConnect();
  const conv = await lerConversa(conversationId);
  if (!conv || conv.status !== "waiting_human") return;
  await entrouNaFila(conversationId);
  if (!conv.tenantId) return;
  const op = await operacaoDaLoja(conv.tenantId);
  if (!op.horario.ativo || estadoDoHorario(op.horario).aberto) return;
  // Se a IA falou depois do cliente, ela já disse quando a equipe volta (o
  // prompt da loja recebe o horário, wa/lib/ai-loja.ts): um aviso a mais
  // repetiria. Sem fala da IA (falhou, sem chave), vai a mensagem automática.
  // Depois de uma fala fixa ("um instante", o limite de mensagens), que não
  // diz quando, vai o aviso de transferência fora do horário.
  const depois = await respostaDepoisDoCliente(conv._id);
  if (depois === "fala") return;
  await avisarForaDoHorario(conv, op, depois === "transferencia" ? "transferencia" : "cliente");
}

/**
 * A IA falhou e a conversa vai para a equipe (workers/ai failToHuman). Com a
 * loja fechada, o "um instante" prometeria alguém agora: no lugar dele vai o
 * aviso de quando a equipe volta (com as mesmas regras e o mesmo intervalo
 * dos outros avisos). Devolve true quando a loja está fechada; aí quem chama
 * não manda o "um instante".
 */
export async function transferenciaForaDoHorario(conversationId: string): Promise<boolean> {
  await dbConnect();
  const conv = await lerConversa(conversationId);
  if (!conv?.tenantId) return false;
  const op = await operacaoDaLoja(conv.tenantId);
  if (!op.horario.ativo || estadoDoHorario(op.horario).aberto) return false;
  await avisarForaDoHorario(conv, op, "transferencia");
  return true;
}

/**
 * Mensagem do cliente numa conversa que já está com a equipe (inbound): avisa
 * o responsável e, fora do horário, responde com a mensagem automática.
 */
export async function mensagemParaEquipe(conversationId: string): Promise<void> {
  await dbConnect();
  const conv = await lerConversa(conversationId);
  if (!conv || !comEquipe(conv.status)) return;
  const tenantId = conv.tenantId ?? null;
  if (conv.assignedTo) {
    const ultima = await WaMessage.findOne({ conversationId: conv._id, direction: "inbound" })
      .sort({ createdAt: -1 })
      .select("content mediaType")
      .lean();
    await enviarPush({
      tenantId,
      emails: [conv.assignedTo],
      aviso: {
        titulo: `Mensagem de ${await nomeDoContato(conv.contactId)}`,
        corpo: ultima?.content?.trim() || `[${ultima?.mediaType ?? "mensagem"}]`,
        url: urlDaConversa(tenantId, conversationId),
        tag: `conv-${conversationId}`,
      },
    });
  }
  if (!tenantId) return;
  const op = await operacaoDaLoja(tenantId);
  if (!op.horario.ativo || estadoDoHorario(op.horario).aberto) return;
  // Alguém da equipe respondeu há pouco: está no meio da conversa, mesmo
  // depois do expediente, e o "a equipe responde amanhã" o desmentiria.
  const atendendo = await WaMessage.exists({
    conversationId: conv._id,
    direction: "outbound",
    sender: "human",
    createdAt: { $gte: new Date(Date.now() - CONVERSA_ATIVA_MS) },
  });
  if (atendendo) return;
  await avisarForaDoHorario(conv, op, "cliente");
}

/** Depois de uma ação na Central (assumir, transferir, devolver, encerrar). */
export async function aposAcaoDaEquipe(conversationId: string, por: string): Promise<void> {
  await dbConnect();
  const conv = await lerConversa(conversationId);
  if (!conv) return;
  if (conv.status === "waiting_human") {
    // Devolvida para a fila sem dono: é uma entrada nova, e quem está Online
    // precisa saber de novo.
    if (!conv.assignedTo) {
      await WaAtendimento.updateOne({ conversationId: conv._id, aberto: true }, { filaAvisadaEm: null });
    }
    await entrouNaFila(conversationId, { por });
    return;
  }
  await sincronizarAtendimento(conv, { por: por.toLowerCase() });
}

// ── Varredura (workers/equipe, 1/min) ────────────────────────

export async function varrerFila(): Promise<{ registradas: number; fechadas: number; abertas: number; distribuidas: number }> {
  await dbConnect();
  const agora = Date.now();
  let registradas = 0;
  let fechadas = 0;
  let abertas = 0;
  let distribuidas = 0;

  const convs = (await WaConversation.find({ status: { $in: ["waiting_human", "human_active"] } })
    .select(CAMPOS_DA_CONVERSA)
    .sort({ waitingSince: 1 })
    .limit(2000)
    .lean()) as Conversa[];
  const abertos = (await WaAtendimento.find({ aberto: true }).lean()) as Atendimento[];
  const abertoPorConversa = new Map(abertos.map((a) => [String(a.conversationId), a]));
  const naEquipe = new Set(convs.map((c) => String(c._id)));

  // 1. Atendimento aberto de conversa que saiu da equipe: fecha.
  for (const a of abertos) {
    if (naEquipe.has(String(a.conversationId))) continue;
    const conv = await lerConversa(a.conversationId);
    if (!conv) {
      await WaAtendimento.updateOne({ _id: a._id }, { aberto: false, encerradoEm: new Date(), desfecho: "encerrada" });
      fechadas++;
    } else if (!comEquipe(conv.status)) {
      await sincronizarAtendimento(conv);
      fechadas++;
    }
  }

  // 2. Conversa com a equipe sem registro (SMS, Vera, caminho sem gancho) ou
  // com registro desatualizado (assumiu ao responder, trocou de dono).
  for (const c of convs) {
    const a = abertoPorConversa.get(String(c._id));
    if (!a) {
      registradas++;
      const recente = c.waitingSince && agora - new Date(c.waitingSince).getTime() < AVISO_RECENTE_MS;
      if (c.status === "waiting_human" && recente) await entrouNaFila(String(c._id));
      else await sincronizarAtendimento(c);
      continue;
    }
    const trocou = (a.atendente ?? null) !== (c.assignedTo?.toLowerCase() ?? null);
    const semResposta = c.status === "human_active" && !a.primeiraRespostaEm;
    if (trocou || semResposta) await sincronizarAtendimento(c);
  }

  // 3. Lojas: abertura do expediente e fila parada no rodízio.
  const lojas = new Set<string>();
  for (const c of convs) if (c.tenantId && c.status === "waiting_human") lojas.add(c.tenantId);
  for (const tenantId of lojas) {
    const op = await operacaoDaLoja(tenantId);
    if (!estadoDoHorario(op.horario).aberto) continue;
    const esperando = (await WaAtendimento.find({ tenantId, aberto: true, aguardandoAbertura: true }).lean()) as Atendimento[];
    for (const at of esperando) {
      // Reserva antes de tudo: duas varreduras sobrepostas (cron atrasado,
      // execução longa) abririam a mesma conversa duas vezes, com dois avisos
      // e duas voltas no rodízio. Só segue quem virou a marca.
      const vez = await WaAtendimento.updateOne({ _id: at._id, aguardandoAbertura: true }, { aguardandoAbertura: false });
      if (!vez.modifiedCount) continue;
      const conv = await lerConversa(at.conversationId);
      if (!conv || conv.status !== "waiting_human") continue;
      // Abriu: a espera (e o SLA) conta a partir de agora, para a equipe não
      // começar o dia com a fila da madrugada toda vermelha.
      const inicio = new Date();
      await WaConversation.updateOne({ _id: conv._id, status: "waiting_human" }, { waitingSince: inicio });
      await WaAtendimento.updateOne({ _id: at._id }, { abertoEm: inicio });
      await encaminhar({ ...conv, waitingSince: inicio }, { ...at, abertoEm: inicio }, op, null);
      abertas++;
    }
    distribuidas += await distribuirFila(tenantId, op);
  }

  return { registradas, fechadas, abertas, distribuidas };
}
