// Horários livres de um dia, para o modal de agendamento sugerir (a mesma
// conta que a IA usa em horarios_livres). Sem configuração da agenda, não há
// sugestão: a equipe digita o horário.
//
// GET ?data=AAAA-MM-DD &duracao=60 &exceto=<id do agendamento em edição>

import { NextRequest, NextResponse } from "next/server";
import { requireScope, scopeError, type Scope } from "@wa/lib/scope";
import { agendaComHorarios, horariosLivresDaLoja } from "@wa/lib/agenda-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  let scope: Scope;
  try {
    scope = await requireScope("agenda");
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
  const sp = req.nextUrl.searchParams;
  const data = sp.get("data") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return NextResponse.json({ error: "Data inválida" }, { status: 400 });
  const config = await agendaComHorarios(scope.tenantId);
  if (!config) return NextResponse.json({ configurada: false, horas: [] });
  const duracao = Number(sp.get("duracao")) || undefined;
  const [dia] = await horariosLivresDaLoja({
    tenantId: scope.tenantId,
    config,
    dias: [data],
    duracaoMin: duracao,
    exceto: sp.get("exceto"),
    // A equipe pode marcar para daqui a pouco: sem a antecedência da IA.
    agora: Date.now() - config.antecedenciaMin * 60_000,
  });
  return NextResponse.json({ configurada: true, horas: dia?.horas ?? [] });
}
