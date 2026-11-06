// Público da campanha para o assistente, no escopo de quem opera (loja ou
// CNV): os contatos, as colunas do funil e os contatos de uma coluna. A
// rota /campaigns/audience continua sendo a da prospecção do CNV (base de
// empresas e Procob), que loja não enxerga.
//
//   GET ?fonte=contatos[&janela24h=1][&origem=whatsapp]
//   GET ?fonte=colunas
//   GET ?fonte=coluna&coluna=<id>
//
// Só leitura de banco: montar a audiência não gasta nada.

import { NextRequest, NextResponse } from "next/server";
import { podeUsar, requireScopeAdmin, scopeError, type Scope } from "@wa/lib/scope";
import { FunilError } from "@wa/lib/funil";
import {
  colunasComContagem,
  contatosDaColuna,
  contatosDaLoja,
  ORIGENS_DE_CONTATO,
} from "@wa/lib/campaign-audience";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  let scope: Scope;
  try {
    scope = await requireScopeAdmin("campanhas");
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }

  const sp = req.nextUrl.searchParams;
  const fonte = sp.get("fonte") ?? "contatos";

  try {
    if (fonte === "contatos") {
      const r = await contatosDaLoja(scope.tenantId, {
        janela24h: sp.get("janela24h") === "1",
        origem: sp.get("origem"),
      });
      return NextResponse.json({ fonte, ...r, total: r.pessoas.length, origens: ORIGENS_DE_CONTATO });
    }

    // O funil é uma funcionalidade à parte: loja sem ele não escolhe coluna.
    if (!podeUsar(scope, "funil")) {
      return NextResponse.json({ error: "O funil não está liberado para esta loja." }, { status: 403 });
    }
    if (fonte === "colunas") {
      return NextResponse.json({ fonte, colunas: await colunasComContagem(scope.tenantId) });
    }
    if (fonte === "coluna") {
      const id = sp.get("coluna");
      if (!id) return NextResponse.json({ error: "Escolha a coluna do funil." }, { status: 400 });
      const r = await contatosDaColuna(scope.tenantId, id);
      return NextResponse.json({ fonte, ...r, total: r.pessoas.length });
    }
    return NextResponse.json({ error: "Fonte desconhecida." }, { status: 400 });
  } catch (err) {
    if (err instanceof FunilError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
