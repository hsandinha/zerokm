// Claude (Anthropic) para as lojas que escolherem esse provedor, no mesmo
// formato de resposta do Gemini/GPT (texto + chamadas de ferramenta). A chave
// é sempre a da loja — a zerokm não paga a IA de ninguém.

import Anthropic from "@anthropic-ai/sdk";
import type { LlmMessage, LlmResult, LlmTool } from "@wa/lib/llm";

export const CLAUDE_DEFAULT_MODEL = "claude-opus-5-5";

export async function runClaude(params: {
  apiKey: string;
  model?: string;
  system: string;
  messages: LlmMessage[];
  tools: LlmTool[];
  maxTokens?: number;
  /** Erros já classificados pela camada comum (llm.ts). */
  onError: (status: number, message: string, retryAfterMs?: number) => Error;
}): Promise<LlmResult> {
  const client = new Anthropic({ apiKey: params.apiKey, maxRetries: 1 });

  // A conversa precisa começar pelo cliente: quando a primeira mensagem foi
  // nossa (template de campanha), entra um marcador antes.
  const messages: Anthropic.Beta.BetaMessageParam[] = params.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  if (messages[0]?.role === "assistant") {
    messages.unshift({ role: "user", content: "[início da conversa]" });
  }

  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model: params.model || CLAUDE_DEFAULT_MODEL,
      max_tokens: params.maxTokens ?? 16000,
      system: params.system,
      messages,
      tools: params.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.schema as Anthropic.Beta.BetaTool.InputSchema,
      })),
      // Recusa do filtro de segurança cai num modelo de reserva em vez de
      // deixar o cliente sem resposta.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      const retryAfter = Number(err.headers?.get?.("retry-after"));
      throw params.onError(
        err.status ?? 500,
        err.message,
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
      );
    }
    throw err;
  }

  if (response.stop_reason === "refusal") {
    throw new Error(
      `Claude recusou a resposta${response.stop_details?.category ? ` (${response.stop_details.category})` : ""}`,
    );
  }

  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  const toolCalls = response.content
    .filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use")
    .map((b) => ({ name: b.name, input: (b.input ?? {}) as Record<string, unknown> }));

  return {
    text,
    toolCalls,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}
