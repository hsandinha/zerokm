// Desconectar um canal do Instagram: apaga o token e para de receber. As
// conversas ficam no histórico. O WhatsApp é editado no formulário do WABA.

import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireAdmin } from "@wa/lib/auth";
import { WaChannel } from "@wa/models/channel";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;

  await dbConnect();
  const channel = await WaChannel.findOne({ _id: id, tenantId: null }).catch(() => null);
  if (!channel) return NextResponse.json({ error: "Canal não encontrado" }, { status: 404 });
  if (channel.kind !== "instagram") {
    return NextResponse.json({ error: "Só o Instagram é desconectado por aqui" }, { status: 400 });
  }

  await WaChannel.updateOne(
    { _id: channel._id },
    { status: "disconnected", $unset: { igToken: 1, igTokenExpiresAt: 1 } },
  );
  return NextResponse.json({ ok: true });
}
