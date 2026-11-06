// Regras do servidor que a Central precisa saber antes de mostrar um botão
// (se a IA pode assumir a conversa de volta, quem é a equipe para transferir)
// e o que as rotas de envio da Central repetem entre si.

import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { WaAdmin } from "@wa/models/panel";
import { WaAiJob, WaConversation, WaMessage, type IWaConversation } from "@wa/models/wa";
import type { IWaStore } from "@wa/models/store";
import { getSettings } from "@wa/lib/settings";
import { getStore, storeIsActive } from "@wa/lib/store";
import { membrosDaLoja } from "@wa/lib/equipe-loja";
import { podeUsar, type Scope } from "@wa/lib/scope";
import type { AutorDaMensagem } from "@wa/lib/send";

export type IaDaConversa = { disponivel: boolean; motivo: string | null };

/**
 * A IA responderia se a conversa voltasse para ela? Mesmas condições do
 * worker (wa/lib/ai.ts e wa/lib/ai-loja.ts): sem isto, "Devolver à IA" põe a
 * conversa numa fila que ninguém atende, e o cliente fica sem resposta.
 */
export async function iaDaConversa(
  scope: Scope,
  /** A loja já lida por quem chama (evita ler duas vezes no poll da Central). */
  lojaLida?: IWaStore | null,
): Promise<IaDaConversa> {
  if (!scope.tenantId) {
    const settings = await getSettings();
    return settings.aiActive
      ? { disponivel: true, motivo: null }
      : { disponivel: false, motivo: "A IA do CNV está pausada em IA & WABA." };
  }
  if (!podeUsar(scope, "ia")) {
    return { disponivel: false, motivo: "A IA de vendas não foi liberada para a loja." };
  }
  const store = lojaLida ?? (await getStore(scope.tenantId));
  if (!store) return { disponivel: false, motivo: "Loja não encontrada." };
  if (!storeIsActive(store)) {
    return { disponivel: false, motivo: "Assinatura do atendimento inativa: a IA não responde." };
  }
  if (!store.ai?.active) return { disponivel: false, motivo: "A IA está desligada na Configuração." };
  if (!store.ai?.token) return { disponivel: false, motivo: "Falta a chave da IA na Configuração." };
  return { disponivel: true, motivo: null };
}

export type MembroDaEquipe = { email: string; name: string | null; role: "gestor" | "atendente" };

/**
 * Quem pode receber uma conversa. Loja: a equipe cadastrada mais quem entra
 * por direito (usuários da concessionária, o lojista titular e os
 * sub-usuários dele), wa/lib/equipe-loja.ts membrosDaLoja. CNV: a lista de
 * usuários do painel.
 */
export async function equipeDoEscopo(scope: Scope): Promise<MembroDaEquipe[]> {
  await dbConnect();
  const porEmail = new Map<string, MembroDaEquipe>();
  const add = (email: string | null | undefined, name: string | null | undefined, role: MembroDaEquipe["role"]) => {
    const e = email?.toLowerCase().trim();
    if (!e || porEmail.has(e)) return;
    porEmail.set(e, { email: e, name: name?.trim() || null, role });
  };

  if (!scope.tenantId) {
    const admins = await WaAdmin.find().select("email name role").sort({ name: 1, email: 1 }).lean();
    for (const a of admins) add(a.email, a.name, a.role === "admin" ? "gestor" : "atendente");
    // Lista vazia = qualquer administrador da zerokm entra (bootstrap): ao
    // menos quem está operando aparece.
    add(scope.email, scope.name, scope.role === "admin" ? "gestor" : "atendente");
    return [...porEmail.values()];
  }

  const store = await getStore(scope.tenantId);
  if (!store) return [];
  for (const m of await membrosDaLoja(store)) add(m.email, m.name, m.role);
  add(scope.email, scope.name, scope.role === "admin" ? "gestor" : "atendente");
  return [...porEmail.values()];
}

/** Nome para mostrar na linha do tempo ("Ana" em vez de ana.souza@loja.com). */
export function nomeDe(m: { email: string; name?: string | null } | null | undefined): string {
  if (!m) return "alguém";
  return m.name?.trim() || m.email.split("@")[0].replace(/[._-]/g, " ");
}

/** wamid da mensagem citada, só se ela for desta conversa (o id vem da tela). */
export async function wamidCitado(
  conversationId: string,
  messageId: string | null | undefined,
): Promise<string | null> {
  if (!messageId || !mongoose.isValidObjectId(messageId)) return null;
  const m = await WaMessage.findOne({ _id: messageId, conversationId }).select("externalId").lean();
  return m?.externalId ?? null;
}

/** Quem está operando, como autor da mensagem (wa/lib/send.ts). */
export function autorDoEscopo(scope: Pick<Scope, "email" | "name">): AutorDaMensagem {
  return { email: scope.email, name: scope.name ?? null };
}

/**
 * Põe o autor nas mensagens humanas desta conversa que saíram sem ele desde
 * `desde`. Serve aos envios que passam por código que não recebe o autor (o
 * template de wa/lib/outreach.ts, o carro do estoque): o envio grava a
 * mensagem e quem chamou carimba logo depois. Só mexe em mensagem sem autor,
 * então nunca troca o nome de quem já estava gravado.
 */
export async function carimbarAutor(
  conversationId: string | mongoose.Types.ObjectId,
  autor: AutorDaMensagem,
  desde: Date,
): Promise<void> {
  const email = autor.email?.toLowerCase().trim();
  if (!email) return;
  await WaMessage.updateMany(
    {
      conversationId: String(conversationId),
      direction: "outbound",
      sender: "human",
      authorEmail: { $exists: false },
      createdAt: { $gte: desde },
    },
    { $set: { authorEmail: email, ...(autor.name?.trim() ? { authorName: autor.name.trim() } : {}) } },
  ).catch((err) => console.warn("[central] autor não carimbado:", err instanceof Error ? err.message : err));
}

/** Folga do carimbo depois do envio: a viagem até a Meta cabe com sobra. */
const CARIMBO_MS = 2 * 60_000;

/**
 * Depois de um envio manual: a conversa é de quem respondeu e a espera do SLA
 * acaba (regra de ouro: nunca IA e humano ao mesmo tempo). Mesmo efeito da
 * rota de texto, para anexo, carro e localização.
 *
 * Quem chama sem ter passado o autor no envio (o carro do estoque) ganha o
 * carimbo nas mensagens que acabaram de sair sem ele. As rotas que já mandam
 * o autor usam assumirAoResponder, sem carimbo: assim uma resposta pelo
 * celular (eco, sem autor) nunca ganha o nome de quem estava na Central.
 */
export async function humanoRespondeu(conv: IWaConversation, email: string, name?: string | null): Promise<void> {
  await carimbarAutor(conv._id, { email, name: name ?? null }, new Date(Date.now() - CARIMBO_MS));
  await assumirAoResponder(conv, email);
}

/** A parte de humanoRespondeu que muda a conversa (sem carimbar autor). */
export async function assumirAoResponder(conv: IWaConversation, email: string): Promise<void> {
  if (conv.status !== "human_active" || !conv.assignedTo) {
    conv.status = "human_active";
    conv.assignedTo = conv.assignedTo ?? email;
    conv.waitingSince = null;
    await conv.save();
  }
  await WaAiJob.updateMany(
    { conversationId: conv._id, status: "pending" },
    { status: "done", lastError: "cancelado: humano respondeu" },
  );
}

/** Conversa da loja de quem está operando, com o telefone do contato. */
export async function conversaDoEscopo(scope: Scope, id: string) {
  if (!mongoose.isValidObjectId(id)) return null;
  await dbConnect();
  const conv = await WaConversation.findById(id);
  if (!conv || (conv.tenantId ?? null) !== scope.tenantId) return null;
  return conv;
}
