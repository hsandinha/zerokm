// "Nova conversa": digita o número, escolhe o template aprovado e envia.

import { NextRequest, NextResponse } from "next/server";
import { requirePanelUser, type PanelUser } from "@wa/lib/auth";
import { MetaApiError } from "@wa/lib/meta";
import { OutreachError, sendTemplateOutreach } from "@wa/lib/outreach";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let user: PanelUser;
  try {
    user = await requirePanelUser();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    phone?: string;
    name?: string | null;
    templateName?: string;
    language?: string;
    params?: string[];
  };
  if (!body.phone?.trim()) return NextResponse.json({ error: "Informe o telefone" }, { status: 400 });
  if (!body.templateName?.trim()) {
    return NextResponse.json({ error: "Escolha um template" }, { status: 400 });
  }

  try {
    const result = await sendTemplateOutreach({
      phone: body.phone,
      name: body.name ?? null,
      templateName: body.templateName.trim(),
      language: body.language,
      params: Array.isArray(body.params) ? body.params : [],
      userEmail: user.email,
    });
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
