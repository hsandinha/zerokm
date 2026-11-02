// Canais do CNV (Vera) para a tela de Configuração. Segredos nunca saem.

import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireAdmin } from "@wa/lib/auth";
import { WaChannel } from "@wa/models/channel";
import { cnvWhatsappChannel } from "@wa/lib/channels";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  await dbConnect();
  await cnvWhatsappChannel(); // migra o WABA antigo, se ainda não migrou
  const channels = await WaChannel.find({ tenantId: null }).sort({ kind: -1, createdAt: 1 }).lean();

  return NextResponse.json({
    channels: channels.map((c) => ({
      id: String(c._id),
      kind: c.kind,
      status: c.status,
      label:
        c.kind === "instagram"
          ? c.igUsername
            ? `@${c.igUsername}`
            : "Instagram"
          : c.displayPhone || c.phoneNumberId || "WhatsApp",
      tokenExpiresAt: c.igTokenExpiresAt ?? null,
      lastError: c.lastError ?? null,
    })),
    instagramReady: Boolean(
      (process.env.INSTAGRAM_APP_ID ?? process.env.META_APP_ID) &&
        (process.env.INSTAGRAM_APP_SECRET ?? process.env.META_APP_SECRET),
    ),
  });
}
