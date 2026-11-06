// Consulta à FIPE para o cadastro do carro do pátio. A rota do catálogo
// (/api/catalog/fipe) é só da equipe interna e da concessionária; o lojista
// que cadastra o próprio pátio usa esta, com as mesmas regras de caminho
// (lib/services/fipeService.ts valida cada parâmetro antes de ir ao provedor).

import { NextRequest, NextResponse } from "next/server";
import { fipePath, queryFipe } from "@/lib/services/fipeService";
import { lojistaDoEscopo } from "@wa/lib/estoque-local";
import { scopeError } from "@wa/lib/scope";

export async function GET(req: NextRequest) {
  try {
    await lojistaDoEscopo(true);
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
  const params = req.nextUrl.searchParams;
  try {
    fipePath(params);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
  try {
    return NextResponse.json(await queryFipe(params));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}
