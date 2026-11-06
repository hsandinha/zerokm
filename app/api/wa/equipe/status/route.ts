// Status de quem atende (Online, Pausa, Ausente) e o sinal de vida da
// moldura do painel. O navegador manda um POST por minuto, ao voltar para a
// aba e ao ganhar ou perder o foco; sem sinal por 3 minutos a pessoa conta
// como Ausente (wa/lib/equipe.ts). Quem está Online numa loja com rodízio
// puxa a fila parada (wa/lib/fila.ts, distribuirFila).

import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { WaAtendente, type IWaAtendente } from "@wa/models/operacao";
import { requireScope, scopeError, type Scope } from "@wa/lib/scope";
import { isStatusAtendente, MOTIVOS_DE_PAUSA, statusEfetivo, type StatusAtendente } from "@wa/lib/equipe";
import { operacaoDaLoja } from "@wa/lib/operacao";
import { estadoDoHorario } from "@wa/lib/horario";
import { distribuirFila } from "@wa/lib/fila";

export const dynamic = "force-dynamic";

async function escopo(): Promise<Scope | NextResponse> {
  try {
    return await requireScope();
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
}

async function resposta(scope: Scope, me: Pick<IWaAtendente, "status" | "pausaMotivo" | "statusDesde" | "vistoEm"> | null) {
  const op = await operacaoDaLoja(scope.tenantId);
  const horario = estadoDoHorario(op.horario);
  return {
    status: me ? statusEfetivo(me) : "ausente",
    pausaMotivo: me?.status === "pausa" ? (me.pausaMotivo ?? null) : null,
    statusDesde: me?.statusDesde ?? null,
    distribuicao: op.distribuicao,
    horario: { ativo: op.horario.ativo, aberto: horario.aberto, quandoVolta: horario.quandoVolta },
    motivosDePausa: MOTIVOS_DE_PAUSA,
  };
}

export async function GET() {
  const scope = await escopo();
  if (scope instanceof NextResponse) return scope;
  await dbConnect();
  const me = await WaAtendente.findOne({ tenantId: scope.tenantId, email: scope.email }).lean();
  return NextResponse.json(await resposta(scope, me));
}

export async function POST(req: NextRequest) {
  const scope = await escopo();
  if (scope instanceof NextResponse) return scope;
  const body = ((await req.json().catch(() => null)) ?? {}) as { status?: unknown; motivo?: unknown; foco?: unknown };
  if (body.status !== undefined && !isStatusAtendente(body.status)) {
    return NextResponse.json({ error: "Status inválido" }, { status: 400 });
  }
  const novo = body.status as StatusAtendente | undefined;
  const motivo =
    novo === "pausa" && typeof body.motivo === "string" ? body.motivo.trim().slice(0, 60) || null : null;
  const agora = new Date();
  await dbConnect();

  const filtro = { tenantId: scope.tenantId, email: scope.email };
  type Linha = Pick<IWaAtendente, "status" | "pausaMotivo" | "statusDesde" | "vistoEm" | "nome">;
  let me: Linha | null = await WaAtendente.findOne(filtro).lean();
  if (!me) {
    try {
      // Primeira vez: quem atende entra Online; o gestor entra Ausente (dono
      // que só olha o painel não começa a receber conversa sem querer).
      const criado = await WaAtendente.create({
        ...filtro,
        nome: scope.name ?? null,
        status: novo ?? (scope.role === "admin" ? "ausente" : "online"),
        pausaMotivo: motivo,
        vistoEm: agora,
        statusDesde: agora,
        foco: body.foco === true,
      });
      me = criado.toObject() as Linha;
    } catch (err) {
      if ((err as { code?: number })?.code !== 11000) throw err;
      me = await WaAtendente.findOne(filtro).lean();
    }
  } else {
    const set: Record<string, unknown> = { vistoEm: agora, foco: body.foco === true };
    if (scope.name && scope.name !== me.nome) set.nome = scope.name;
    if (novo) {
      if (novo !== me.status) set.statusDesde = agora;
      set.status = novo;
      set.pausaMotivo = motivo;
    }
    me = await WaAtendente.findOneAndUpdate(filtro, { $set: set }, { new: true }).lean();
  }

  // Online numa loja com rodízio: puxa a fila parada para quem está aqui.
  if (scope.tenantId && me && statusEfetivo(me) === "online") {
    await distribuirFila(scope.tenantId).catch((err) => console.error("[equipe] distribuição:", err));
  }
  return NextResponse.json(await resposta(scope, me));
}
