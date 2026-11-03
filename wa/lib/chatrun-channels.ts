// Canais de WhatsApp das lojas conectados pelo Chatrun Conexão.
//
// A conexão mora no gateway; aqui fica só o espelho dela como canal da loja
// (wa_channels com provider "chatrun"), sem token. O `external_ref` que a
// zerokm manda no convite é o id da loja (WaStore._id): é ele que diz de
// quem é o número quando a conexão volta pelo retorno do convite ou pelos
// eventos (connection.connected / updated / error / disconnected).

import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { WaChannel, type WaChannelStatus } from "@wa/models/channel";
import { WaStore } from "@wa/models/store";
import type { ChatrunConnection } from "@wa/lib/chatrun";

const STATUS: Record<ChatrunConnection["status"], WaChannelStatus | null> = {
  // Popup aberto e não concluído: ainda não é canal.
  pending: null,
  connected: "connected",
  error: "error",
  disconnected: "disconnected",
};

export type ChatrunSyncResult =
  | { ok: true; channelId: string | null; status: WaChannelStatus | null }
  | { ok: false; reason: string };

/** Cria ou atualiza o canal da loja a partir da conexão do gateway. */
export async function upsertChatrunChannel(
  conn: ChatrunConnection,
  tenantId: string,
): Promise<ChatrunSyncResult> {
  if (conn.channel && conn.channel !== "whatsapp") return { ok: true, channelId: null, status: null };
  if (!mongoose.isValidObjectId(tenantId)) return { ok: false, reason: "Loja inválida no external_ref." };

  await dbConnect();
  if (!(await WaStore.exists({ _id: tenantId }))) return { ok: false, reason: "Loja não encontrada." };

  let doc = await WaChannel.findOne({ kind: "whatsapp", chatrunConnectionId: conn.id });
  if (!doc && conn.phone_number_id) {
    doc = await WaChannel.findOne({ kind: "whatsapp", phoneNumberId: conn.phone_number_id });
  }

  const status = STATUS[conn.status] ?? null;
  if (!status) return { ok: true, channelId: doc ? String(doc._id) : null, status: null };

  // Um número pertence a um canal só: o de outra loja não troca de dono.
  if (doc && (doc.tenantId ?? null) !== tenantId && doc.status !== "disconnected") {
    return { ok: false, reason: "Este número já está conectado a outra loja." };
  }

  // Canal antigo e desligado com o mesmo número (outra credencial): libera o
  // número para o índice único não barrar o novo.
  if (conn.phone_number_id) {
    await WaChannel.updateMany(
      {
        kind: "whatsapp",
        phoneNumberId: conn.phone_number_id,
        status: "disconnected",
        ...(doc ? { _id: { $ne: doc._id } } : {}),
      },
      { $unset: { phoneNumberId: 1 } },
    );
  }

  const fields = {
    kind: "whatsapp" as const,
    tenantId,
    provider: "chatrun" as const,
    chatrunConnectionId: conn.id,
    chatrunAccountId: conn.account_id,
    ...(conn.phone_number_id ? { phoneNumberId: conn.phone_number_id } : {}),
    ...(conn.waba_id ? { wabaId: conn.waba_id } : {}),
    ...(conn.display_phone ? { displayPhone: conn.display_phone } : {}),
    ...(conn.verified_name ? { displayName: conn.verified_name } : {}),
    status,
    lastError: status === "connected" ? null : conn.status_detail ?? null,
  };
  // Pelo gateway não há segredo da Meta guardado aqui.
  const unset = { token: 1, appSecret: 1, verifyToken: 1 };

  if (doc) {
    await WaChannel.updateOne({ _id: doc._id }, { ...fields, $unset: unset });
    return { ok: true, channelId: String(doc._id), status };
  }
  try {
    const created = await WaChannel.create({ ...fields, lastError: fields.lastError ?? undefined });
    return { ok: true, channelId: String(created._id), status };
  } catch (err) {
    // Retorno do convite e evento chegando juntos: fica o primeiro.
    if ((err as { code?: number })?.code === 11000) {
      const again = await WaChannel.findOne({ kind: "whatsapp", chatrunConnectionId: conn.id });
      if (again) {
        await WaChannel.updateOne({ _id: again._id }, { ...fields, $unset: unset });
        return { ok: true, channelId: String(again._id), status };
      }
    }
    throw err;
  }
}

/** Situação da conexão mudou sem trazer a conexão inteira (erro, desconexão). */
export async function setChatrunChannelStatus(
  connectionId: string,
  status: WaChannelStatus,
  detail?: string | null,
): Promise<void> {
  await dbConnect();
  await WaChannel.updateOne(
    { kind: "whatsapp", chatrunConnectionId: connectionId },
    { status, lastError: status === "connected" ? null : detail ?? null },
  );
}
