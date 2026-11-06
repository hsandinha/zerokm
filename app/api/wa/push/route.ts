// Avisos no navegador (push) de quem atende: estado, inscrever e desinscrever
// este aparelho, e mandar um aviso de teste. Sem as chaves VAPID no ambiente
// a rota responde `ativo: false` e a moldura esconde o sino (wa/lib/push.ts).
//
// No iPhone o Safari só entrega push para site instalado na Tela de Início;
// o painel não tem app instalável (decisão do dono), então lá os avisos só
// chegam para quem adicionar o site à Tela de Início.

import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { WaPushInscricao } from "@wa/models/operacao";
import { requireScope, scopeError, type Scope } from "@wa/lib/scope";
import { chavePublicaPush, enviarPush, pushConfigurado } from "@wa/lib/push";

export const dynamic = "force-dynamic";

async function escopo(): Promise<Scope | NextResponse> {
  try {
    return await requireScope();
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
}

export async function GET(req: NextRequest) {
  const scope = await escopo();
  if (scope instanceof NextResponse) return scope;
  if (!pushConfigurado()) return NextResponse.json({ ativo: false, publicKey: null, inscrito: false });
  // `endpoint`: o aparelho pergunta se ESTA inscrição é dele e desta loja.
  const endpoint = req.nextUrl.searchParams.get("endpoint");
  let inscrito = false;
  if (endpoint) {
    await dbConnect();
    inscrito = Boolean(
      await WaPushInscricao.exists({ endpoint, tenantId: scope.tenantId, email: scope.email }),
    );
  }
  return NextResponse.json({ ativo: true, publicKey: chavePublicaPush(), inscrito });
}

type Corpo = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
  teste?: unknown;
};

export async function POST(req: NextRequest) {
  const scope = await escopo();
  if (scope instanceof NextResponse) return scope;
  if (!pushConfigurado()) {
    return NextResponse.json({ error: "Os avisos ainda não foram configurados no servidor." }, { status: 503 });
  }
  const body = (await req.json().catch(() => null)) as Corpo | null;
  if (!body) return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });

  if (body.teste === true) {
    const n = await enviarPush({
      tenantId: scope.tenantId,
      emails: [scope.email],
      aviso: {
        titulo: "Avisos ligados",
        corpo: "É assim que chegam as conversas novas e as transferidas para você.",
        url: scope.tenantId ? "/dashboard/atendimento/central" : "/dashboard/admin/whatsapp/central",
        tag: "teste",
      },
    });
    return NextResponse.json({ ok: true, entregues: n });
  }

  const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
  const p256dh = typeof body.keys?.p256dh === "string" ? body.keys.p256dh : "";
  const auth = typeof body.keys?.auth === "string" ? body.keys.auth : "";
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth) {
    return NextResponse.json({ error: "Inscrição inválida" }, { status: 400 });
  }
  await dbConnect();
  // O mesmo navegador é um aparelho só: entrar com outra pessoa ou noutra
  // loja move a inscrição, nunca duplica (nem avisa a pessoa errada).
  await WaPushInscricao.updateOne(
    { endpoint },
    {
      $set: {
        tenantId: scope.tenantId,
        email: scope.email,
        p256dh,
        auth,
        userAgent: (req.headers.get("user-agent") ?? "").slice(0, 300),
      },
    },
    { upsert: true },
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const scope = await escopo();
  if (scope instanceof NextResponse) return scope;
  const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  if (!endpoint) return NextResponse.json({ error: "Aparelho inválido" }, { status: 400 });
  await dbConnect();
  await WaPushInscricao.deleteOne({ endpoint, tenantId: scope.tenantId, email: scope.email });
  return NextResponse.json({ ok: true });
}
