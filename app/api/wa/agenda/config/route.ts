// Configuração da agenda da loja: dias e horários de visita, duração,
// intervalo, quantas visitas ao mesmo tempo e o lembrete da véspera (com o
// template para quando a janela de 24h estiver fechada).
//
// É da agenda, não do horário de atendimento da loja. Sem configuração
// gravada, a IA não oferece horário (agenda o que o cliente pediu, a
// confirmar) e o lembrete usa o padrão (ligado, sem template).
// Ver: qualquer um da equipe. Gravar: gestor.

import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { WaAgendaConfig } from "@wa/models/agenda";
import { requireScope, requireScopeAdmin, scopeError, type Scope } from "@wa/lib/scope";
import { CONFIG_PADRAO, validarConfig } from "@wa/lib/agenda";
import { configDaAgenda } from "@wa/lib/agenda-server";

export const dynamic = "force-dynamic";

export async function GET() {
  let scope: Scope;
  try {
    scope = await requireScope("agenda");
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
  const config = await configDaAgenda(scope.tenantId);
  return NextResponse.json({ config, padrao: CONFIG_PADRAO, podeEditar: scope.role === "admin" });
}

export async function PUT(req: NextRequest) {
  let scope: Scope;
  try {
    scope = await requireScopeAdmin("agenda");
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
  const body = await req.json().catch(() => ({}));
  const { config, errors } = validarConfig(body);
  if (errors.length) return NextResponse.json({ error: errors.join(" "), errors }, { status: 400 });
  await dbConnect();
  await WaAgendaConfig.updateOne(
    { tenantId: scope.tenantId },
    { $set: { ...config, tenantId: scope.tenantId, atualizadoPor: scope.email } },
    { upsert: true },
  );
  return NextResponse.json({ config });
}
