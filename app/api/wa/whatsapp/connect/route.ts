// "Conectar WhatsApp" — pelo Chatrun Conexão (gateway), para a loja e para
// o CNV (a Vera, tenantId null, external_ref "cnv").
//   GET  → se o Chatrun está configurado; de quebra sincroniza os números do
//          dono com o gateway (situação, nome, telefone).
//   POST { acao: "convite" }  → link do convite (popup da Meta na página do
//          gateway, no app da Chatrun). Volta para a Configuração com
//          ?whatsapp=retorno&status=ok&connection_id=...
//   POST { acao: "retorno", accountId? } → lê no gateway os números do dono
//          e cria/atualiza os canais. Os eventos connection.* fazem o mesmo,
//          este é só o caminho rápido.
//   POST { manual: { phoneNumberId, wabaId, token } } → loja que já tem o
//          token permanente de um app próprio (fora do gateway). O manual do
//          CNV é o formulário da tela IA & WABA.
//
// Pelo gateway a zerokm não guarda token da Meta nem inscreve webhook: o
// canal fica com o connection_id e tudo passa pela API do Chatrun.

import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { WaChannel } from "@wa/models/channel";
import { requireScopeAdmin, type Scope } from "@wa/lib/scope";
import { encrypt } from "@wa/lib/crypto";
import { fetchPhoneInfo, MetaApiError } from "@wa/lib/meta";
import { ChatrunError, chatrunConfigured } from "@wa/lib/chatrun";
import { adoptReturnedAccount, inviteFor, syncChannels } from "@wa/lib/chatrun-account";
import { configPathOf } from "@wa/lib/channels";
import { siteUrl } from "@wa/lib/site-url";
import { subscribeAppToWaba } from "@wa/lib/embedded-signup";

export const maxDuration = 60;

async function gestor(): Promise<Scope | NextResponse> {
  try {
    return await requireScopeAdmin();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
}

function falhaDoChatrun(err: unknown) {
  if (err instanceof ChatrunError) {
    return NextResponse.json({ error: err.message }, { status: err.status >= 500 ? 502 : err.status });
  }
  return NextResponse.json({ error: err instanceof Error ? err.message : "Falha ao falar com o Chatrun" }, { status: 500 });
}

export async function GET() {
  const scope = await gestor();
  if (scope instanceof NextResponse) return scope;
  if (!chatrunConfigured()) return NextResponse.json({ chatrun: false });
  try {
    const { warning } = await syncChannels(scope.tenantId, "whatsapp");
    return NextResponse.json({ chatrun: true, aviso: warning });
  } catch (err) {
    // A tela abre do mesmo jeito; só não confirmou com o gateway agora.
    const msg = err instanceof Error ? err.message : "Falha ao consultar o Chatrun";
    return NextResponse.json({ chatrun: true, aviso: `Não foi possível consultar o Chatrun: ${msg}` });
  }
}

export async function POST(req: NextRequest) {
  const scope = await gestor();
  if (scope instanceof NextResponse) return scope;
  const tenantId = scope.tenantId;

  const body = (await req.json().catch(() => ({}))) as {
    acao?: "convite" | "retorno";
    accountId?: string;
    manual?: { phoneNumberId?: string; wabaId?: string; token?: string };
  };

  if (body.acao === "convite" || body.acao === "retorno") {
    if (!chatrunConfigured()) {
      return NextResponse.json({ error: "Chatrun não configurado na plataforma (CHATRUN_API_KEY)." }, { status: 503 });
    }
    try {
      if (body.acao === "convite") {
        const url = await inviteFor({
          tenantId,
          email: scope.email,
          channel: "whatsapp",
          returnUrl: `${siteUrl(req)}${configPathOf(tenantId)}?whatsapp=retorno`,
        });
        return NextResponse.json({ url });
      }
      // A conta da volta pode ser outra (o número já era de outra conta no gateway).
      await adoptReturnedAccount(tenantId, body.accountId ? String(body.accountId) : null, "whatsapp");
      const { connected, warning } = await syncChannels(tenantId, "whatsapp");
      return NextResponse.json({ ok: true, conectados: connected, aviso: warning });
    } catch (err) {
      return falhaDoChatrun(err);
    }
  }

  if (!body.manual) {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }
  if (!tenantId) {
    return NextResponse.json({ error: "O WhatsApp do CNV é configurado na tela IA & WABA" }, { status: 400 });
  }

  // Cadastro manual: app próprio na Meta, fora do gateway. O token fica
  // cifrado no canal e o webhook do app dele aponta para /api/webhooks/meta.
  const token = String(body.manual.token ?? "").trim();
  const wabaId = String(body.manual.wabaId ?? "").trim() || undefined;
  const phoneNumberId = String(body.manual.phoneNumberId ?? "").trim() || undefined;
  if (!token || !phoneNumberId) {
    return NextResponse.json({ error: "Informe o Phone Number ID e o token" }, { status: 400 });
  }

  try {
    await dbConnect();
    // Um número pertence a um canal só: o de outra loja não troca de dono.
    const existing = await WaChannel.findOne({ kind: "whatsapp", phoneNumberId });
    if (existing && (existing.tenantId ?? null) !== tenantId && existing.status !== "disconnected") {
      return NextResponse.json({ error: "Este número já está conectado a outra loja." }, { status: 409 });
    }

    // Valida o token contra o número antes de gravar qualquer coisa.
    const info = await fetchPhoneInfo({ token, phoneNumberId, wabaId });

    let lastError: string | undefined;
    if (wabaId) {
      await subscribeAppToWaba(wabaId, token).catch((err) => {
        lastError = `webhook: ${err instanceof Error ? err.message : err}`;
      });
    }

    await WaChannel.findOneAndUpdate(
      { kind: "whatsapp", phoneNumberId },
      {
        kind: "whatsapp",
        tenantId,
        phoneNumberId,
        wabaId,
        token: encrypt(token),
        displayPhone: info.display_phone_number,
        displayName: info.verified_name,
        status: lastError ? "error" : "connected",
        lastError: lastError ?? null,
        $unset: { appSecret: 1, provider: 1, chatrunConnectionId: 1, chatrunAccountId: 1 },
      },
      { upsert: true },
    );

    return NextResponse.json({
      ok: true,
      phoneNumber: info.display_phone_number ?? null,
      registered: true,
      warning: lastError ?? null,
    });
  } catch (err) {
    const status = err instanceof MetaApiError ? 502 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao conectar" },
      { status },
    );
  }
}
