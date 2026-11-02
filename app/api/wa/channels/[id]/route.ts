// Desconectar um canal: apaga o token e para de receber. As conversas ficam
// no histórico. O WhatsApp do CNV é editado no formulário do WABA; o da loja
// sai por aqui (e volta pelo "Conectar WhatsApp").

import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireScopeAdmin, type Scope } from "@wa/lib/scope";
import { WaChannel } from "@wa/models/channel";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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

  await WaChannel.updateOne(
    { _id: channel._id },
    {
      status: "disconnected",
      $unset:
        channel.kind === "instagram"
          ? { igToken: 1, igTokenExpiresAt: 1 }
          : { token: 1, appSecret: 1 },
    },
  );
  return NextResponse.json({ ok: true });
}
