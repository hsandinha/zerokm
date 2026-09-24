// Camada de LLM — Gemini (REST v1beta, sem SDK), portada do whatsappsocila.
// Erros classificados: transitório (429/5xx — resolve esperando) vs
// autenticação (401/403/402/404 — retry não adianta).

export type LlmTool = {
  name: string;
  description: string;
  schema: Record<string, unknown>;
};
export type LlmMessage = { role: "user" | "assistant"; content: string };
export type LlmToolCall = { name: string; input: Record<string, unknown> };
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

export async function runLlm(params: {
  system: string;
  messages: LlmMessage[];
  tools: LlmTool[];
  maxTokens?: number;
}): Promise<LlmResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new LlmAuthError("GEMINI_API_KEY ausente");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
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
