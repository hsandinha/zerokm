// "Nova conversa": digita o número, escolhe o template aprovado e envia.

import { NextRequest, NextResponse } from "next/server";
import { requireScope, type Scope } from "@wa/lib/scope";
import { MetaApiError } from "@wa/lib/meta";
import { OutreachError, sendTemplateOutreach } from "@wa/lib/outreach";
import { autorDoEscopo, carimbarAutor } from "@wa/lib/central";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let user: Scope;
  try {
    user = await requireScope();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    phone?: string;
    name?: string | null;
    templateName?: string;
    language?: string;
    params?: string[];
    headerText?: string | null;
    headerMediaId?: string | null;
    buttonUrlParams?: Array<{ index: number; value: string }>;
  };
  if (!body.phone?.trim()) return NextResponse.json({ error: "Informe o telefone" }, { status: 400 });
  if (!body.templateName?.trim()) {
    return NextResponse.json({ error: "Escolha um template" }, { status: 400 });
  }

  try {
    const desde = new Date();
    const result = await sendTemplateOutreach({
      phone: body.phone,
      name: body.name ?? null,
      templateName: body.templateName.trim(),
      language: body.language,
      params: Array.isArray(body.params) ? body.params : [],
      userEmail: user.email,
      tenantId: user.tenantId,
      // Cabeçalho e botão de link: o arquivo é conferido como da mesma loja.
      headerText: typeof body.headerText === "string" ? body.headerText : null,
      headerMediaId: typeof body.headerMediaId === "string" ? body.headerMediaId : null,
      buttonUrlParams: Array.isArray(body.buttonUrlParams)
        ? body.buttonUrlParams
            .filter((b) => b && Number.isInteger(b.index) && typeof b.value === "string")
            .map((b) => ({ index: b.index, value: b.value }))
        : undefined,
    });
    // O template sai por wa/lib/outreach.ts, que não recebe o autor.
    await carimbarAutor(result.conversationId, autorDoEscopo(user), desde);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof OutreachError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof MetaApiError) {
      return NextResponse.json({ error: `A Meta recusou o envio: ${err.message}` }, { status: 502 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao enviar" },
      { status: 500 },
    );
  }
}
