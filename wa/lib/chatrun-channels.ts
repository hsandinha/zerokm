// Canais conectados pelo Chatrun Conexão (WhatsApp, Instagram e Messenger,
// do CNV e das lojas).
//
// A conexão mora no gateway; aqui fica só o espelho dela como canal
// (wa_channels com provider "chatrun"), sem token. O `external_ref` da
// conexão diz de quem é o canal: o id da loja (WaStore._id) ou "cnv" para a
// Vera. Ele chega pelo retorno do convite e pelos eventos connection.*.

import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { WaChannel, type IWaChannel, type WaChannelKind, type WaChannelStatus } from "@wa/models/channel";
import { WaStore } from "@wa/models/store";
import type { ChatrunConnection } from "@wa/lib/chatrun";

const CNV_REF = "cnv";

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

/** Campo que identifica a conta no canal (um número, uma conta, uma Página). */
function identityOf(kind: WaChannelKind, conn: ChatrunConnection): { field: string; value: string } | null {
  if (kind === "whatsapp" && conn.phone_number_id) return { field: "phoneNumberId", value: conn.phone_number_id };
  if (kind === "instagram" && conn.ig_user_id) return { field: "igUserId", value: conn.ig_user_id };
  if (kind === "messenger" && conn.fb_page_id) return { field: "fbPageId", value: conn.fb_page_id };
  return null;
}

function fieldsOf(kind: WaChannelKind, conn: ChatrunConnection) {
  if (kind === "instagram") {
    return {
      ...(conn.ig_user_id ? { igUserId: conn.ig_user_id } : {}),
      ...(conn.ig_username ? { igUsername: conn.ig_username } : {}),
    };
  }
  if (kind === "messenger") {
    const name = conn.fb_page_name ?? conn.verified_name;
    return {
      ...(conn.fb_page_id ? { fbPageId: conn.fb_page_id } : {}),
      ...(name ? { fbPageName: name, displayName: name } : {}),
    };
  }
  return {
    ...(conn.phone_number_id ? { phoneNumberId: conn.phone_number_id } : {}),
    ...(conn.waba_id ? { wabaId: conn.waba_id } : {}),
    ...(conn.display_phone ? { displayPhone: conn.display_phone } : {}),
    ...(conn.verified_name ? { displayName: conn.verified_name } : {}),
  };
}

/** Pelo gateway não há segredo da Meta guardado aqui. */
const SECRETS = {
  token: 1,
  appSecret: 1,
  verifyToken: 1,
  igToken: 1,
  igTokenExpiresAt: 1,
  fbPageToken: 1,
  fbUserId: 1,
} as const;

/** Cria ou atualiza o canal do dono (`ref`: id da loja ou "cnv") a partir da conexão. */
export async function upsertChatrunChannel(
  conn: ChatrunConnection,
  ref: string,
): Promise<ChatrunSyncResult> {
  const kind: WaChannelKind = conn.channel ?? "whatsapp";
  if (!["whatsapp", "instagram", "messenger"].includes(kind)) return { ok: true, channelId: null, status: null };

  await dbConnect();
  let tenantId: string | null;
  if (ref === CNV_REF) {
    tenantId = null;
  } else {
    if (!mongoose.isValidObjectId(ref)) return { ok: false, reason: "Loja inválida no external_ref." };
    if (!(await WaStore.exists({ _id: ref }))) return { ok: false, reason: "Loja não encontrada." };
    tenantId = ref;
  }

  const identity = identityOf(kind, conn);
  let doc: IWaChannel | null = await WaChannel.findOne({ kind, chatrunConnectionId: conn.id });
  if (!doc && identity) doc = await WaChannel.findOne({ kind, [identity.field]: identity.value });
  // O CNV tem um WhatsApp só (o número da Vera): conectar pelo Chatrun
  // converte o canal que já existe em vez de criar um segundo.
  if (!doc && kind === "whatsapp" && tenantId === null) {
    doc = await WaChannel.findOne({ kind: "whatsapp", tenantId: null });
  }

  const status = STATUS[conn.status] ?? null;
  if (!status) return { ok: true, channelId: doc ? String(doc._id) : null, status: null };

  // Uma conta pertence a um canal só: a de outro dono não troca de mão.
  if (doc && (doc.tenantId ?? null) !== tenantId && doc.status !== "disconnected") {
    const what = kind === "whatsapp" ? "Este número" : kind === "instagram" ? "Esta conta do Instagram" : "Esta Página";
    return { ok: false, reason: `${what} já está conectado a outra loja.` };
  }

  // Canal antigo e desligado com a mesma conta (outra credencial): libera a
  // conta para o índice único não barrar o novo.
  if (identity) {
    await WaChannel.updateMany(
      {
        kind,
        [identity.field]: identity.value,
        status: "disconnected",
        ...(doc ? { _id: { $ne: doc._id } } : {}),
      },
      { $unset: { [identity.field]: 1 } },
    );
  }

  const fields = {
    kind,
    tenantId,
    provider: "chatrun" as const,
    chatrunConnectionId: conn.id,
    chatrunAccountId: conn.account_id,
    ...fieldsOf(kind, conn),
    status,
    lastError: status === "connected" ? null : conn.status_detail ?? null,
  };

  if (doc) {
    await WaChannel.updateOne({ _id: doc._id }, { ...fields, $unset: SECRETS });
    return { ok: true, channelId: String(doc._id), status };
  }
  try {
    const created = await WaChannel.create({ ...fields, lastError: fields.lastError ?? undefined });
    return { ok: true, channelId: String(created._id), status };
  } catch (err) {
    // Retorno do convite e evento chegando juntos: fica o primeiro.
    if ((err as { code?: number })?.code === 11000) {
      const again = await WaChannel.findOne({ kind, chatrunConnectionId: conn.id });
      if (again) {
        await WaChannel.updateOne({ _id: again._id }, { ...fields, $unset: SECRETS });
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
    { chatrunConnectionId: connectionId },
    { status, lastError: status === "connected" ? null : detail ?? null },
  );
}
