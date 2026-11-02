// "Conectar Instagram": manda o admin para a autorização do Instagram Login.
// O `state` assinado diz de quem será o canal — hoje o CNV (Vera); a loja
// que assinar o atendimento passa o id dela pelo mesmo caminho.

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@wa/lib/auth";
import { signConnectState } from "@wa/lib/channels";
import { igAuthorizeUrl } from "@wa/lib/instagram";
import { siteUrl } from "@wa/lib/site-url";

const CONFIG_PATH = "/dashboard/admin/whatsapp/configuracao";

export async function GET(req: NextRequest) {
  const base = siteUrl(req);
  let email: string;
  try {
    ({ email } = await requireAdmin());
  } catch {
    return NextResponse.redirect(`${base}${CONFIG_PATH}?instagram=forbidden`);
  }

  try {
    const state = signConnectState({ tenantId: null, by: email });
    return NextResponse.redirect(igAuthorizeUrl(state, `${base}/api/wa/instagram/callback`));
  } catch (err) {
    console.error("[instagram] conexão indisponível:", err);
    return NextResponse.redirect(`${base}${CONFIG_PATH}?instagram=config`);
  }
}
