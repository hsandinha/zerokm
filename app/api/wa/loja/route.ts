// Configuração da loja (gestor): IA (provedor, modelo, chave da própria loja,
// prompt), financiamento, endereço, se revende a rede CNV e a equipe. A chave
// é cifrada antes de ir para o banco e nunca volta em claro.
//
// O CNV não passa por aqui — a Vera tem a tela IA & WABA (/api/wa/settings).

import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { WaStore, type AiProvider, type StoreRole } from "@wa/models/store";
import { requireScope, requireScopeAdmin, type Scope } from "@wa/lib/scope";
import { encrypt } from "@wa/lib/crypto";
import { storeAccess } from "@wa/lib/store";
import { DEFAULT_STORE_PROMPT, STORE_PROMPT_VARS } from "@wa/lib/ai-loja";
import { CLAUDE_DEFAULT_MODEL } from "@wa/lib/llm-claude";

const PROVIDERS: AiProvider[] = ["gemini", "openai", "claude"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function lojaDoEscopo(scope: Scope) {
  if (!scope.tenantId) return null;
  await dbConnect();
  return WaStore.findById(scope.tenantId);
}

export async function GET() {
  let scope: Scope;
  try {
    scope = await requireScope();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const store = await lojaDoEscopo(scope);
  if (!store) return NextResponse.json({ error: "Só para lojas" }, { status: 404 });

  return NextResponse.json({
    id: String(store._id),
    kind: store.kind,
    name: store.name,
    role: scope.role,
    access: storeAccess(store),
    ai: {
      active: store.ai?.active ?? false,
      assistantName: store.ai?.assistantName ?? "",
      provider: store.ai?.provider ?? "gemini",
      model: store.ai?.model ?? "",
      hasToken: Boolean(store.ai?.token),
      systemPrompt: store.ai?.systemPrompt ?? "",
      knowledgeBase: store.ai?.knowledgeBase ?? "",
      greeting: store.ai?.greeting ?? "",
      extraInstructions: store.ai?.extraInstructions ?? "",
      maxTurns: store.ai?.maxTurns ?? 30,
      vendeEstoqueCnv: store.ai?.vendeEstoqueCnv ?? false,
    },
    financiamento: {
      ativo: store.financiamento?.ativo ?? false,
      taxaMensal: store.financiamento?.taxaMensal ?? 1.99,
      entradaMinimaPct: store.financiamento?.entradaMinimaPct ?? 20,
      prazos: store.financiamento?.prazos ?? [24, 36, 48, 60],
      observacao: store.financiamento?.observacao ?? "",
    },
    mapsUrl: store.mapsUrl ?? "",
    members: store.members.map((m) => ({ email: m.email, name: m.name ?? null, role: m.role })),
    defaults: {
      systemPrompt: DEFAULT_STORE_PROMPT,
      promptVars: STORE_PROMPT_VARS,
      models: { gemini: "gemini-3.5-flash", openai: "gpt-4.1-mini", claude: CLAUDE_DEFAULT_MODEL },
    },
  });
}

export async function PUT(req: NextRequest) {
  let scope: Scope;
  try {
    scope = await requireScopeAdmin();
  } catch (err) {
    const status = (err as { status?: number }).status ?? 401;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Não autorizado" }, { status });
  }
  const store = await lojaDoEscopo(scope);
  if (!store) return NextResponse.json({ error: "Só para lojas" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const ai = (body.ai ?? {}) as Record<string, unknown>;
  const fin = (body.financiamento ?? {}) as Record<string, unknown>;
  const texto = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);

  if (typeof ai.active === "boolean") store.ai.active = ai.active;
  if (typeof ai.assistantName === "string" && ai.assistantName.trim()) {
    store.ai.assistantName = ai.assistantName.trim().slice(0, 40);
  }
  if (PROVIDERS.includes(ai.provider as AiProvider)) store.ai.provider = ai.provider as AiProvider;
  if (typeof ai.model === "string") store.ai.model = ai.model.trim().slice(0, 80) || undefined;
  // Chave: só troca quando vem uma nova; "" mantém a atual.
  if (typeof ai.token === "string" && ai.token.trim()) store.ai.token = encrypt(ai.token.trim());
  if (ai.removeToken === true) store.ai.token = undefined;
  for (const k of ["systemPrompt", "knowledgeBase", "greeting", "extraInstructions"] as const) {
    const v = texto(ai[k], k === "knowledgeBase" || k === "systemPrompt" ? 20000 : 2000);
    if (v !== undefined) store.ai[k] = v;
  }
  if (typeof ai.maxTurns === "number" && ai.maxTurns >= 1 && ai.maxTurns <= 200) {
    store.ai.maxTurns = Math.round(ai.maxTurns);
  }
  if (typeof ai.vendeEstoqueCnv === "boolean") store.ai.vendeEstoqueCnv = ai.vendeEstoqueCnv;

  if (typeof fin.ativo === "boolean") store.financiamento.ativo = fin.ativo;
  const taxa = Number(fin.taxaMensal);
  if (Number.isFinite(taxa) && taxa >= 0 && taxa <= 15) store.financiamento.taxaMensal = taxa;
  const entrada = Number(fin.entradaMinimaPct);
  if (Number.isFinite(entrada) && entrada >= 0 && entrada <= 95) store.financiamento.entradaMinimaPct = entrada;
  if (Array.isArray(fin.prazos)) {
    const prazos = fin.prazos
      .map((p) => Math.round(Number(p)))
      .filter((p) => Number.isFinite(p) && p >= 1 && p <= 120);
    if (prazos.length) store.financiamento.prazos = [...new Set(prazos)].sort((a, b) => a - b).slice(0, 8);
  }
  const obs = texto(fin.observacao, 200);
  if (obs !== undefined) store.financiamento.observacao = obs;

  if (typeof body.mapsUrl === "string") {
    const url = body.mapsUrl.trim();
    if (url && !/^https:\/\//.test(url)) {
      return NextResponse.json({ error: "O link do mapa precisa começar com https://" }, { status: 400 });
    }
    store.mapsUrl = url || undefined;
  }

  if (Array.isArray(body.members)) {
    const members = (body.members as Array<Record<string, unknown>>)
      .map((m) => ({
        email: String(m.email ?? "").trim().toLowerCase(),
        name: typeof m.name === "string" ? m.name.trim().slice(0, 80) : undefined,
        role: (m.role === "gestor" ? "gestor" : "atendente") as StoreRole,
      }))
      .filter((m) => EMAIL.test(m.email));
    // Uma pessoa opera uma loja só: o vínculo decide de quem é a central dela.
    const emOutra = await WaStore.findOne({
      _id: { $ne: store._id },
      "members.email": { $in: members.map((m) => m.email) },
    })
      .select("members.email")
      .lean();
    if (emOutra) {
      const repetido = members.find((m) => emOutra.members.some((x) => x.email === m.email));
      return NextResponse.json(
        { error: `${repetido?.email ?? "Um e-mail"} já está na equipe de outra loja.` },
        { status: 409 },
      );
    }
    store.members = [...new Map(members.map((m) => [m.email, m])).values()].slice(0, 50);
  }

  await store.save();
  return NextResponse.json({ ok: true });
}
