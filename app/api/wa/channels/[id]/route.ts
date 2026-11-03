// Desconectar um canal: apaga o token (ou desvincula a zerokm da conexão no
// Chatrun) e para de receber. As conversas ficam no histórico. O WhatsApp do CNV é editado no formulário do WABA; o da loja
// sai por aqui (e volta pelo "Conectar WhatsApp"). Messenger e SMS também:
// a Página sai do webhook do app e as assinaturas da Zenvia deste canal são
// removidas, antes de apagar o token que faz isso.

import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireScopeAdmin, type Scope } from "@wa/lib/scope";
import { WaChannel, type IWaChannel } from "@wa/models/channel";
import { safeDecrypt } from "@wa/lib/channels";
import { unsubscribeChannelPage } from "@wa/lib/messenger-connect";
import { zenviaUnsubscribe } from "@wa/lib/zenvia";
import { siteUrl } from "@wa/lib/site-url";
import { unlinkConnection } from "@wa/lib/chatrun";

/** Segredos que saem do canal ao desconectar, por tipo. */
function secretFieldsOf(kind: IWaChannel["kind"]): Record<string, 1> {
  if (kind === "instagram") return { igToken: 1, igTokenExpiresAt: 1 };
  if (kind === "messenger") return { fbPageToken: 1 };
  // O segredo do webhook fica: religar a mesma conta mantém o endereço que
  // já está cadastrado na Comtele. Sem a chave, nada sai nem entra.
  if (kind === "sms") return { smsToken: 1 };
  return { token: 1, appSecret: 1 };
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let scope: Scope;
  try {
    scope = await requireScopeAdmin();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;

  await dbConnect();
  const channel = await WaChannel.findOne({ _id: id, tenantId: scope.tenantId }).catch(() => null);
  if (!channel) return NextResponse.json({ error: "Canal não encontrado" }, { status: 404 });
  if (channel.kind === "whatsapp" && !scope.tenantId) {
    return NextResponse.json({ error: "O WhatsApp do CNV é editado no formulário" }, { status: 400 });
  }

  // Best-effort: o token pode já estar inválido, e desconectar não pode travar.
  // Número do Chatrun: desvincula só a zerokm no gateway (o número continua
  // lá para as outras plataformas e para reconectar pelo convite).
  if (channel.provider === "chatrun" && channel.chatrunConnectionId) {
    await unlinkConnection(channel.chatrunConnectionId).catch(() => {});
  }
  if (channel.kind === "messenger") {
    await unsubscribeChannelPage(channel).catch(() => {});
  }
  if (channel.kind === "sms" && channel.smsProvider === "zenvia") {
    const token = safeDecrypt(channel.smsToken);
    if (token) await zenviaUnsubscribe(token, `${siteUrl(req)}/api/webhooks/sms/${String(channel._id)}/`);
  }

  await WaChannel.updateOne(
    { _id: channel._id },
    { status: "disconnected", $unset: secretFieldsOf(channel.kind) },
  );
  return NextResponse.json({ ok: true });
}
