// Posts recentes do canal para escolher a isca pela foto.
//   GET ?channelId= → { posts: [...] } ou { posts: null } quando o gateway não
//   respondeu a lista: a tela volta ao campo do id do post.

import { NextRequest, NextResponse } from "next/server";
import { escopoDasIscas, postsDoCanal, respostaDeErro } from "@wa/lib/iscas-servidor";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const scope = await escopoDasIscas(false);
  if (scope instanceof NextResponse) return scope;
  const channelId = req.nextUrl.searchParams.get("channelId") ?? "";
  try {
    return NextResponse.json({ posts: await postsDoCanal(scope, channelId) });
  } catch (err) {
    return respostaDeErro(err);
  }
}
