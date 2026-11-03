// Estoque local do lojista que assina o atendimento: os carros do pátio dele,
// que a IA oferece primeiro. Mora na RepasseVehicle (mesma tabela dos usados,
// com `lojistaId`), não numa tabela paralela — e fica fora da vitrine.
// A concessionária não usa isto: o estoque dela já é o 0km e o repasse.

import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import RepasseVehicle from "@/models/RepasseVehicle";
import { parseRepasseFipe, serializeRepasse, validateRepasse } from "@/lib/utils/repasse";
import { lojistaDoEscopo } from "@wa/lib/estoque-local";

function erro(err: unknown) {
  const status = (err as { status?: number }).status ?? 401;
  return NextResponse.json({ error: err instanceof Error ? err.message : "Não autorizado" }, { status });
}

export async function GET() {
  let lojistaId;
  try {
    ({ lojistaId } = await lojistaDoEscopo(false));
  } catch (err) {
    return erro(err);
  }
  await dbConnect();
  const docs = await RepasseVehicle.find({ lojistaId, ativo: true }).sort({ updatedAt: -1 }).limit(500);
  return NextResponse.json({ items: docs.map(serializeRepasse) });
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
  const body = await req.json().catch(() => ({}));
  const { data, errors } = validateRepasse(body, false);
  if (errors.length) return NextResponse.json({ error: errors.join(" "), errors }, { status: 400 });
  const fipe = parseRepasseFipe(body);
  if (fipe.error) return NextResponse.json({ error: fipe.error }, { status: 400 });

  await dbConnect();
  const created = await RepasseVehicle.create({
    ...data,
    // O lojista digita o carro dele como quiser; o vínculo FIPE é opcional.
    foraDoCatalogo: !fipe.codigoFipe,
    ...(fipe.codigoFipe ? { codigoFipe: fipe.codigoFipe, descricaoFipe: fipe.descricaoFipe || undefined } : {}),
    lojistaId,
    createdBy: email,
  });
  return NextResponse.json(serializeRepasse(created), { status: 201 });
}
