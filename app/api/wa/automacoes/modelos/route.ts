// Templates aprovados que servem para mensagem automática (follow-up do
// funil e automações): sem mídia no cabeçalho e sem link dinâmico, porque a
// automação não tem o arquivo nem o final do link. A variável do cabeçalho de
// texto, quando houver, recebe o primeiro nome.
//
// Não depende de "Campanhas": a loja pode ter automações sem disparo.

import { NextResponse } from "next/server";
import { requireScopeAdmin, scopeError, type Scope } from "@wa/lib/scope";
import { wabaCredentialsOf } from "@wa/lib/channels";
import { formaDoTemplate, headerDeMidia, listTemplates, podeUsarTemplates } from "@wa/lib/meta";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  let scope: Scope;
  try {
    scope = await requireScopeAdmin("automacoes");
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
  const creds = await wabaCredentialsOf(scope.tenantId);
  if (!podeUsarTemplates(creds)) {
    return NextResponse.json({
      templates: [],
      aviso: scope.tenantId
        ? "Conecte o WhatsApp da loja em Configuração para usar templates."
        : "WhatsApp do CNV não conectado.",
    });
  }
  try {
    const lista = await listTemplates(creds);
    const templates = lista
      .filter((t) => t.status === "APPROVED")
      .map((t) => ({ t, forma: formaDoTemplate(t) }))
      .filter(({ forma }) => !headerDeMidia(forma.headerFormat) && forma.headerFormat !== "LOCATION" && forma.botoesUrl.length === 0)
      .map(({ t, forma }) => ({
        name: t.name,
        language: t.language,
        category: t.category,
        body: forma.body,
        bodyVars: forma.bodyVars,
      }));
    return NextResponse.json({ templates });
  } catch (err) {
    return NextResponse.json({
      templates: [],
      aviso: err instanceof Error ? `Não foi possível ler os templates: ${err.message}` : "Não foi possível ler os templates.",
    });
  }
}
