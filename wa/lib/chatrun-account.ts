// De quem é a conexão no Chatrun Conexão e onde fica a conta dele no gateway.
//
// O `external_ref` que a zerokm manda no convite diz o dono do canal: o id
// da loja (WaStore._id) ou "cnv" para os canais da Vera (tenantId null). A
// conta no gateway agrupa os canais do dono: a da loja fica na WaStore, a do
// CNV na WaSettings.

import dbConnect from "@/lib/mongodb";
import { WaStore } from "@wa/models/store";
import { WaSettings } from "@wa/models/wa";
import {
  ChatrunError,
  connectionsOf,
  invite,
  resolveAccount,
  type ChatrunChannel,
} from "@wa/lib/chatrun";
import { upsertChatrunChannel } from "@wa/lib/chatrun-channels";

export const CNV_REF = "cnv";

/** external_ref do dono: a loja, ou "cnv". */
export function refOf(tenantId: string | null): string {
  return tenantId ?? CNV_REF;
}

/** Dono a partir do external_ref (null = CNV). */
export function tenantOfRef(ref: string): string | null {
  return ref === CNV_REF ? null : ref;
}

/**
 * Conta do dono no gateway: a guardada ou uma nova, com o nome do dono.
 *
 * Nunca pelo e-mail de quem clica em "Conectar". No gateway o e-mail acha a
 * conta de qualquer plataforma, e quem conecta costuma ser o operador (o
 * mesmo e-mail em contas de vários clientes): a loja abria o convite na conta
 * de outro cliente e o número novo iria parar lá. `email` fica na assinatura
 * só para os chamadores não mudarem.
 */
export async function accountFor(owner: { tenantId: string | null; email?: string }): Promise<string> {
  await dbConnect();
  let saved: string | undefined;
  let name: string;
  if (owner.tenantId) {
    const store = await WaStore.findById(owner.tenantId)
      .select("name chatrunAccountId chatrunAccountProprio")
      .lean();
    if (!store) throw new ChatrunError(404, "Loja não encontrada.");
    saved = store.chatrunAccountProprio ? store.chatrunAccountId : undefined;
    name = store.name;
  } else {
    const settings = await WaSettings.findOne().select("chatrunAccountId chatrunAccountProprio").lean();
    saved = settings?.chatrunAccountProprio ? settings.chatrunAccountId : undefined;
    name = "CNV 0KM";
  }
  if (saved) {
    try {
      return (await resolveAccount({ accountId: saved })).id;
    } catch (err) {
      if (!(err instanceof ChatrunError) || err.status !== 404) throw err;
    }
  }
  // Só o nome: o gateway cria uma conta nova, sem casar com nenhuma outra.
  const account = await resolveAccount({ name });
  await saveAccount(owner.tenantId, account.id);
  return account.id;
}

/**
 * Guarda a conta do dono. Vale para a criada acima e para a que volta do
 * convite: quando o número já era de outra conta no gateway, quem provou ser
 * dono dele foi o login da Meta, não o e-mail.
 */
export async function saveAccount(tenantId: string | null, accountId: string): Promise<void> {
  await dbConnect();
  const set = { chatrunAccountId: accountId, chatrunAccountProprio: true };
  if (tenantId) {
    await WaStore.updateOne({ _id: tenantId }, set);
  } else {
    await WaSettings.updateOne({}, set, { upsert: true });
  }
}

/**
 * Conta que veio na volta do convite (`account_id` na URL). Só é guardada se
 * o gateway confirmar uma conexão deste dono nela: a URL passa pelo navegador
 * e não pode apontar a loja para a conta de outro cliente.
 */
export async function adoptReturnedAccount(
  tenantId: string | null,
  accountId: string | null | undefined,
  channel: ChatrunChannel,
): Promise<void> {
  if (!accountId) return;
  const conns = await connectionsOf(refOf(tenantId), channel);
  if (conns.some((c) => c.account_id === accountId)) await saveAccount(tenantId, accountId);
}

/** Link do convite do canal para este dono, voltando para `returnUrl`. */
export async function inviteFor(params: {
  tenantId: string | null;
  email: string;
  channel: ChatrunChannel;
  returnUrl: string;
}): Promise<string> {
  const accountId = await accountFor(params);
  return invite({
    accountId,
    channel: params.channel,
    externalRef: refOf(params.tenantId),
    returnUrl: params.returnUrl,
  });
}

/** Lê no gateway as conexões do dono naquele canal e espelha como canais. */
export async function syncChannels(
  tenantId: string | null,
  channel: ChatrunChannel,
): Promise<{ connected: number; warning: string | null }> {
  const conns = await connectionsOf(refOf(tenantId), channel);
  let connected = 0;
  let warning: string | null = null;
  for (const c of conns) {
    const r = await upsertChatrunChannel({ ...c, channel: c.channel ?? channel }, refOf(tenantId));
    if (!r.ok) warning ??= r.reason;
    else if (r.status === "connected") connected += 1;
  }
  return { connected, warning };
}
