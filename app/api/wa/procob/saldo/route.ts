// Saldo da Procob para o header.
//
// A Procob não tem rota de recarga — recarga é comercial. O que a API dá é o
// saldo, e `/consultas/teste` devolve o envelope **sem debitar**. Então isto
// não custa consulta; mas custa uma requisição do proxy de IP fixo, que tem
// cota mensal. Por isso a leitura sai do banco e só vai à Procob com
// `?refresh=1` — o clique explícito no indicador.

import { NextRequest, NextResponse } from "next/server";
import { requirePanelUser } from "@wa/lib/auth";
import { getBalance } from "@wa/lib/procob";

export const dynamic = "force-dynamic";
export const maxDuration = 40;

export async function GET(req: NextRequest) {
  let user;
  try {
    user = await requirePanelUser();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  // Saldo é dado da conta e só o admin gasta consulta — para o operador o
  // número é ruído.
  if (user.role !== "admin") return NextResponse.json({ balance: null });

  const refresh = req.nextUrl.searchParams.get("refresh") === "1";
  return NextResponse.json({ balance: await getBalance({ refresh }) });
}
