// Quem sou eu — usado pelo menu para esconder o que o papel não permite.
// A tela esconder é conveniência; quem barra de verdade são as rotas.

import { NextResponse } from "next/server";
import { getPanelUser } from "@wa/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getPanelUser();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user });
}
