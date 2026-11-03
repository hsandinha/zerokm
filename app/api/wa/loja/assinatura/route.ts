// Assinatura do atendimento da loja: planos à venda e a situação atual.

import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Plan from "@/models/Plan";
import { requireScope } from "@wa/lib/scope";
import { getStore, storeAccess } from "@wa/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  let tenantId: string | null;
  try {
    ({ tenantId } = await requireScope());
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const store = await getStore(tenantId);
  if (!store) return NextResponse.json({ error: "Só para lojas" }, { status: 404 });

  await dbConnect();
  const planos = await Plan.find({ publico: "atendimento", active: true, especial: { $ne: true } })
    .sort({ price: 1 })
    .lean();
  return NextResponse.json({
    access: storeAccess(store),
    planos: planos.map((p) => ({
      id: String(p._id),
      name: p.name,
      description: p.description ?? "",
      price: p.price,
      annualPrice: p.annualPrice ?? null,
      features: p.features ?? [],
    })),
  });
}
