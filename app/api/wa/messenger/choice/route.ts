// Escolha da Página depois do login (quem administra mais de uma).
//   GET  ?id=<escolha>          → Páginas do login (sem token)
//   POST { id, pageId }         → conecta a Página escolhida
// A escolha é do dono que fez o login: o tenantId sai da sessão, nunca do
// corpo, e uma loja não enxerga a escolha de outra.

import { NextRequest, NextResponse } from "next/server";
import { requireScopeAdmin, scopeError, type Scope } from "@wa/lib/scope";
import { completeChoice, readChoice } from "@wa/lib/messenger-connect";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  let scope: Scope;
  try {
    scope = await requireScopeAdmin();
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const choice = await readChoice(id, scope.tenantId);
  if (!choice) {
    return NextResponse.json({ error: "O login venceu. Clique em Conectar de novo." }, { status: 404 });
  }
  return NextResponse.json({ pages: choice.pages, expiresAt: choice.expiresAt });
}

export async function POST(req: NextRequest) {
  let scope: Scope;
  try {
    scope = await requireScopeAdmin();
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
  const body = (await req.json().catch(() => ({}))) as { id?: unknown; pageId?: unknown };
  const id = typeof body.id === "string" ? body.id : "";
  const pageId = typeof body.pageId === "string" ? body.pageId : "";
  if (!id || !pageId) return NextResponse.json({ error: "Escolha a Página" }, { status: 400 });

  const result = await completeChoice(id, scope.tenantId, pageId);
  if (!result.ok) return NextResponse.json({ error: result.why }, { status: 400 });
  return NextResponse.json({ ok: true, page: result.page });
}
