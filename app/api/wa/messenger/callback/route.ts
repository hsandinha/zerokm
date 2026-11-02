// Volta do login do Facebook: troca o código por token de longa duração,
// lista as Páginas que a pessoa autorizou e conecta. Uma Página só: conecta
// direto. Mais de uma: guarda o login por 15 minutos (wa_messenger_choices)
// e volta para a Configuração com `?messenger=escolher&escolha=<id>`, onde a
// pessoa escolhe a Página. Não depende de sessão: o `state` assinado prova de
// quem é o canal (e a escolha só é lida por esse mesmo dono).

import { NextRequest, NextResponse } from "next/server";
import { configPathOf, readConnectState } from "@wa/lib/channels";
import { fbExchangeCode, fbMe, fbMyPages } from "@wa/lib/messenger";
import { connectPage, saveChoice } from "@wa/lib/messenger-connect";
import { siteUrl } from "@wa/lib/site-url";

export async function GET(req: NextRequest) {
  const base = siteUrl(req);
  const sp = req.nextUrl.searchParams;
  const code = sp.get("code");
  const state = readConnectState(sp.get("state"));
  if (sp.get("error") || !code || !state) {
    return NextResponse.redirect(`${base}${configPathOf(state?.tenantId ?? null)}?messenger=erro`);
  }

  const qs = new URLSearchParams({ messenger: "erro" });
  try {
    const { userToken } = await fbExchangeCode(code, `${base}/api/wa/messenger/callback`);
    const [me, pages] = await Promise.all([fbMe(userToken), fbMyPages(userToken)]);
    if (!pages.length) {
      qs.set("why", "Nenhuma Página veio no login. Marque a Página quando o Facebook perguntar.");
    } else if (pages.length === 1) {
      const r = await connectPage(state.tenantId, pages[0], me.id || null);
      if (r.ok) {
        qs.set("messenger", "ok");
        qs.set("pagina", r.page);
      } else {
        qs.set("why", r.why.slice(0, 200));
      }
    } else {
      const id = await saveChoice({
        tenantId: state.tenantId,
        by: state.by,
        fbUserId: me.id || null,
        userToken,
        pages,
      });
      qs.set("messenger", "escolher");
      qs.set("escolha", id);
    }
  } catch (err) {
    console.error("[messenger] callback falhou:", err);
    qs.set("why", (err instanceof Error ? err.message : String(err)).slice(0, 140));
  }
  return NextResponse.redirect(`${base}${configPathOf(state.tenantId)}?${qs.toString()}`);
}
