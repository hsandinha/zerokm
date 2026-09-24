// API pública — iniciar (ou reabrir) conversa com template aprovado.
//   POST { phone, name?, templateName, language?, params?: string[] }

import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@wa/lib/api-keys";
import { sendTemplateOutreach } from "@wa/lib/outreach";
import { apiError } from "@wa/lib/public-api";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const caller = await requireApiKey(req);
    const body = (await req.json().catch(() => ({}))) as {
      phone?: string;
      name?: string | null;
      templateName?: string;
      language?: string;
      params?: string[];
    };
    if (!body.phone?.trim()) return NextResponse.json({ error: "Informe phone" }, { status: 400 });
    if (!body.templateName?.trim()) {
      return NextResponse.json({ error: "Informe templateName" }, { status: 400 });
    }

    const result = await sendTemplateOutreach({
      phone: body.phone,
      name: body.name ?? null,
      templateName: body.templateName.trim(),
      language: body.language,
      params: Array.isArray(body.params) ? body.params.map(String) : [],
      userEmail: `api:${caller.name}`,
    });
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (err) {
    return apiError(err);
  }
}
