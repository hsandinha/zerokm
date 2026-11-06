// Carros do pátio para escolher no agendamento (test drive de qual carro).
// Só o lojista tem pátio; a concessionária escreve o carro no campo de texto.
// Reservado entra (o cliente pode vir ver o carro que segurou); vendido e
// pausado, não.

import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import RepasseVehicle from "@/models/RepasseVehicle";
import { requireScope, scopeError, type Scope } from "@wa/lib/scope";
import { getStore } from "@wa/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  let scope: Scope;
  try {
    scope = await requireScope("agenda");
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
  const store = await getStore(scope.tenantId);
  if (!store || store.kind !== "lojista" || !store.ownerUserId || !scope.store?.recursos.estoque_local) {
    return NextResponse.json({ carros: [] });
  }
  await dbConnect();
  const docs = await RepasseVehicle.find({
    lojistaId: store.ownerUserId,
    ativo: true,
    situacao: { $nin: ["vendido", "pausado"] },
  })
    .select("marca modelo versao ano preco situacao")
    .sort({ marca: 1, modelo: 1 })
    .limit(500)
    .lean();
  return NextResponse.json({
    carros: docs.map((d) => ({
      id: String(d._id),
      titulo: [d.marca, d.modelo, d.versao, d.ano].filter(Boolean).join(" "),
      reservado: d.situacao === "reservado",
    })),
  });
}
