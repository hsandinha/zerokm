// Configuração da IA + WABA (tela 1). Token/app secret são criptografados
// antes de ir para o banco e NUNCA voltam em claro na leitura.

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@wa/lib/auth";
import { getSettings, encryptSecret, getWabaCredentials } from "@wa/lib/settings";
import { fetchPhoneInfo } from "@wa/lib/meta";
import { DEFAULT_SYSTEM_PROMPT, DEFAULT_KNOWLEDGE_BASE, PROMPT_VARS } from "@wa/lib/ai";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const s = await getSettings();

  // Os IDs seguem a MESMA precedência do getWabaCredentials() (banco → env).
  // Sem isso um canal configurado só por env aparece vazio na tela, dando a
  // impressão errada de que o número não está conectado.
  const wabaPhoneNumberId = s.wabaPhoneNumberId || process.env.META_PHONE_NUMBER_ID || "";
  const wabaId = s.wabaId || process.env.META_WABA_ID || "";
  const wabaVerifyToken = s.wabaVerifyToken || process.env.META_VERIFY_TOKEN || "";

  // Estado real do canal, consultado na Meta a cada carregamento da tela.
  const creds = await getWabaCredentials().catch(() => null);
  let connection: {
    displayPhone?: string;
    verifiedName?: string;
    quality?: string;
    error?: string;
  } | null = null;
  if (creds) {
    try {
      const info = await fetchPhoneInfo(creds);
      connection = {
        displayPhone: info.display_phone_number,
        verifiedName: info.verified_name,
        quality: info.quality_rating,
      };
    } catch (err) {
      connection = { error: err instanceof Error ? err.message : "falha ao consultar a Meta" };
    }
  }

  return NextResponse.json({
    assistantName: s.assistantName,
    aiActive: s.aiActive,
    maxTurns: s.maxTurns,
    systemPrompt: s.systemPrompt ?? "",
    knowledgeBase: s.knowledgeBase ?? "",
    greeting: s.greeting ?? "",
    extraInstructions: s.extraInstructions ?? "",
    wabaPhoneNumberId,
    wabaId,
    wabaVerifyToken,
    wabaDisplayPhone: s.wabaDisplayPhone ?? "",
    connection,
    hasToken: Boolean(s.wabaToken || process.env.META_TOKEN),
    hasAppSecret: Boolean(s.wabaAppSecret || process.env.META_APP_SECRET),
    defaults: {
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      knowledgeBase: DEFAULT_KNOWLEDGE_BASE,
      promptVars: PROMPT_VARS,
    },
  });
}

export async function PUT(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const s = await getSettings();

  if (typeof body.assistantName === "string" && body.assistantName.trim()) {
    s.assistantName = body.assistantName.trim();
  }
  if (typeof body.aiActive === "boolean") s.aiActive = body.aiActive;
  if (typeof body.maxTurns === "number" && body.maxTurns > 0) s.maxTurns = body.maxTurns;
  if (typeof body.systemPrompt === "string") s.systemPrompt = body.systemPrompt;
  if (typeof body.knowledgeBase === "string") s.knowledgeBase = body.knowledgeBase;
  if (typeof body.greeting === "string") s.greeting = body.greeting;
  if (typeof body.extraInstructions === "string") s.extraInstructions = body.extraInstructions;

  if (typeof body.wabaPhoneNumberId === "string") s.wabaPhoneNumberId = body.wabaPhoneNumberId.trim();
  if (typeof body.wabaId === "string") s.wabaId = body.wabaId.trim();
  if (typeof body.wabaVerifyToken === "string") s.wabaVerifyToken = body.wabaVerifyToken.trim();
  // Token/secret: só sobrescreve quando um valor novo é enviado
  if (typeof body.wabaToken === "string" && body.wabaToken.trim()) {
    s.wabaToken = encryptSecret(body.wabaToken.trim());
  }
  if (typeof body.wabaAppSecret === "string" && body.wabaAppSecret.trim()) {
    s.wabaAppSecret = encryptSecret(body.wabaAppSecret.trim());
  }

  await s.save();

  // Valida o canal na Meta (best-effort) e guarda o número exibido
  let phoneInfo: { display_phone_number?: string; verified_name?: string; quality_rating?: string } | null = null;
  const creds = await getWabaCredentials();
  if (creds) {
    try {
      phoneInfo = await fetchPhoneInfo(creds);
      if (phoneInfo.display_phone_number) {
        s.wabaDisplayPhone = phoneInfo.display_phone_number;
        await s.save();
      }
    } catch (err) {
      phoneInfo = null;
      return NextResponse.json({
        ok: true,
        warning: `Configuração salva, mas a validação na Meta falhou: ${err instanceof Error ? err.message : err}`,
      });
    }
  }

  return NextResponse.json({ ok: true, phoneInfo });
}
