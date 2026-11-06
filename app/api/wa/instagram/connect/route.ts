// "Conectar Instagram": convite do Chatrun Conexão. A página do gateway faz o
// login oficial da Meta no app da Chatrun e volta para /api/wa/instagram/callback.
// A zerokm não guarda token nem recebe webhook da Meta: o canal fica com a
// conexão do gateway.

import { NextRequest, NextResponse } from "next/server";
import { requireScopeAdmin } from "@wa/lib/scope";
import { configPathOf } from "@wa/lib/channels";
import { chatrunConfigured } from "@wa/lib/chatrun";
import { inviteFor } from "@wa/lib/chatrun-account";
import { siteUrl } from "@wa/lib/site-url";

export async function GET(req: NextRequest) {
  const base = siteUrl(req);
  let email: string;
  let tenantId: string | null;
  try {
    ({ email, tenantId } = await requireScopeAdmin("instagram"));
  } catch {
    return NextResponse.redirect(`${base}/dashboard?instagram=forbidden`);
  }
  if (!chatrunConfigured()) {
    return NextResponse.redirect(`${base}${configPathOf(tenantId)}?instagram=config`);
  }

  try {
    const url = await inviteFor({
      tenantId,
      email,
      channel: "instagram",
      returnUrl: `${base}/api/wa/instagram/callback`,
    });
    return NextResponse.redirect(url);
  } catch (err) {
    console.error("[instagram] convite do Chatrun falhou:", err);
    const qs = new URLSearchParams({ instagram: "erro", why: err instanceof Error ? err.message : "falha no Chatrun" });
    return NextResponse.redirect(`${base}${configPathOf(tenantId)}?${qs.toString()}`);
  }
}
