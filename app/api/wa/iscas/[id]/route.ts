// Uma isca de comentário.
//   GET    → a isca e os números do gateway (qualquer um da equipe)
//   PATCH  → altera o que vier (gestor); o canal não muda
//   DELETE → apaga no gateway e aqui (gestor). Gateway sem a regra (404) não
//            impede de apagar a daqui.

import { NextRequest, NextResponse } from "next/server";
import {
  alterarIsca,
  apagarIsca,
  escopoDasIscas,
  iscaComNumeros,
  respostaDeErro,
} from "@wa/lib/iscas-servidor";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const scope = await escopoDasIscas(false);
  if (scope instanceof NextResponse) return scope;
  const { id } = await params;
  try {
    return NextResponse.json(await iscaComNumeros(scope, id));
  } catch (err) {
    return respostaDeErro(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const scope = await escopoDasIscas(true);
  if (scope instanceof NextResponse) return scope;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  try {
    return NextResponse.json({ ok: true, isca: await alterarIsca(scope, id, body) });
  } catch (err) {
    return respostaDeErro(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const scope = await escopoDasIscas(true);
  if (scope instanceof NextResponse) return scope;
  const { id } = await params;
  try {
    await apagarIsca(scope, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return respostaDeErro(err);
  }
}
