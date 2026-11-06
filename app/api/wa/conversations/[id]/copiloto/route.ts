// Copiloto da Central: sugerir resposta, melhorar o texto e resumir a
// conversa, sempre a pedido de quem atende. Usa a chave de IA da loja e conta
// no limite diário dela (wa/lib/copiloto.ts).

import { NextRequest, NextResponse } from "next/server";
import { requireScope, scopeError, type Scope } from "@wa/lib/scope";
import { getStore } from "@wa/lib/store";
import { conversaDoEscopo } from "@wa/lib/central";
import { LlmAuthError, LlmTransientError } from "@wa/lib/llm";
import {
  CopilotoError,
  consumirCota,
  copilotoDisponivel,
  devolverCota,
  limiteDiario,
  pedirAoCopiloto,
  type AcaoDoCopiloto,
} from "@wa/lib/copiloto";

export const maxDuration = 60;

const ACOES: AcaoDoCopiloto[] = ["sugerir", "melhorar", "resumir"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let scope: Scope;
  try {
    scope = await requireScope();
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { acao?: string; texto?: string };
  const acao = ACOES.find((a) => a === body.acao);
  if (!acao) return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });

  const conv = await conversaDoEscopo(scope, id);
  if (!conv) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  const store = scope.tenantId ? await getStore(scope.tenantId) : null;
  const ia = copilotoDisponivel(scope, store);
  if (!ia.disponivel) return NextResponse.json({ error: ia.motivo }, { status: 403 });

  const cota = await consumirCota(ia.chave);
  if (!cota.ok) {
    return NextResponse.json(
      { error: `O copiloto já foi usado ${limiteDiario()} vezes hoje nesta loja. Volta amanhã.` },
      { status: 429 },
    );
  }

  try {
    const texto = await pedirAoCopiloto({ conversationId: id, acao, texto: body.texto, creds: ia.creds, store });
    return NextResponse.json({ texto, restante: cota.restante });
  } catch (err) {
    await devolverCota(ia.chave);
    if (err instanceof CopilotoError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof LlmTransientError) {
      return NextResponse.json({ error: "O provedor de IA está ocupado agora. Tente de novo em alguns segundos." }, { status: 503 });
    }
    if (err instanceof LlmAuthError) {
      return NextResponse.json(
        { error: "O provedor de IA recusou a chave da loja (chave inválida, sem crédito ou modelo indisponível). Confira na Configuração." },
        { status: 502 },
      );
    }
    console.error("[copiloto] falhou:", err);
    return NextResponse.json({ error: "Não deu para falar com a IA agora." }, { status: 500 });
  }
}
