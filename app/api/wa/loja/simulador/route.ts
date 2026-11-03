// Simulador da IA da loja: o mesmo cérebro (prompt, ferramentas, chave da
// loja) sem tocar canal nenhum. Consultas de estoque e simulação de parcela
// rodam de verdade (só leem); ações (visita, captação, transferência, CRM)
// são SIMULADAS — nada é gravado.

import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { WaStore } from "@wa/models/store";
import { requireScopeAdmin } from "@wa/lib/scope";
import { recursosDaLoja } from "@wa/lib/store";
import { aplicarRecursos, buildStorePrompt, credsDaLoja, executarConsulta, runStoreTurn, sanitizeStoreText } from "@wa/lib/ai-loja";
import type { LlmMessage } from "@wa/lib/llm";

export const maxDuration = 60;

type SimMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: NextRequest) {
  let tenantId: string | null;
  try {
    ({ tenantId } = await requireScopeAdmin("ia"));
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  if (!tenantId) return NextResponse.json({ error: "Só para lojas" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    messages?: SimMessage[];
    canal?: "whatsapp" | "instagram";
  };
  const messages = (body.messages ?? []).filter(
    (m): m is SimMessage =>
      (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
  );
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "Envie o histórico terminando em mensagem do cliente" }, { status: 400 });
  }

  await dbConnect();
  const store = await WaStore.findById(tenantId);
  if (!store) return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 });
  aplicarRecursos(store, await recursosDaLoja(store));
  const creds = credsDaLoja(store);
  if (!creds) {
    return NextResponse.json({ error: "Cadastre a chave da IA da loja antes de simular." }, { status: 400 });
  }

  const system = buildStorePrompt({
    store,
    channel: body.canal === "instagram" ? { kind: "instagram", label: "Instagram" } : { kind: "whatsapp", label: "WhatsApp" },
  });
  const events: string[] = [];
  const replies: string[] = [];

  try {
    const { replyText, acao } = await runStoreTurn({
      store,
      system,
      messages: messages as LlmMessage[],
      creds,
      onConsulta: async (call) => {
        if (call.name === "registrar_interesse") {
          events.push(`registrar_interesse — SIMULADO: ${JSON.stringify(call.input)}`);
          return "Interesse anotado para a equipe. Continue a conversa.";
        }
        events.push(`${call.name}(${JSON.stringify(call.input)})`);
        return executarConsulta(store, call, {
          send: async (text) => {
            replies.push(text);
          },
        });
      },
      onReaction: async (emoji) => {
        events.push(`Reagiu com ${emoji}`);
      },
    });
    if (acao) {
      const fala = sanitizeStoreText(String((acao.input as { mensagem?: string }).mensagem ?? ""));
      if (replyText) replies.push(replyText);
      if (fala && fala !== replyText) replies.push(fala);
      events.push(`${acao.name}(${JSON.stringify(acao.input)}) — SIMULADO, nada foi gravado`);
    } else if (replyText) {
      replies.push(replyText);
    }
    if (!replies.length) replies.push("(a IA não produziu resposta — tente reformular)");
    return NextResponse.json({ replies, events });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao rodar a IA" },
      { status: 500 },
    );
  }
}
