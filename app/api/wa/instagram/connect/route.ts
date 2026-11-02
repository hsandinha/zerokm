// "Conectar Instagram": manda o gestor para a autorização do Instagram Login.
// O `state` assinado diz de quem será o canal — o CNV (Vera) ou a loja.

import { NextRequest, NextResponse } from "next/server";
import { requireScopeAdmin } from "@wa/lib/scope";
import { configPathOf, signConnectState } from "@wa/lib/channels";
import { igAuthorizeUrl } from "@wa/lib/instagram";
import { siteUrl } from "@wa/lib/site-url";

export async function GET(req: NextRequest) {
  const base = siteUrl(req);
  let email: string;
  let tenantId: string | null;
  try {
    ({ email, tenantId } = await requireScopeAdmin());
  } catch {
    return NextResponse.redirect(`${base}/dashboard?instagram=forbidden`);
  }

  try {
    const state = signConnectState({ tenantId, by: email });
    return NextResponse.redirect(igAuthorizeUrl(state, `${base}/api/wa/instagram/callback`));
  } catch (err) {
    console.error("[instagram] conexão indisponível:", err);
    return NextResponse.redirect(`${base}${configPathOf(tenantId)}?instagram=config`);
  }
}
