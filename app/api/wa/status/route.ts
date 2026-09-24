// Estado leve do painel para a barra lateral: IA ligada, número conectado e
// quantas conversas esperam humano. Pesquisado a cada 30s por todas as telas —
// por isso é só a linha de configuração e uma agregação.

import { NextResponse } from "next/server";
import { requirePanelUser, type PanelUser } from "@wa/lib/auth";
import { getSettings } from "@wa/lib/settings";
import { conversationCounts } from "@wa/lib/inbox";

export const dynamic = "force-dynamic";

export async function GET() {
  let user: PanelUser;
  try {
    user = await requirePanelUser();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const [settings, counts] = await Promise.all([getSettings(), conversationCounts(user.email)]);

  return NextResponse.json({
    aiActive: settings.aiActive ?? false,
    displayPhone: settings.wabaDisplayPhone ?? null,
    counts: { waiting: counts.waiting, sla: counts.sla, mine: counts.mine },
  });
}
