// Ligar e desligar a Página do Facebook (canal Messenger). Portado do Chatrun
// (messenger-conexao.ts, 088). Usado pela volta do login (uma Página só:
// conecta direto) e pela escolha (várias Páginas: a pessoa escolhe na tela).

import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { WaChannel } from "@wa/models/channel";
import { WaMessengerChoice, type MessengerChoicePage } from "@wa/models/messenger-choice";
import { encrypt } from "@wa/lib/crypto";
import { safeDecrypt } from "@wa/lib/channels";
import {
  fbMyPages,
  fbSubscribePage,
  fbUnsubscribePage,
  type FacebookPage,
} from "@wa/lib/messenger";

export type ConnectResult = { ok: true; page: string } | { ok: false; why: string };

/** Grava (ou atualiza) o canal da Página e inscreve a Página no webhook do
 *  app. Sem a inscrição a mensagem nunca chega: se ela falhar, o canal fica
 *  em "error" e o motivo volta para a tela. */
export async function connectPage(
  tenantId: string | null,
  page: FacebookPage,
  fbUserId: string | null,
): Promise<ConnectResult> {
  if (!page.canMessage) {
    return {
      ok: false,
      why: `Sua função na Página "${page.name}" não permite responder mensagens. Peça acesso de administrador ou de mensagens.`,
    };
  }
  await dbConnect();

  // A mesma Página não pode estar em dois donos: as mensagens dela só têm um
  // destino. Quem conectou primeiro precisa desconectar antes.
  const existing = await WaChannel.findOne({ kind: "messenger", fbPageId: page.id });
  if (existing && (existing.tenantId ?? null) !== tenantId && existing.status !== "disconnected") {
    return {
      ok: false,
      why: `A Página "${page.name}" já está conectada em outra loja. Desconecte lá primeiro.`,
    };
  }

  await WaChannel.findOneAndUpdate(
    { kind: "messenger", fbPageId: page.id },
    {
      kind: "messenger",
      tenantId,
      fbPageId: page.id,
      fbPageName: page.name,
      fbPageToken: encrypt(page.token),
      fbUserId: fbUserId ?? undefined,
      displayName: page.name,
      status: "connected",
      lastError: null,
    },
    { upsert: true, new: true },
  );

  try {
    await fbSubscribePage({ pageId: page.id, token: page.token });
  } catch (err) {
    const why = (err instanceof Error ? err.message : String(err)).slice(0, 200);
    console.error("[messenger] subscribed_apps falhou:", err);
    await WaChannel.updateOne({ kind: "messenger", fbPageId: page.id }, { status: "error", lastError: why });
    return { ok: false, why: `A Meta recusou ligar o Messenger da Página: ${why.slice(0, 120)}` };
  }
  return { ok: true, page: page.name };
}

/** Guarda o login para a escolha da Página (15 min) e devolve o id. */
export async function saveChoice(params: {
  tenantId: string | null;
  by: string;
  fbUserId: string | null;
  userToken: string;
  pages: FacebookPage[];
}): Promise<string> {
  await dbConnect();
  const doc = await WaMessengerChoice.create({
    tenantId: params.tenantId,
    by: params.by,
    fbUserId: params.fbUserId,
    userToken: encrypt(params.userToken),
    pages: params.pages.map(({ id, name, pictureUrl, canMessage }) => ({ id, name, pictureUrl, canMessage })),
  });
  return String(doc._id);
}

export type Choice = { id: string; pages: MessengerChoicePage[]; expiresAt: Date };

/** Escolha pendente deste dono (ou nada, se venceu ou é de outra loja). */
export async function readChoice(id: string, tenantId: string | null): Promise<Choice | null> {
  if (!mongoose.isValidObjectId(id)) return null;
  await dbConnect();
  const doc = await WaMessengerChoice.findOne({ _id: id, tenantId, expiresAt: { $gt: new Date() } }).lean();
  if (!doc) return null;
  return { id: String(doc._id), pages: doc.pages, expiresAt: doc.expiresAt };
}

/** Conecta a Página escolhida. O token da Página é buscado de novo com o
 *  token do login (nunca ficou gravado na escolha). */
export async function completeChoice(
  id: string,
  tenantId: string | null,
  pageId: string,
): Promise<ConnectResult> {
  if (!mongoose.isValidObjectId(id)) return { ok: false, why: "Escolha inválida." };
  await dbConnect();
  const doc = await WaMessengerChoice.findOne({ _id: id, tenantId, expiresAt: { $gt: new Date() } });
  if (!doc) return { ok: false, why: "O login venceu. Clique em Conectar de novo." };
  const userToken = safeDecrypt(doc.userToken);
  if (!userToken) return { ok: false, why: "O login venceu. Clique em Conectar de novo." };

  let pages: FacebookPage[];
  try {
    pages = await fbMyPages(userToken);
  } catch (err) {
    return { ok: false, why: (err instanceof Error ? err.message : String(err)).slice(0, 140) };
  }
  const page = pages.find((p) => p.id === pageId);
  if (!page) return { ok: false, why: "Essa Página não veio no login. Clique em Conectar de novo." };
  const result = await connectPage(tenantId, page, doc.fbUserId ?? null);
  if (result.ok) await WaMessengerChoice.deleteOne({ _id: doc._id });
  return result;
}

/** Tira a Página do webhook do app (best-effort). O token é apagado por quem
 *  chama, junto com o status. */
export async function unsubscribeChannelPage(doc: { fbPageId?: string; fbPageToken?: string }): Promise<void> {
  const token = safeDecrypt(doc.fbPageToken);
  if (!doc.fbPageId || !token) return;
  await fbUnsubscribePage({ pageId: doc.fbPageId, token });
}
