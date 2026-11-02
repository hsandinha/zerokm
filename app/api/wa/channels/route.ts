// Canais de quem está operando (o CNV ou a loja) para a tela de Configuração.
// Segredos nunca saem.

import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireScopeAdmin, type Scope } from "@wa/lib/scope";
import { WaChannel } from "@wa/models/channel";
import { cnvWhatsappChannel } from "@wa/lib/channels";

export const dynamic = "force-dynamic";

export async function GET() {
  let scope: Scope;
  try {
    scope = await requireScopeAdmin();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  await dbConnect();
  if (!scope.tenantId) await cnvWhatsappChannel(); // migra o WABA antigo, se ainda não migrou
  const channels = await WaChannel.find({ tenantId: scope.tenantId })
    .sort({ kind: -1, createdAt: 1 })
    .lean();

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
