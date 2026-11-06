// Estoque local do lojista que assina o atendimento: os carros do pátio dele,
// que a IA oferece primeiro. Mora na RepasseVehicle (mesma tabela dos usados,
// com `lojistaId`), não numa tabela paralela, e fica fora da vitrine.
// A concessionária não usa isto: o estoque dela já é o 0km e o repasse.
//
// A lista traz todos os carros ativos (de qualquer situação): a tela mostra
// vendido e pausado também, e o painel do topo conta só os disponíveis.
// Cadastrar é do gestor; ver é de toda a equipe.

import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import RepasseVehicle from "@/models/RepasseVehicle";
import { parseRepasseFipe, validateRepasse } from "@/lib/utils/repasse";
import { lojistaDoEscopo, serializarCarroLocal } from "@wa/lib/estoque-local";
import { validarFichaLocal, type SituacaoCarro } from "@wa/lib/estoque-ficha";
import { scopeError } from "@wa/lib/scope";

export const dynamic = "force-dynamic";

function erro(err: unknown) {
  const { error, status } = scopeError(err);
  return NextResponse.json({ error }, { status });
}

export async function GET() {
  let lojistaId;
  try {
    ({ lojistaId } = await lojistaDoEscopo(false));
  } catch (err) {
    return erro(err);
  }
  await dbConnect();
  const docs = await RepasseVehicle.find({ lojistaId, ativo: true }).sort({ updatedAt: -1 }).limit(500).lean();
  return NextResponse.json({ items: docs.map(serializarCarroLocal) });
}

export async function POST(req: NextRequest) {
  let lojistaId;
  let email: string;
  try {
    const r = await lojistaDoEscopo(true);
    lojistaId = r.lojistaId;
    email = r.scope.email;
  } catch (err) {
    return erro(err);
  }
  const body = ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  // O "status" do repasse não vale para o pátio: a situação é outro campo.
  const { status: _status, ...semStatus } = body;
  void _status;
  const base = validateRepasse(semStatus, false);
  const ficha = validarFichaLocal(body, false);
  const errors = [...base.errors, ...ficha.errors];
  if (errors.length) return NextResponse.json({ error: errors.join(" "), errors }, { status: 400 });
  const fipe = parseRepasseFipe(body);
  if (fipe.error) return NextResponse.json({ error: fipe.error }, { status: 400 });

  await dbConnect();
  const created = await RepasseVehicle.create({
    ...base.data,
    ...ficha.data,
    situacao: (ficha.data.situacao as SituacaoCarro | undefined) ?? "disponivel",
    situacaoEm: new Date(),
    // O lojista digita o carro dele como quiser; o vínculo FIPE é opcional.
    foraDoCatalogo: !fipe.codigoFipe,
    ...(fipe.codigoFipe ? { codigoFipe: fipe.codigoFipe, descricaoFipe: fipe.descricaoFipe || undefined } : {}),
    lojistaId,
    createdBy: email,
  });
  return NextResponse.json(serializarCarroLocal(created), { status: 201 });
}
