// Lojas do atendimento (visão do CNV): quem tem o Chatrun, em que situação.

import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireAdmin } from "@wa/lib/auth";
import { WaStore } from "@wa/models/store";
import { WaChannel } from "@wa/models/channel";
import { WaConversation } from "@wa/models/wa";
import { storeAccess } from "@wa/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  await dbConnect();
  const stores = await WaStore.find().sort({ createdAt: -1 }).limit(500);
  const ids = stores.map((s) => String(s._id));
  const [canais, conversas] = await Promise.all([
    WaChannel.aggregate<{ _id: string; kinds: string[] }>([
      { $match: { tenantId: { $in: ids }, status: { $ne: "disconnected" } } },
      { $group: { _id: "$tenantId", kinds: { $addToSet: "$kind" } } },
    ]),
    WaConversation.aggregate<{ _id: string; n: number }>([
      { $match: { tenantId: { $in: ids }, lastMessageAt: { $gte: new Date(Date.now() - 30 * 86400_000) } } },
      { $group: { _id: "$tenantId", n: { $sum: 1 } } },
    ]),
  ]);
  const canaisPor = new Map(canais.map((c) => [c._id, c.kinds]));
  const conversasPor = new Map(conversas.map((c) => [c._id, c.n]));
  return NextResponse.json({
    lojas: stores.map((s) => ({
      id: String(s._id),
      name: s.name,
      kind: s.kind,
      access: storeAccess(s),
      aiActive: Boolean(s.ai?.active && s.ai?.token),
      canais: canaisPor.get(String(s._id)) ?? [],
      conversas30d: conversasPor.get(String(s._id)) ?? 0,
      createdAt: s.createdAt,
    })),
  });
}
