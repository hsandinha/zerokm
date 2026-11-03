// Volta do Instagram Login: troca o code por token de longa duração (60 dias),
// descobre a conta profissional e cria/atualiza o canal `instagram`. Não
// depende de sessão: o `state` assinado prova de quem é o canal.

import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { WaChannel } from "@wa/models/channel";
import { encrypt } from "@wa/lib/crypto";
import { configPathOf, readConnectState } from "@wa/lib/channels";
import { igExchangeCode, igLongLivedToken, igMe, igSubscribeApp } from "@wa/lib/instagram";
import { siteUrl } from "@wa/lib/site-url";

export async function GET(req: NextRequest) {
  const base = siteUrl(req);
  const sp = req.nextUrl.searchParams;
  const code = sp.get("code");
  const state = readConnectState(sp.get("state"));
  if (sp.get("error") || !code || !state) {
    return NextResponse.redirect(`${base}${configPathOf(state?.tenantId ?? null)}?instagram=erro`);
  }

  const qs = new URLSearchParams({ instagram: "erro" });
  try {
    const short = await igExchangeCode(code, `${base}/api/wa/instagram/callback`);
    const long = await igLongLivedToken(short.accessToken);
    const me = await igMe(long.accessToken);
    const igUserId = me.userId || short.userId;
    if (!igUserId) throw new Error("Instagram não devolveu o id da conta");

    await dbConnect();
    const existing = await WaChannel.findOne({ kind: "instagram", igUserId });
    // A mesma conta não troca de dono por um login: quem conectou primeiro
    // precisa desconectar antes.
    if (existing && (existing.tenantId ?? null) !== state.tenantId && existing.status !== "disconnected") {
      throw new Error("esta conta do Instagram já está conectada a outra loja");
    }
    await WaChannel.findOneAndUpdate(
      { kind: "instagram", igUserId },
      {
        kind: "instagram",
        tenantId: state.tenantId,
        igUserId,
        igUsername: me.username ?? undefined,
        igToken: encrypt(long.accessToken),
        igTokenExpiresAt: new Date(Date.now() + long.expiresIn * 1000),
        displayName: me.username ? `@${me.username}` : "Instagram",
        status: "connected",
        lastError: null,
      },
      { upsert: true, new: true },
    );

    // Mesmo passo do subscribed_apps da WABA: sem ele o Direct nunca chega.
    // Falhou = canal em "error" para o painel pedir reconexão.
    try {
      await igSubscribeApp({ userId: igUserId, token: long.accessToken });
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      await WaChannel.updateOne({ kind: "instagram", igUserId }, { status: "error", lastError: why });
      throw err;
    }
    qs.set("instagram", "ok");
    if (me.username) qs.set("ig", me.username);
  } catch (err) {
    console.error("[instagram] callback falhou:", err);
    // O motivo vai curto para a tela: sem ele ninguém sabe se foi token,
    // permissão ou banco.
    qs.set("why", (err instanceof Error ? err.message : String(err)).slice(0, 140));
  }
  return NextResponse.redirect(`${base}${configPathOf(state.tenantId)}?${qs.toString()}`);
}
