// "Conectar WhatsApp" da loja.
//   GET  → o que o botão do Embedded Signup precisa (app id e config id)
//   POST → { code, wabaId?, phoneNumberId? } vindo do popup da Meta, ou
//          { manual: { phoneNumberId, wabaId, token } } para quem já tem o
//          token permanente de um app próprio.
// Os dois caminhos terminam igual: o número vira um canal da loja, com o
// token cifrado, o webhook inscrito na WABA e o número registrado.

import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { WaChannel } from "@wa/models/channel";
import { requireScopeAdmin, type Scope } from "@wa/lib/scope";
import { encrypt } from "@wa/lib/crypto";
import { fetchPhoneInfo, MetaApiError } from "@wa/lib/meta";
import {
  discoverWabaIds,
  embeddedSignupConfig,
  EmbeddedSignupError,
  exchangeCodeForToken,
  listPhoneNumbers,
  registerPhone,
  subscribeAppToWaba,
} from "@wa/lib/embedded-signup";

export const maxDuration = 60;

async function lojaGestora(): Promise<Scope | NextResponse> {
  try {
    const scope = await requireScopeAdmin();
    if (!scope.tenantId) {
      return NextResponse.json(
        { error: "O WhatsApp do CNV é configurado na tela IA & WABA" },
        { status: 400 },
      );
    }
    return scope;
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
}

export async function GET() {
  const scope = await lojaGestora();
  if (scope instanceof NextResponse) return scope;
  return NextResponse.json({ embeddedSignup: embeddedSignupConfig() });
}

export async function POST(req: NextRequest) {
  const scope = await lojaGestora();
  if (scope instanceof NextResponse) return scope;
  const tenantId = scope.tenantId!;

  const body = (await req.json().catch(() => ({}))) as {
    code?: string;
    wabaId?: string;
    phoneNumberId?: string;
    manual?: { phoneNumberId?: string; wabaId?: string; token?: string };
  };

  let token: string;
  let wabaId: string | undefined;
  let phoneNumberId: string | undefined;
  let viaPopup = false;
  try {
    if (body.manual) {
      token = String(body.manual.token ?? "").trim();
      wabaId = String(body.manual.wabaId ?? "").trim() || undefined;
      phoneNumberId = String(body.manual.phoneNumberId ?? "").trim() || undefined;
      if (!token || !phoneNumberId) {
        return NextResponse.json({ error: "Informe o Phone Number ID e o token" }, { status: 400 });
      }
    } else {
      if (!body.code) return NextResponse.json({ error: "Faltou o código do Facebook" }, { status: 400 });
      viaPopup = true;
      token = await exchangeCodeForToken(body.code);
      wabaId = body.wabaId || (await discoverWabaIds(token))[0];
      if (!wabaId) {
        return NextResponse.json(
          { error: "A Meta não informou a conta do WhatsApp. Tente de novo e conclua todas as etapas do popup." },
          { status: 400 },
        );
      }
      phoneNumberId = body.phoneNumberId || (await listPhoneNumbers(wabaId, token))[0]?.id;
      if (!phoneNumberId) {
        return NextResponse.json({ error: "Essa conta não tem número de WhatsApp cadastrado." }, { status: 400 });
      }
    }

    await dbConnect();
    // Um número pertence a um canal só: o de outra loja não troca de dono.
    const existing = await WaChannel.findOne({ kind: "whatsapp", phoneNumberId });
    if (existing && (existing.tenantId ?? null) !== tenantId && existing.status !== "disconnected") {
      return NextResponse.json({ error: "Este número já está conectado a outra loja." }, { status: 409 });
    }

    // Valida o token contra o número antes de gravar qualquer coisa.
    const info = await fetchPhoneInfo({ token, phoneNumberId, wabaId });

    let registered = true;
    let lastError: string | undefined;
    if (wabaId) {
      await subscribeAppToWaba(wabaId, token).catch((err) => {
        lastError = `webhook: ${err instanceof Error ? err.message : err}`;
      });
    }
    if (viaPopup) {
      const reg = await registerPhone(phoneNumberId, token);
      registered = reg.ok;
      if (!reg.ok) lastError = `registro: ${reg.error}`;
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
        status: registered && !lastError ? "connected" : "error",
        lastError: lastError ?? null,
        $unset: { appSecret: 1 },
      },
      { upsert: true },
    );

    return NextResponse.json({
      ok: true,
      phoneNumber: info.display_phone_number ?? null,
      registered,
      warning: lastError ?? null,
    });
  } catch (err) {
    const status =
      err instanceof EmbeddedSignupError || err instanceof MetaApiError ? 502 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao conectar" },
      { status },
    );
  }
}
