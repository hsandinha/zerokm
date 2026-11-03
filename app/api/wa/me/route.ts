// Quem sou eu — usado pelo menu para esconder o que o papel não permite.
// A tela esconder é conveniência; quem barra de verdade são as rotas.
// `store` vem preenchido quando quem opera é uma loja (não o CNV).

import { NextResponse } from "next/server";
import { getScope } from "@wa/lib/scope";

export const dynamic = "force-dynamic";

export async function GET() {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({
    user: { email: scope.email, name: scope.name, role: scope.role },
    store: scope.store,
  });
}
