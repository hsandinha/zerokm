// Templates aprovados para a Central ("Nova conversa" e "Enviar template").
//
// A lista completa (/api/wa/templates) é da tela de Campanhas e exige o
// recurso "campanhas". Abrir conversa fora da janela de 24h é atendimento:
// a loja sem campanhas também precisa. Aqui só sai o que está aprovado.

import { NextResponse } from "next/server";
import { requireScope, scopeError } from "@wa/lib/scope";
import { wabaCredentialsOf } from "@wa/lib/channels";
import { formaDoTemplate, listTemplates, podeUsarTemplates, templateVariables } from "@wa/lib/meta";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  let tenantId: string | null;
  try {
    ({ tenantId } = await requireScope());
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }

  const creds = await wabaCredentialsOf(tenantId);
  if (!podeUsarTemplates(creds)) {
    return NextResponse.json({
      templates: [],
      error: tenantId
        ? "Conecte o WhatsApp da loja em Configuração para usar templates."
        : "WhatsApp do CNV não conectado: conecte em IA & WABA para usar templates.",
    });
  }

  try {
    const templates = await listTemplates(creds);
    return NextResponse.json({
      templates: templates
        .filter((t) => t.status === "APPROVED")
        .map((t) => {
          const body = t.components?.find((c) => c.type === "BODY");
          const forma = formaDoTemplate(t);
          return {
            id: t.id,
            name: t.name,
            status: t.status,
            language: t.language,
            category: t.category,
            body: body?.text ?? "",
            variables: templateVariables(body?.text ?? "").length,
            examples: body?.example?.body_text?.[0] ?? [],
            header: t.components?.find((c) => c.type === "HEADER")?.text ?? null,
            footer: t.components?.find((c) => c.type === "FOOTER")?.text ?? null,
            buttons: t.components?.find((c) => c.type === "BUTTONS")?.buttons ?? [],
            // O que o envio pede além do corpo (null = sem cabeçalho).
            headerFormat: forma.headerFormat,
            headerVariables: forma.headerVars,
            headerExample: forma.headerExample,
            buttonVariables: forma.botoesUrl,
          };
        }),
    });
  } catch (err) {
    return NextResponse.json({
      templates: [],
      error: err instanceof Error ? err.message : "Falha ao listar templates",
    });
  }
}
