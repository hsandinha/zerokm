// "Conectar Messenger": manda o gestor para o login do Facebook. O `state`
// assinado diz de quem será o canal — o CNV (Vera) ou a loja —, igual ao
// "Conectar Instagram".

import { NextRequest, NextResponse } from "next/server";
import { requireScopeAdmin } from "@wa/lib/scope";
import { configPathOf, signConnectState } from "@wa/lib/channels";
import { fbAuthorizeUrl } from "@wa/lib/messenger";
import { siteUrl } from "@wa/lib/site-url";

export async function GET(req: NextRequest) {
  const base = siteUrl(req);
  let email: string;
  let tenantId: string | null;
  try {
    ({ email, tenantId } = await requireScopeAdmin("messenger"));
  } catch {
    return NextResponse.redirect(`${base}/dashboard?messenger=forbidden`);
  }

  try {
    const state = signConnectState({ tenantId, by: email });
    return NextResponse.redirect(fbAuthorizeUrl(state, `${base}/api/wa/messenger/callback`));
  } catch (err) {
    console.error("[messenger] conexão indisponível:", err);
    return NextResponse.redirect(`${base}${configPathOf(tenantId)}?messenger=config`);
  }
}
