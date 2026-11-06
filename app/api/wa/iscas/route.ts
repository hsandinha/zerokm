// Iscas de comentário (Instagram e Página do Facebook) de quem está operando.
//   GET  → canais que podem ter isca, as iscas e os últimos comentários
//          (qualquer um da equipe lê; `podeEditar` diz se é gestor)
//   POST { channelId, mediaId?, post?: { legenda, imagem, link }, keyword?,
//          publicReply?, directMessage, ativo?, priority? } → cria (gestor)
//
// A regra é criada no gateway primeiro (wa/lib/iscas-servidor.ts).

import { NextRequest, NextResponse } from "next/server";
import { criarIsca, escopoDasIscas, painelDeIscas, respostaDeErro } from "@wa/lib/iscas-servidor";

export const dynamic = "force-dynamic";

export async function GET() {
  const scope = await escopoDasIscas(false);
  if (scope instanceof NextResponse) return scope;
  try {
    const painel = await painelDeIscas(scope);
    return NextResponse.json({ ...painel, podeEditar: scope.role === "admin" });
  } catch (err) {
    return respostaDeErro(err);
  }
}

export async function POST(req: NextRequest) {
  const scope = await escopoDasIscas(true);
  if (scope instanceof NextResponse) return scope;
  const body = await req.json().catch(() => null);
  try {
    const r = await criarIsca(scope, body, scope.email);
    return NextResponse.json({ ok: true, ...r }, { status: 201 });
  } catch (err) {
    return respostaDeErro(err);
  }
}
