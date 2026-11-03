// Camada de LLM: Gemini (REST v1beta, sem SDK), portada do whatsappsocila,
// GPT da OpenAI (Chat Completions) ou Claude (llm-claude.ts). Todos devolvem
// o mesmo formato (texto + chamadas de ferramenta), então o resto do módulo
// não muda.
//
// A Vera usa as chaves do deploy (LLM_PROVIDER, GEMINI_*, OPENAI_*). Cada loja
// usa a PRÓPRIA chave, passada em `creds` — sem chave, a loja não tem IA.
// Erros classificados: transitório (429/5xx — resolve esperando) vs
// autenticação (401/403/402/404 — retry não adianta).

export type LlmTool = {
  name: string;
  description: string;
  schema: Record<string, unknown>;
};
export type LlmMessage = { role: "user" | "assistant"; content: string };
export type LlmToolCall = { name: string; input: Record<string, unknown> };
export type LlmProvider = "gemini" | "openai" | "claude";
/** Chave e modelo de uma loja. */
export type LlmCreds = { provider: LlmProvider; apiKey: string; model?: string | null };
export type LlmResult = {
  text: string;
  toolCalls: LlmToolCall[];
  usage: { inputTokens: number; outputTokens: number };
};

export class LlmTransientError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "LlmTransientError";
  }
}

export class LlmAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmAuthError";
  }
}

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";

function classifyHttp(status: number, message: string, retryAfterMs?: number): Error {
  if (status === 429 || status >= 500) return new LlmTransientError(message, retryAfterMs);
  if (status === 401 || status === 403 || status === 402 || status === 404) {
    return new LlmAuthError(message);
  }
  return new Error(message);
}

// O schema de function calling do Gemini usa enum de tipos em MAIÚSCULAS.
function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (schema && typeof schema === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema)) {
      if (k === "type" && typeof v === "string") out[k] = v.toUpperCase();
      else out[k] = toGeminiSchema(v);
    }
    return out;
  }
  return schema;
}

type GeminiPart = {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
};

/** O Gemini devolve o tempo de espera em `error.details[].retryDelay` ("28.4s"). */
function geminiRetryDelayMs(details: unknown): number | undefined {
  if (!Array.isArray(details)) return undefined;
  for (const d of details) {
    const delay = (d as { retryDelay?: string })?.retryDelay;
    if (typeof delay === "string") {
      const seconds = parseFloat(delay);
      if (Number.isFinite(seconds)) return Math.ceil(seconds * 1000);
    }
  }
  return undefined;
}

/** Qual motor responde: GPT só quando LLM_PROVIDER=openai (padrão continua Gemini). */
export function llmProvider(): "openai" | "gemini" {
  return (process.env.LLM_PROVIDER || "").trim().toLowerCase() === "openai" ? "openai" : "gemini";
}

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

type OpenAiToolCall = { type?: string; function?: { name?: string; arguments?: string } };

/** GPT (OpenAI Chat Completions) com function calling, no mesmo formato do Gemini. */
async function runOpenAi(params: {
  system: string;
  messages: LlmMessage[];
  tools: LlmTool[];
  maxTokens?: number;
  apiKey?: string;
  model?: string | null;
}): Promise<LlmResult> {
  const apiKey = params.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new LlmAuthError("OPENAI_API_KEY ausente");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: params.model || OPENAI_MODEL,
      messages: [
        { role: "system", content: params.system },
        ...params.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      ...(params.tools.length
        ? {
            tools: params.tools.map((t) => ({
              type: "function",
              function: { name: t.name, description: t.description, parameters: t.schema },
            })),
          }
        : {}),
      max_completion_tokens: params.maxTokens ?? 4096,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string | null; tool_calls?: OpenAiToolCall[]; refusal?: string | null } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  if (!res.ok) {
    const retryAfter = Number(res.headers.get("retry-after"));
    throw classifyHttp(
      res.status,
      body.error?.message ?? `OpenAI API ${res.status}`,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
    );
  }

  const message = body.choices?.[0]?.message;
  if (!message?.content && !message?.tool_calls?.length && message?.refusal) {
    throw new Error(`OpenAI recusou a resposta: ${message.refusal}`);
  }
  const toolCalls = (message?.tool_calls ?? [])
    .filter((c) => c.function?.name)
    .map((c) => {
      let input: Record<string, unknown> = {};
      try {
        input = c.function?.arguments ? (JSON.parse(c.function.arguments) as Record<string, unknown>) : {};
      } catch {
        input = {};
      }
      return { name: c.function!.name!, input };
    });

  return {
    text: (message?.content ?? "").trim(),
    toolCalls,
    usage: {
      inputTokens: body.usage?.prompt_tokens ?? 0,
      outputTokens: body.usage?.completion_tokens ?? 0,
    },
  };
}

export async function runLlm(params: {
  system: string;
  messages: LlmMessage[];
  tools: LlmTool[];
  maxTokens?: number;
  /** Chave da loja. Ausente = chaves do deploy (a Vera). */
  creds?: LlmCreds | null;
}): Promise<LlmResult> {
  const creds = params.creds ?? null;
  if (creds?.provider === "claude") {
    const { runClaude } = await import("@wa/lib/llm-claude");
    return runClaude({
      apiKey: creds.apiKey,
      model: creds.model ?? undefined,
      system: params.system,
      messages: params.messages,
      tools: params.tools,
      maxTokens: params.maxTokens,
      onError: classifyHttp,
    });
  }
  if (creds?.provider === "openai") {
    return runOpenAi({ ...params, apiKey: creds.apiKey, model: creds.model });
  }
  if (!creds && llmProvider() === "openai") return runOpenAi(params);

  const apiKey = creds?.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) throw new LlmAuthError("GEMINI_API_KEY ausente");
  const geminiModel = creds?.model || GEMINI_MODEL;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: params.system }] },
        contents: params.messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        tools: [
          {
            functionDeclarations: params.tools.map((t) => ({
              name: t.name,
              description: t.description,
              parameters: toGeminiSchema(t.schema),
            })),
          },
        ],
        // Modelos com thinking contam o raciocínio dentro deste limite — 1024
        // deixava a resposta ser cortada antes do texto sair (só a tool call).
        generationConfig: { maxOutputTokens: params.maxTokens ?? 4096 },
      }),
    },
  );

  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; details?: unknown };
    promptFeedback?: { blockReason?: string };
    candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  if (!res.ok) {
    const retryAfterMs = geminiRetryDelayMs(body.error?.details) ?? undefined;
    throw classifyHttp(res.status, body.error?.message ?? `Gemini API ${res.status}`, retryAfterMs);
  }

  const parts = body.candidates?.[0]?.content?.parts ?? [];
  if (parts.length === 0 && body.promptFeedback?.blockReason) {
    throw new Error(`Gemini bloqueou a resposta: ${body.promptFeedback.blockReason}`);
  }

  const text = parts
    .filter((p) => typeof p.text === "string")
    .map((p) => p.text)
    .join("\n")
    .trim();
  const toolCalls = parts
    .filter((p) => p.functionCall?.name)
    .map((p) => ({
      name: p.functionCall!.name,
      input: (p.functionCall!.args ?? {}) as Record<string, unknown>,
    }));

  return {
    text,
    toolCalls,
    usage: {
      inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}
