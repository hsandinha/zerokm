// Testa as credenciais na rota /consultas/teste da Procob (não debita saldo).

import { NextResponse } from "next/server";
import { requireAdmin } from "@wa/lib/auth";
import {
  ProcobError,
  classifyCode,
  procobCredentials,
  procobGet,
  procobProxyUrl,
  rememberBalance,
} from "@wa/lib/procob";

export const maxDuration = 30;

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
  }

  const creds = procobCredentials();
  try {
    const env = await procobGet("teste");
    const cls = classifyCode(env.code, env.message);
    // A resposta traz o saldo de carona: aproveita para atualizar o header.
    await rememberBalance(env).catch(() => {});
    return NextResponse.json({
      ok: cls.kind === "ok",
      code: env.code,
      kind: cls.kind,
      message: env.message,
      saldo: env.saldo,
      sandbox: env.sandbox,
      user: creds.sandbox ? "sandbox@procob.com" : creds.user.replace(/^(.{2}).+(@.+)$/, "$1…$2"),
      proxy: Boolean(procobProxyUrl()),
    });
  } catch (err) {
    if (err instanceof ProcobError) {
      return NextResponse.json(
        { ok: false, code: err.code ?? null, kind: err.kind, message: err.message },
        { status: 200 },
      );
    }
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Falha ao testar" },
      { status: 200 },
    );
  }
}
