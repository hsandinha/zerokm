// Simulador — exatamente o mesmo cérebro da IA (prompt, planos reais, tools),
// sem tocar o WhatsApp nem gravar nada. As ferramentas são SIMULADAS: nada de
// cadastro/pagamento real a partir daqui.

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@wa/lib/auth";
import { getSettings } from "@wa/lib/settings";
import { getActivePlans } from "@wa/lib/payments";
import {
  buildSystemPrompt,
  sanitizeAssistantText,
  runAiTurn,
  LOGIN_URL,
  credentialsMessage,
  pixMessage,
  linkMessage,
} from "@wa/lib/ai";
import type { LlmMessage } from "@wa/lib/llm";

export const maxDuration = 60;

type SimMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    messages?: SimMessage[];
    funnel?: "novo" | "cadastrado" | "assinante";
  };
  const messages = (body.messages ?? []).filter(
    (m): m is SimMessage =>
      (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
  );
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "Envie o histórico terminando em mensagem do cliente" }, { status: 400 });
  }

  const funnelText =
    body.funnel === "assinante"
      ? "- Cliente JÁ CADASTRADO (Cliente Teste — teste@exemplo.com).\n- ASSINATURA ATIVA ✅ — cliente pagante. Não ofereça cadastro nem cobre assinatura de novo."
      : body.funnel === "cadastrado"
        ? "- Cliente JÁ CADASTRADO (Cliente Teste — teste@exemplo.com).\n- TESTE GRÁTIS ATIVO até amanhã — sem assinatura paga ainda. Objetivo: converter em assinante."
        : "- Cliente AINDA NÃO TEM CADASTRO na CNV. Objetivo: criar o cadastro nesta conversa.";

  const [settings, plans] = await Promise.all([getSettings(), getActivePlans()]);
  const systemPrompt = buildSystemPrompt({ settings, plans, funnelStatus: funnelText });

  try {
    // Mesmo cérebro do WhatsApp real, incluindo a proteção contra "só reagiu
    // sem texto" (runAiTurn refaz a chamada sem a tool de reação nesse caso).
    const turn = await runAiTurn({
      system: systemPrompt,
      messages: messages as LlmMessage[],
    });

    const events: string[] = turn.reactions.map((emoji) => `Reagiu com ${emoji || "?"}`);
    const replies: string[] = [];
    if (turn.replyText) replies.push(turn.replyText);

    for (const tool of turn.toolCalls) {
      if (tool.name === "criar_cadastro") {
        const input = tool.input as { nome?: string; email?: string; mensagem?: string };
        const intro = sanitizeAssistantText(input.mensagem);
        if (intro && !replies.includes(intro)) replies.push(intro);
        events.push(`criar_cadastro(nome: ${input.nome}, email: ${input.email}) — SIMULADO, nada foi criado`);
        replies.push(credentialsMessage(input.email ?? "cliente@exemplo.com", "SENHA-SIMULADA"));
      } else if (tool.name === "gerar_pagamento") {
        const input = tool.input as {
          plan_id?: string;
          cobranca?: string;
          metodo?: string;
          mensagem?: string;
        };
        const intro = sanitizeAssistantText(input.mensagem);
        if (intro && !replies.includes(intro)) replies.push(intro);
        const plan = plans.find((p) => String(p._id) === input.plan_id);
        const label = `${plan?.name ?? "Plano"} (${input.cobranca === "annual" ? "anual" : "mensal"})`;
        const amount =
          input.cobranca === "annual" && plan?.annualPrice ? plan.annualPrice : (plan?.price ?? 0);
        events.push(
          `gerar_pagamento(${label}, ${input.metodo}) — SIMULADO, nenhuma cobrança criada`,
        );
        replies.push(
          input.metodo === "pix"
            ? pixMessage(label, amount) + "\n\n00020126SIMULACAO-PIX-COPIA-E-COLA…"
            : linkMessage(label, amount, `${LOGIN_URL()}?simulacao=1`),
        );
      } else if (tool.name === "transferir_para_humano") {
        const input = tool.input as { motivo?: string; resumo?: string; mensagem_despedida?: string };
        const bye = sanitizeAssistantText(input.mensagem_despedida);
        if (bye) replies.push(bye);
        events.push(`Transferiu para humano (${input.motivo}): ${input.resumo ?? ""}`);
      } else if (tool.name === "encerrar_conversa") {
        const input = tool.input as { motivo?: string; mensagem_despedida?: string };
        const bye = sanitizeAssistantText(input.mensagem_despedida);
        if (bye) replies.push(bye);
        events.push(`Encerrou a conversa (${input.motivo})`);
      }
    }

    // Reação não conta como resposta: se não sobrou texto nem tool com efeito,
    // avisa em vez de deixar a conversa "no vácuo".
    if (replies.length === 0 && turn.toolCalls.length === 0) {
      replies.push("(a IA não produziu resposta — tente reformular)");
    }

    return NextResponse.json({ replies, events });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao rodar a IA" },
      { status: 500 },
    );
  }
}
