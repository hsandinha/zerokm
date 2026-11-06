// Operação da equipe da loja (gestor): horário de atendimento com a mensagem
// automática fora dele, distribuição automática das conversas e a meta de
// primeira resposta (SLA). Rota própria, separada de /api/wa/loja, para a
// seção salvar sozinha sem regravar a IA e a equipe.

import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { WaStore } from "@wa/models/store";
import { requireScopeAdmin, scopeError, type Scope } from "@wa/lib/scope";
import { operacaoDe } from "@wa/lib/operacao";
import {
  INTERVALO_PADRAO_HORAS,
  MENSAGEM_FORA_PADRAO,
  estadoDoHorario,
  horarioPadrao,
  normalizarHorario,
  resumoDoHorario,
  textoForaDoHorario,
  validarHorario,
} from "@wa/lib/horario";
import { SLA_MAX_MINUTOS, SLA_MIN_MINUTOS, isModoDistribuicao, slaValido } from "@wa/lib/equipe";
import { SLA_MINUTES } from "@wa/lib/stages";

export const dynamic = "force-dynamic";

async function escopo(): Promise<Scope | NextResponse> {
  try {
    const scope = await requireScopeAdmin();
    if (!scope.tenantId) return NextResponse.json({ error: "Só para lojas" }, { status: 404 });
    return scope;
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
}

function resposta(op: ReturnType<typeof operacaoDe>) {
  const agora = estadoDoHorario(op.horario);
  return {
    ...op,
    agora: { aberto: agora.aberto, quandoVolta: agora.quandoVolta },
    resumo: resumoDoHorario(op.horario),
    previa: textoForaDoHorario(op.horario),
    defaults: {
      horario: horarioPadrao(),
      mensagem: MENSAGEM_FORA_PADRAO,
      intervaloHoras: INTERVALO_PADRAO_HORAS,
      slaMinutos: SLA_MINUTES,
      slaMin: SLA_MIN_MINUTOS,
      slaMax: SLA_MAX_MINUTOS,
    },
  };
}

export async function GET() {
  const scope = await escopo();
  if (scope instanceof NextResponse) return scope;
  await dbConnect();
  const store = await WaStore.findById(scope.tenantId).select("operacao").lean();
  if (!store) return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 });
  return NextResponse.json(resposta(operacaoDe(store)));
}

export async function PUT(req: NextRequest) {
  const scope = await escopo();
  if (scope instanceof NextResponse) return scope;
  const body = (await req.json().catch(() => null)) as {
    horario?: unknown;
    distribuicao?: unknown;
    slaMinutos?: unknown;
  } | null;
  if (!body) return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });

  const erro = body.horario !== undefined ? validarHorario(body.horario) : null;
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });
  if (body.distribuicao !== undefined && !isModoDistribuicao(body.distribuicao)) {
    return NextResponse.json({ error: "Distribuição inválida" }, { status: 400 });
  }
  const sla = Number(body.slaMinutos);
  if (body.slaMinutos !== undefined && (!Number.isFinite(sla) || sla < SLA_MIN_MINUTOS || sla > SLA_MAX_MINUTOS)) {
    return NextResponse.json(
      { error: `A meta de primeira resposta vai de ${SLA_MIN_MINUTOS} a ${SLA_MAX_MINUTOS} minutos.` },
      { status: 400 },
    );
  }

  await dbConnect();
  const set: Record<string, unknown> = {};
  if (body.horario !== undefined) set["operacao.horario"] = normalizarHorario(body.horario);
  if (body.distribuicao !== undefined) set["operacao.distribuicao"] = body.distribuicao;
  if (body.slaMinutos !== undefined) set["operacao.slaMinutos"] = slaValido(sla);
  const store = await WaStore.findByIdAndUpdate(scope.tenantId, { $set: set }, { new: true })
    .select("operacao")
    .lean();
  if (!store) return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 });
  return NextResponse.json(resposta(operacaoDe(store)));
}
