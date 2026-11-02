// Ativação manual da assinatura do atendimento (pagamento fora do sistema ou
// cortesia) — mesma regra do plano de repasse no CRM.
//   { acao: "ativar", planId, billingType, metodo: "manual"|"cortesia" }
//   { acao: "desativar" }

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAdmin } from "@wa/lib/auth";
import {
  aplicarAssinaturaAtendimento,
  desativarAssinaturaAtendimento,
} from "@wa/lib/assinatura-atendimento";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  let email: string;
  try {
    ({ email } = await requireAdmin());
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as {
    acao?: string;
    planId?: string;
    billingType?: string;
    metodo?: string;
  };

  if (body.acao === "desativar") {
    const store = await desativarAssinaturaAtendimento(id, email);
    if (!store) return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }
  if (body.acao !== "ativar") return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  if (!body.planId || !mongoose.isValidObjectId(body.planId)) {
    return NextResponse.json({ error: "Escolha um plano de atendimento." }, { status: 400 });
  }
  const result = await aplicarAssinaturaAtendimento({
    storeId: id,
    planId: body.planId,
    billingType: body.billingType === "annual" ? "annual" : "monthly",
    metodo: body.metodo === "cortesia" ? "cortesia" : "manual",
    por: email,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
