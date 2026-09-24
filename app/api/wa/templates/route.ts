// Templates do WABA: listar, criar (submetendo direto para a Meta) e excluir.
//
// O objetivo é a CNV não precisar entrar na Business Manager. A
// aprovação continua sendo da Meta — o template nasce PENDING e a tela mostra
// o status e, quando recusado, o motivo.

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requirePanelUser } from "@wa/lib/auth";
import { getWabaCredentials } from "@wa/lib/settings";
import {
  createTemplate,
  deleteTemplate,
  listTemplates,
  validateTemplateDraft,
  templateVariables,
  type TemplateDraft,
} from "@wa/lib/meta";

export const maxDuration = 60;

export async function GET() {
  try {
    // Ver a lista é inofensivo e as Campanhas dependem dela; criar e
    // excluir template na Meta, não.
    await requirePanelUser();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const creds = await getWabaCredentials();
  if (!creds?.wabaId) {
    return NextResponse.json({
      templates: [],
      error: "WABA ID não configurado — preencha em IA & WABA para listar os templates.",
    });
  }

  try {
    const templates = await listTemplates(creds);
    return NextResponse.json({
      templates: templates.map((t) => {
        const body = t.components?.find((c) => c.type === "BODY");
        return {
          id: t.id,
          name: t.name,
          status: t.status,
          language: t.language,
          category: t.category,
          body: body?.text ?? "",
          variables: templateVariables(body?.text ?? "").length,
          // Os exemplos submetidos à Meta viram placeholder de cada {{n}} na tela.
          examples: body?.example?.body_text?.[0] ?? [],
          header: t.components?.find((c) => c.type === "HEADER")?.text ?? null,
          footer: t.components?.find((c) => c.type === "FOOTER")?.text ?? null,
          buttons: t.components?.find((c) => c.type === "BUTTONS")?.buttons ?? [],
          rejectedReason: t.rejected_reason ?? null,
          quality: t.quality_score?.score ?? null,
        };
      }),
    });
  } catch (err) {
    return NextResponse.json(
      { templates: [], error: err instanceof Error ? err.message : "Falha ao listar templates" },
      { status: 200 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Partial<TemplateDraft>;
  const draft: TemplateDraft = {
    name: (body.name ?? "").trim().toLowerCase(),
    language: body.language?.trim() || "pt_BR",
    category: body.category === "UTILITY" ? "UTILITY" : "MARKETING",
    headerText: body.headerText?.trim() || undefined,
    body: body.body ?? "",
    footerText: body.footerText?.trim() || undefined,
    buttons: body.buttons,
    bodyExamples: body.bodyExamples,
    headerExample: body.headerExample,
  };

  // Valida antes de gastar uma submissão: rejeição da Meta demora e queima o
  // nome, que não pode ser reaproveitado enquanto o template existir.
  const errors = validateTemplateDraft(draft);
  if (errors.length > 0) return NextResponse.json({ errors }, { status: 400 });

  const creds = await getWabaCredentials();
  if (!creds?.wabaId) {
    return NextResponse.json(
      { errors: ["WABA ID não configurado — preencha em IA & WABA."] },
      { status: 400 },
    );
  }

  try {
    const created = await createTemplate(creds, draft);
    return NextResponse.json({ template: created });
  } catch (err) {
    return NextResponse.json(
      { errors: [err instanceof Error ? err.message : "A Meta recusou a criação"] },
      { status: 400 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const name = req.nextUrl.searchParams.get("name");
  if (!name) return NextResponse.json({ error: "Informe o nome do template" }, { status: 400 });

  const creds = await getWabaCredentials();
  if (!creds?.wabaId) {
    return NextResponse.json({ error: "WABA ID não configurado" }, { status: 400 });
  }

  try {
    await deleteTemplate(creds, name);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao excluir" },
      { status: 400 },
    );
  }
}
