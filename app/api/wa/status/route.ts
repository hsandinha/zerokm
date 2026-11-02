// Estado leve do painel para a barra lateral: IA ligada, número conectado e
// quantas conversas esperam humano. Pesquisado a cada 30s por todas as telas —
// por isso é só a linha de configuração e uma agregação.

import { NextResponse } from "next/server";
import { requireScope, type Scope } from "@wa/lib/scope";
import { getSettings } from "@wa/lib/settings";
import { conversationCounts } from "@wa/lib/inbox";
import { whatsappChannelOf } from "@wa/lib/channels";
import { getStore } from "@wa/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  let user: Scope;
  try {
    user = await requireScope();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const [aiActive, whatsapp, counts] = await Promise.all([
    user.tenantId
      ? getStore(user.tenantId).then((s) => Boolean(s?.ai?.active))
      : getSettings().then((s) => s.aiActive ?? false),
    whatsappChannelOf(user.tenantId).catch(() => null),
    conversationCounts(user.email, undefined, user.tenantId),
  ]);

  return NextResponse.json({
    aiActive,
    displayPhone: whatsapp?.label ?? null,
    counts: { waiting: counts.waiting, sla: counts.sla, mine: counts.mine },
  });
}
