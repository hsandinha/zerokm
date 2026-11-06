// Volta do convite do Chatrun (Messenger): o gateway devolve
// `status`, `connection_id`, `account_id` e `page_name`. A conexão é lida de novo
// no gateway (só as vinculadas à zerokm com o external_ref deste dono) e vira
// canal; os eventos connection.* fazem o mesmo, este é o caminho rápido.

import { NextRequest, NextResponse } from "next/server";
import { requireScopeAdmin } from "@wa/lib/scope";
import { configPathOf } from "@wa/lib/channels";
import { adoptReturnedAccount, syncChannels } from "@wa/lib/chatrun-account";
import { siteUrl } from "@wa/lib/site-url";

export async function GET(req: NextRequest) {
  const base = siteUrl(req);
  const sp = req.nextUrl.searchParams;
  let tenantId: string | null;
  try {
    ({ tenantId } = await requireScopeAdmin("messenger"));
  } catch {
    return NextResponse.redirect(`${base}/dashboard?messenger=forbidden`);
  }
  const back = (qs: URLSearchParams) =>
    NextResponse.redirect(`${base}${configPathOf(tenantId)}?${qs.toString()}`);

  if (sp.get("status") !== "ok") {
    const qs = new URLSearchParams({ messenger: "erro" });
    const why = sp.get("mensagem");
    if (why) qs.set("why", why);
    return back(qs);
  }

  try {
    await adoptReturnedAccount(tenantId, sp.get("account_id"), "messenger");
    const { connected, warning } = await syncChannels(tenantId, "messenger");
    const qs = new URLSearchParams({ messenger: warning || !connected ? "erro" : "ok" });
    const quem = sp.get("page_name");
    if (quem) qs.set("pagina", quem);
    if (warning) qs.set("why", warning);
    else if (!connected) qs.set("why", "o Chatrun ainda não confirmou a conexão; confira em instantes");
    return back(qs);
  } catch (err) {
    console.error("[messenger] retorno do Chatrun falhou:", err);
    const qs = new URLSearchParams({ messenger: "erro", why: err instanceof Error ? err.message : "falha no Chatrun" });
    return back(qs);
  }
}
