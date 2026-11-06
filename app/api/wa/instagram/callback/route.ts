// Volta do convite do Chatrun (Instagram): o gateway devolve
// `status`, `connection_id`, `account_id` e `ig_username`. A conexão é lida de novo
// no gateway (só as vinculadas à zerokm com o external_ref deste dono) e vira
// canal; os eventos connection.* fazem o mesmo, este é o caminho rápido.

import { NextRequest, NextResponse } from "next/server";
import { requireScopeAdmin } from "@wa/lib/scope";
import { configPathOf } from "@wa/lib/channels";
import { saveAccount, syncChannels } from "@wa/lib/chatrun-account";
import { siteUrl } from "@wa/lib/site-url";

export async function GET(req: NextRequest) {
  const base = siteUrl(req);
  const sp = req.nextUrl.searchParams;
  let tenantId: string | null;
  try {
    ({ tenantId } = await requireScopeAdmin("instagram"));
  } catch {
    return NextResponse.redirect(`${base}/dashboard?instagram=forbidden`);
  }
  const back = (qs: URLSearchParams) =>
    NextResponse.redirect(`${base}${configPathOf(tenantId)}?${qs.toString()}`);

  if (sp.get("status") !== "ok") {
    const qs = new URLSearchParams({ instagram: "erro" });
    const why = sp.get("mensagem");
    if (why) qs.set("why", why);
    return back(qs);
  }

  try {
    const accountId = sp.get("account_id");
    if (accountId) await saveAccount(tenantId, accountId);
    const { connected, warning } = await syncChannels(tenantId, "instagram");
    const qs = new URLSearchParams({ instagram: warning || !connected ? "erro" : "ok" });
    const quem = sp.get("ig_username");
    if (quem) qs.set("ig", quem);
    if (warning) qs.set("why", warning);
    else if (!connected) qs.set("why", "o Chatrun ainda não confirmou a conexão; confira em instantes");
    return back(qs);
  } catch (err) {
    console.error("[instagram] retorno do Chatrun falhou:", err);
    const qs = new URLSearchParams({ instagram: "erro", why: err instanceof Error ? err.message : "falha no Chatrun" });
    return back(qs);
  }
}
