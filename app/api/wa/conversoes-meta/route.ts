// Eventos para a Meta (API de Conversões para mensagens) de quem opera: a
// loja ou o CNV. Só gestor; tudo filtrado pelo dono (tenantFilter).
//   GET → configuração (sem o token: só se há um salvo) e os últimos eventos
//   PUT { ativo, datasetId, token?, testEventCode, valorPadrao } → grava;
//       token em branco mantém o salvo
// O evento de cada coluna fica na própria coluna (/api/wa/funil).

import { NextRequest, NextResponse } from "next/server";
import { requireScopeAdmin, scopeError, tenantFilter, type Scope } from "@wa/lib/scope";
import {
  ConversoesMetaError,
  configDoDono,
  eventosRecentes,
  salvarConfig,
} from "@wa/lib/conversoes-meta-servidor";

export const dynamic = "force-dynamic";

async function gestor(): Promise<Scope | NextResponse> {
  try {
    return await requireScopeAdmin("funil");
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
}

export async function GET() {
  const scope = await gestor();
  if (scope instanceof NextResponse) return scope;
  const { tenantId } = tenantFilter(scope);
  const [config, eventos] = await Promise.all([configDoDono(tenantId), eventosRecentes(tenantId, 30)]);
  return NextResponse.json({ config, eventos });
}

export async function PUT(req: NextRequest) {
  const scope = await gestor();
  if (scope instanceof NextResponse) return scope;
  const { tenantId } = tenantFilter(scope);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const config = await salvarConfig(
      tenantId,
      {
        ativo: body.ativo,
        datasetId: body.datasetId,
        token: body.token,
        testEventCode: body.testEventCode,
        valorPadrao: body.valorPadrao,
      },
      scope.email,
    );
    return NextResponse.json({ ok: true, config });
  } catch (err) {
    if (err instanceof ConversoesMetaError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[conversoes-meta] salvar:", err);
    return NextResponse.json({ error: "Não foi possível salvar." }, { status: 500 });
  }
}
