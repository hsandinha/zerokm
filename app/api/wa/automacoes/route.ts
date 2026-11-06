// Automações da loja (pós-atendimento, pós-venda, aniversário): o gestor liga,
// escreve o texto e escolhe o template. GET traz as três (a que nunca foi
// salva vem com o padrão, desligada) e os envios recentes, junto com os do
// follow-up das colunas do funil.
//   PUT { tipo, ativa, espera, hora, texto, linkAvaliacao, template, templateIdioma, templateVars }

import { NextRequest, NextResponse } from "next/server";
import { requireScopeAdmin, scopeError, type Scope } from "@wa/lib/scope";
import { AutomacaoError, automacoesDoDono, enviosRecentes, salvarAutomacao } from "@wa/lib/automacoes-servidor";

export const dynamic = "force-dynamic";

async function gestor(): Promise<Scope | NextResponse> {
  try {
    return await requireScopeAdmin("automacoes");
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
}

export async function GET() {
  const scope = await gestor();
  if (scope instanceof NextResponse) return scope;
  const [automacoes, envios] = await Promise.all([
    automacoesDoDono(scope.tenantId),
    enviosRecentes(scope.tenantId),
  ]);
  return NextResponse.json({ automacoes, envios, loja: scope.store?.name ?? "CNV" });
}

export async function PUT(req: NextRequest) {
  const scope = await gestor();
  if (scope instanceof NextResponse) return scope;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const automacao = await salvarAutomacao(scope.tenantId, body.tipo, body, scope.email);
    return NextResponse.json({ ok: true, automacao });
  } catch (err) {
    if (err instanceof AutomacaoError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
