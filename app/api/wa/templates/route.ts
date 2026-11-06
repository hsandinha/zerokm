// Templates do WABA: listar, criar (submetendo direto para a Meta) e excluir.
//
// O objetivo é o CNV e as lojas não precisarem entrar na Business Manager.
// A aprovação continua sendo da Meta — o template nasce PENDING e a tela
// mostra o status e, quando recusado, o motivo. Cabeçalho de mídia leva uma
// amostra (o gateway baixa pelo link assinado de /api/wa/midia/[id]).

import { NextRequest, NextResponse } from "next/server";
import { requireScope, requireScopeAdmin } from "@wa/lib/scope";
import { wabaCredentialsOf } from "@wa/lib/channels";
import {
  createTemplate,
  deleteTemplate,
  formaDoTemplate,
  listTemplates,
  validateTemplateDraft,
  podeUsarTemplates,
  tipoDoHeader,
  type TemplateDraft,
  type TemplateDraftButton,
} from "@wa/lib/meta";
import { linkDaMidia, midiaDoDono, tipoDaMidia } from "@wa/lib/midia-saida";
import { siteUrl } from "@wa/lib/site-url";

/** Sem WhatsApp conectado: a loja conecta na Configuração; o CNV, em IA & WABA. */
function semWhatsapp(tenantId: string | null): string {
  return tenantId
    ? "Conecte o WhatsApp da loja em Configuração para usar templates."
    : "WhatsApp do CNV não conectado: conecte em IA & WABA para usar templates.";
}

export const maxDuration = 60;

/** Botões vindos da tela, saneados: tipo desconhecido sai, campos viram texto. */
function botoesDoPedido(raw: unknown): TemplateDraftButton[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const out: TemplateDraftButton[] = [];
  for (const b of raw as Array<Record<string, unknown>>) {
    if (!b || typeof b !== "object") continue;
    if (b.type === "QUICK_REPLY") out.push({ type: "QUICK_REPLY", text: texto(b.text) });
    else if (b.type === "URL") {
      out.push({ type: "URL", text: texto(b.text), url: texto(b.url), ...(texto(b.example) ? { example: texto(b.example) } : {}) });
    } else if (b.type === "PHONE_NUMBER") {
      out.push({ type: "PHONE_NUMBER", text: texto(b.text), phone_number: texto(b.phone_number) });
    }
  }
  return out.length > 0 ? out : undefined;
}

export async function GET() {
  let tenantId: string | null;
  try {
    // Ver a lista é inofensivo e as Campanhas dependem dela; criar e
    // excluir template na Meta, não.
    ({ tenantId } = await requireScope("campanhas"));
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  // Templates são do WABA de quem está operando (CNV ou loja).
  const creds = await wabaCredentialsOf(tenantId);
  if (!podeUsarTemplates(creds)) {
    return NextResponse.json({ templates: [], error: semWhatsapp(tenantId) });
  }

  try {
    const templates = await listTemplates(creds);
    return NextResponse.json({
      templates: templates.map((t) => {
        const body = t.components?.find((c) => c.type === "BODY");
        const forma = formaDoTemplate(t);
        return {
          id: t.id,
          name: t.name,
          status: t.status,
          language: t.language,
          category: t.category,
          body: body?.text ?? "",
          variables: forma.bodyVars,
          // Os exemplos submetidos à Meta viram placeholder de cada {{n}} na tela.
          examples: body?.example?.body_text?.[0] ?? [],
          // Texto do cabeçalho (só no formato TEXT; com {{1}} quando tem variável).
          header: forma.headerText,
          // O que o envio precisa além do corpo. headerFormat null = sem
          // cabeçalho; IMAGE/VIDEO/DOCUMENT pedem o arquivo em cada envio;
          // TEXT com headerVariables 1 pede o valor do {{1}}.
          headerFormat: forma.headerFormat,
          headerVariables: forma.headerVars,
          headerExample: forma.headerExample,
          // Botões de link dinâmico: cada envio completa o final da URL.
          // `index` é a posição do botão entre todos (o que vai no envio).
          buttonVariables: forma.botoesUrl,
          footer: t.components?.find((c) => c.type === "FOOTER")?.text ?? null,
          buttons: (t.components?.find((c) => c.type === "BUTTONS")?.buttons ?? []).map((b) => ({
            type: b.type,
            text: b.text,
            url: b.url,
            phone_number: b.phone_number,
          })),
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
  let tenantId: string | null;
  try {
    ({ tenantId } = await requireScopeAdmin("campanhas"));
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Partial<TemplateDraft> & {
    /** Amostra do cabeçalho de mídia (POST /api/wa/campaigns/midia com uso=amostra). */
    headerMidiaId?: string;
  };
  const headerFormat =
    body.headerFormat === "IMAGE" || body.headerFormat === "VIDEO" || body.headerFormat === "DOCUMENT"
      ? body.headerFormat
      : undefined;

  // A amostra precisa ser da mesma loja e do tipo do cabeçalho. O gateway
  // baixa pelo link público assinado e manda para a Meta.
  let headerSampleUrl: string | undefined;
  if (headerFormat) {
    const doc = body.headerMidiaId ? await midiaDoDono(body.headerMidiaId, tenantId) : null;
    if (!doc) {
      return NextResponse.json({ errors: ["Anexe o arquivo de amostra do cabeçalho."] }, { status: 400 });
    }
    if (tipoDaMidia(doc.mime) !== tipoDoHeader(headerFormat)) {
      return NextResponse.json({ errors: ["A amostra não é do tipo do cabeçalho escolhido."] }, { status: 400 });
    }
    headerSampleUrl = linkDaMidia(siteUrl(req), body.headerMidiaId!);
  }

  const draft: TemplateDraft = {
    name: (body.name ?? "").trim().toLowerCase(),
    language: body.language?.trim() || "pt_BR",
    category: body.category === "UTILITY" ? "UTILITY" : "MARKETING",
    headerFormat: headerFormat ?? (body.headerText?.trim() ? "TEXT" : undefined),
    headerText: headerFormat ? undefined : body.headerText?.trim() || undefined,
    headerSampleUrl,
    body: body.body ?? "",
    footerText: body.footerText?.trim() || undefined,
    buttons: botoesDoPedido(body.buttons),
    bodyExamples: body.bodyExamples,
    headerExample: headerFormat ? undefined : body.headerExample,
  };

  // Valida antes de gastar uma submissão: rejeição da Meta demora e queima o
  // nome, que não pode ser reaproveitado enquanto o template existir.
  const errors = validateTemplateDraft(draft);
  if (errors.length > 0) return NextResponse.json({ errors }, { status: 400 });

  // Templates são do WABA de quem está operando (CNV ou loja).
  const creds = await wabaCredentialsOf(tenantId);
  if (!podeUsarTemplates(creds)) {
    return NextResponse.json({ errors: [semWhatsapp(tenantId)] }, { status: 400 });
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
  let tenantId: string | null;
  try {
    ({ tenantId } = await requireScopeAdmin("campanhas"));
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const name = req.nextUrl.searchParams.get("name");
  if (!name) return NextResponse.json({ error: "Informe o nome do template" }, { status: 400 });

  // Templates são do WABA de quem está operando (CNV ou loja).
  const creds = await wabaCredentialsOf(tenantId);
  if (!podeUsarTemplates(creds)) {
    return NextResponse.json({ error: semWhatsapp(tenantId) }, { status: 400 });
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
