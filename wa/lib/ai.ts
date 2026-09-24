// IA de vendas da CNV — tira dúvidas usando a base de conhecimento, conduz ao
// cadastro (que já ativa o teste grátis de 24h da zerokm), gera a assinatura
// pelo Mercado Pago e transfere para um humano quando precisa. Motor: Gemini.

import dbConnect from "@/lib/mongodb";
import { WaContact, WaConversation, WaMessage, type IWaSettings } from "@wa/models/wa";
import { getSettings } from "@wa/lib/settings";
import { getWabaCredentials } from "@wa/lib/settings";
import { sendReaction } from "@wa/lib/meta";
import { sendAndLogText, showTyping } from "@wa/lib/send";
import { runLlm, type LlmMessage, type LlmTool, type LlmToolCall } from "@wa/lib/llm";
import { registerClient, getFunnelStatus, type RegisterErrorCode } from "@wa/lib/register";
import { createPixPayment, createPaymentLink, getActivePlans } from "@wa/lib/payments";
import { emitEvent } from "@wa/lib/webhooks";
import { advanceConversationStage } from "@wa/lib/conversation-stage";
import type { IPlan } from "@/models/Plan";

export const LOGIN_URL = () =>
  `${process.env.ZEROKM_BASE_URL || "https://www.cnv0km.com.br"}/login`;

// ── Ferramentas ──────────────────────────────────────────────
export const TOOLS: LlmTool[] = [
  {
    name: "criar_cadastro",
    description:
      "Cria a conta do lojista na plataforma CNV. Chame assim que tiver NOME COMPLETO e E-MAIL (CPF ou CNPJ é opcional, mas peça — é necessário para emitir o pagamento depois). O cadastro já ativa o TESTE GRÁTIS de 24h automaticamente. Após a criação, o sistema envia sozinho uma mensagem com o link de acesso e a senha temporária — NÃO invente credenciais no seu texto.",
    schema: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Nome completo do lojista (ou nome da loja)" },
        email: { type: "string", description: "E-mail para acesso" },
        documento: {
          type: "string",
          description: "CPF (11 dígitos) ou CNPJ (14 dígitos), se o cliente informou",
        },
        mensagem: {
          type: "string",
          description:
            "Frase curta e animada avisando que está criando a conta agora (enviada antes das credenciais)",
        },
      },
      required: ["nome", "email", "mensagem"],
    },
  },
  {
    name: "gerar_pagamento",
    description:
      "Gera a cobrança da assinatura de um plano para um cliente JÁ CADASTRADO (verifique a situação do cliente no seu contexto). metodo 'pix' envia o código PIX copia-e-cola direto no WhatsApp; metodo 'link' envia um link seguro do Mercado Pago com todas as formas (cartão em até 12x, PIX e boleto). O sistema envia sozinho o código/link após a sua mensagem — NÃO invente valores nem links.",
    schema: {
      type: "object",
      properties: {
        plan_id: {
          type: "string",
          description: "ID do plano escolhido (use exatamente o id listado nos planos do seu contexto)",
        },
        cobranca: { type: "string", enum: ["monthly", "annual"] },
        metodo: { type: "string", enum: ["pix", "link"] },
        mensagem: {
          type: "string",
          description: "Frase curta avisando que o pagamento está sendo gerado (enviada antes do código/link)",
        },
      },
      required: ["plan_id", "cobranca", "metodo", "mensagem"],
    },
  },
  {
    name: "transferir_para_humano",
    description:
      "Transfere a conversa para um atendente humano da CNV. Chame quando o cliente pedir para falar com uma pessoa, quando houver um problema que você não resolve (erro de pagamento repetido, reclamação, negociação especial) ou quando o assunto fugir totalmente do escopo.",
    schema: {
      type: "object",
      properties: {
        motivo: {
          type: "string",
          enum: ["pediu_humano", "problema_pagamento", "reclamacao", "fora_do_escopo", "negociacao"],
        },
        resumo: { type: "string", description: "Resumo do que o cliente precisa, para o atendente" },
        mensagem_despedida: {
          type: "string",
          description:
            "OBRIGATÓRIO. Frase curta avisando que um atendente da CNV assume a conversa em instantes.",
        },
      },
      required: ["motivo", "resumo", "mensagem_despedida"],
    },
  },
  {
    name: "reagir_mensagem",
    description:
      "Reaja com UM emoji à última mensagem do cliente para dar um toque humano — quando ele agradece, elogia ou fecha negócio. Use com parcimônia. A reação NUNCA substitui a resposta: sempre envie também o texto (ou outra ferramenta) na mesma vez. Ao reagir, use APENAS a ferramenta: nunca escreva o nome dela nem o emoji da reação no texto.",
    schema: {
      type: "object",
      properties: {
        emoji: { type: "string", description: "Um único emoji, ex: 👍 🚗 🤝 🎉 ✨" },
      },
      required: ["emoji"],
    },
  },
  {
    name: "encerrar_conversa",
    description:
      "Chame quando o cliente não tem interesse definitivo, pediu para parar de receber mensagens, ou é engano/spam.",
    schema: {
      type: "object",
      properties: {
        motivo: { type: "string", enum: ["sem_interesse", "opt_out", "engano", "spam"] },
        mensagem_despedida: { type: "string" },
      },
      required: ["motivo"],
    },
  },
];

// ── Base de conhecimento (padrão de fábrica — editável no painel) ──
export const DEFAULT_KNOWLEDGE_BASE = `CNV – COMÉRCIO NACIONAL DE VEÍCULOS
🚗 A plataforma que conecta lojistas ao estoque nacional de veículos 0km.

A solução CNV:
✅ Cadastro rápido – sua loja operando em menos de 24h
✅ Visibilidade total – estoque nacional em tempo real
✅ Negociação direta pela plataforma – sem burocracia
✅ Transparência – histórico e rastreabilidade de todas as negociações

O que o lojista ganha:
📦 Acesso a mais de 12.000 veículos 0km
🔗 Conexão com mais de 500 concessionárias em todo o Brasil
⚡ Agilidade para fechar negócios em minutos

CNV em números:
🏢 500+ concessionárias conectadas
🚘 12.000+ veículos disponíveis
🤝 500+ lojistas satisfeitos
📌 27 estados atendidos
⭐ 98% de satisfação

Onde atuamos:
🌎 Atuação nacional – Sudeste, Sul, Centro-Oeste, Nordeste e Norte.

Missão:
Digitalizar e modernizar o comércio de veículos 0km no Brasil, dando a todo lojista acesso rápido e transparente ao melhor estoque do país.

O futuro do comércio de veículos 0km já chegou.`;

// Variáveis que o sistema injeta no prompt na hora de rodar (o admin edita o
// texto no painel e usa estes marcadores onde quiser o conteúdo dinâmico).
export const PROMPT_VARS: Record<string, string> = {
  assistente: "Nome do assistente",
  agora: "Data e hora agora (Brasília)",
  saudacao: "Bloco da saudação inicial (vazio se você não definir uma)",
  conhecimento: "Base de conhecimento da CNV (editável no painel)",
  planos: "Planos ativos com preços (vêm do banco da zerokm)",
  situacao: "Situação do cliente no funil (sem cadastro / trial / assinante)",
  instrucoes: "Bloco das instruções extras (vazio se não houver)",
};

export const DEFAULT_SYSTEM_PROMPT = `Você é {{assistente}}, consultora de vendas.
Agora são {{agora}} (horário de Brasília).
{{saudacao}}
## Sua missão (funil de vendas — siga nesta ordem)
1. **Tirar dúvidas**: responda tudo sobre a CNV usando SOMENTE a base de conhecimento abaixo. Desperte interesse: fale dos números (12.000+ veículos, 500+ concessionárias) e do que o lojista ganha na prática;
2. **Conduzir ao cadastro**: seu objetivo é o cliente sair da conversa CADASTRADO. Assim que perceber interesse, proponha criar a conta agora mesmo — você mesma faz o cadastro pelo WhatsApp em 1 minuto. Colete: nome completo, e-mail e CPF ou CNPJ. Com nome + e-mail em mãos, chame criar_cadastro;
3. **Fechar a assinatura**: com o cadastro criado, apresente os planos e conduza ao pagamento. Pergunte a forma preferida (PIX na hora ou link com cartão em até 12x/boleto) e chame gerar_pagamento;
4. **Se houver resistência**: NÃO insista na venda — ofereça o TESTE GRÁTIS DE 24H. O teste é ativado automaticamente no cadastro, então basta convencer a pessoa a criar a conta ("crie a conta sem compromisso e veja o estoque por 24 horas, sem pagar nada"). Depois do teste, retome a conversa de assinatura;
5. **Cliente já assinante**: agradeça, tire dúvidas e ofereça ajuda com a plataforma.

## Base de conhecimento da CNV (só afirme o que está aqui)
{{conhecimento}}

## Planos disponíveis (preços reais — use exatamente estes valores e ids)
{{planos}}

## Situação deste cliente
{{situacao}}

## Regras
- Tom comercial, simpático e direto; mensagens CURTAS (é WhatsApp — 1 a 3 frases). Emojis com moderação;
- NUNCA invente números, preços, promoções, descontos ou funcionalidades. Preço é só o dos planos listados;
- Credenciais de acesso, código PIX e link de pagamento são enviados AUTOMATICAMENTE pelo sistema após as ferramentas — nunca escreva senha, código ou link no seu texto;
- Não peça senha ao cliente: a senha temporária é gerada pelo sistema e trocada no primeiro acesso;
- Se o cliente disser que já pagou, confira a "Situação deste cliente" acima (ela é atualizada a cada mensagem): se a assinatura consta ativa, comemore e confirme a liberação; se ainda não consta, explique que a confirmação do pagamento pode levar alguns minutos;
- Uma pergunta por vez; nunca mande formulário/lista de campos de uma vez;
- Se pedirem um humano, chame transferir_para_humano; se pedirem para parar de receber mensagens, chame encerrar_conversa com motivo opt_out;
- Responda sempre em português brasileiro.
{{instrucoes}}`;

// O modelo às vezes NARRA uma tool call como texto em vez de executá-la.
// Remove essas narrações; o que sobra é a fala de verdade.
const TOOL_LEAK_LINE =
  /\b(criar_cadastro|gerar_pagamento|transferir_para_humano|encerrar_conversa|reagir_mensagem|mensagem_despedida|plan_id|com_emoji)\b/i;

// Frases com que o modelo anuncia que já está executando algo. Se aparecerem
// sem tool call, a ação não aconteceu e o cliente ficaria no vácuo.
const PROMESSA_DE_ACAO =
  /\b(estou|vou|irei|já estou|to|tô)\s+(criando|criar|cadastrando|cadastrar|gerando|gerar|liberando|liberar|providenciando|emitindo|emitir)\b|\bsegundinho\b|\bum instante\b|\bagora mesmo\b|\bjá te envio\b|\bjá vou te (mandar|enviar)\b/i;

export function prometeuAcao(text: string | null | undefined): boolean {
  return PROMESSA_DE_ACAO.test(text ?? "");
}

/**
 * Resposta fixa para cada falha conhecida do cadastro. Erro de dado é problema
 * do cliente resolver — ele precisa da instrução exata, não de uma paráfrase.
 */
export const MENSAGEM_DE_FALHA_NO_CADASTRO: Partial<Record<RegisterErrorCode, string>> = {
  invalid_email:
    "Não consegui usar esse e-mail — parece que faltou alguma coisa no endereço (um ponto antes do .com, por exemplo). Pode me mandar de novo, completinho? 😊",
  invalid_name: "Preciso do seu nome completo para concluir o cadastro. Pode me confirmar?",
  invalid_document:
    "Esse documento não parece completo. Me manda o CPF (11 dígitos) ou o CNPJ (14 dígitos), por favor?",
  email_taken:
    "Esse e-mail já tem conta na CNV. Se for sua, é só acessar cnv0km.com.br e usar “Esqueci minha senha”. Se preferir cadastrar outro e-mail, me manda que eu crio agora.",
  document_taken:
    "Esse CPF/CNPJ já está cadastrado na CNV. Se a conta for sua, acesse cnv0km.com.br e use “Esqueci minha senha” — ou me diga outro documento para eu seguir.",
};

export function sanitizeAssistantText(raw: string | null | undefined): string {
  const lines = (raw ?? "").split(/\r?\n/).filter((line) => {
    const l = line.trim();
    if (!l) return false;
    if (TOOL_LEAK_LINE.test(l)) return false;
    if (/^[a-zà-ú]+(_[a-zà-ú]+)?\s*[:=]\s*\S/i.test(l) && /_|👍|👎/.test(l)) return false;
    return true;
  });
  return lines.join("\n").trim();
}

function formatPlans(plans: IPlan[]): string {
  if (plans.length === 0) {
    return "- (nenhum plano ativo cadastrado — em caso de interesse em assinar, transfira para um humano)";
  }
  return plans
    .map((p) => {
      const annual =
        typeof p.annualPrice === "number" && p.annualPrice > 0
          ? ` | anual: R$ ${p.annualPrice.toFixed(2)} (total)`
          : "";
      const features = (p.features ?? []).length > 0 ? ` — ${(p.features ?? []).join("; ")}` : "";
      return `- ${p.name} (id: ${p._id}) — mensal: R$ ${p.price.toFixed(2)}${annual}${features}`;
    })
    .join("\n");
}

export type FunnelInfo = Awaited<ReturnType<typeof getFunnelStatus>>;

export function formatFunnelStatus(status: FunnelInfo, contactName?: string | null): string {
  if (!status.registered) {
    return `- Cliente ${contactName ? `"${contactName}" ` : ""}AINDA NÃO TEM CADASTRO na CNV. Objetivo: criar o cadastro nesta conversa.`;
  }
  const u = status.user!;
  const lines = [
    `- Cliente JÁ CADASTRADO (${u.displayName ?? ""} — ${u.email}).`,
  ];
  if (u.subscriptionActive) {
    lines.push("- ASSINATURA ATIVA ✅ — cliente pagante. Não ofereça cadastro nem cobre assinatura de novo.");
  } else if (u.trialActive) {
    lines.push(
      `- TESTE GRÁTIS ATIVO até ${u.trialExpiresAt ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(u.trialExpiresAt)) : "?"} — sem assinatura paga ainda. Objetivo: converter em assinante.`,
    );
  } else {
    lines.push("- SEM assinatura ativa (teste grátis expirado ou nunca ativado). Objetivo: fechar a assinatura.");
  }
  return lines.join("\n");
}

export function buildSystemPrompt(params: {
  settings: Pick<
    IWaSettings,
    "assistantName" | "systemPrompt" | "knowledgeBase" | "greeting" | "extraInstructions"
  >;
  plans: IPlan[];
  funnelStatus: string;
}): string {
  const { settings } = params;
  const now = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  const greeting = settings.greeting?.trim();
  const values: Record<string, string> = {
    assistente: settings.assistantName || "Vera",
    agora: now,
    saudacao: greeting
      ? `\n## Primeira mensagem (obrigatório)\nSua PRIMEIRA resposta na conversa começa com esta saudação:\n"${greeting}"\n- Se o cliente ainda NÃO disse o que precisa: use a saudação exatamente como está;\n- Se ele JÁ disse: mantenha só a apresentação e emende direto no assunto dele.\nNas mensagens seguintes, não repita a apresentação.\n`
      : "",
    conhecimento: settings.knowledgeBase?.trim() || DEFAULT_KNOWLEDGE_BASE,
    planos: formatPlans(params.plans),
    situacao: params.funnelStatus,
    instrucoes: settings.extraInstructions?.trim()
      ? `\n## Instruções do administrador\n${settings.extraInstructions.trim()}`
      : "",
  };

  const template = settings.systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? "");
}

// ── Execução dos efeitos das ferramentas (compartilhada com o simulador) ──

export function credentialsMessage(email: string, tempPassword: string): string {
  return [
    "✅ *Cadastro criado com sucesso!*",
    "",
    `🔗 Acesse: ${LOGIN_URL()}`,
    `📧 E-mail: ${email}`,
    `🔑 Senha temporária: ${tempPassword}`,
    "",
    "No primeiro acesso você cria a sua senha definitiva.",
    "🎁 Seu *teste grátis de 24h* já está ativo — explore o estoque nacional à vontade!",
  ].join("\n");
}

export function pixMessage(planLabel: string, amount: number): string {
  return [
    `💳 *${planLabel}* — R$ ${amount.toFixed(2)}`,
    "",
    "Segue o PIX copia-e-cola na próxima mensagem — é só copiar e pagar no app do seu banco.",
    "Assim que o pagamento cair, seu acesso é liberado automaticamente. ✅",
  ].join("\n");
}

export function linkMessage(planLabel: string, amount: number, url: string): string {
  return [
    `💳 *${planLabel}* — R$ ${amount.toFixed(2)}`,
    "",
    `Pague com cartão (até 12x), PIX ou boleto neste link seguro do Mercado Pago:`,
    url,
    "",
    "Assim que o pagamento for confirmado, seu acesso é liberado automaticamente. ✅",
  ].join("\n");
}

async function transferToHuman(params: {
  conversationId: string;
  reason: string;
  summary?: string;
}) {
  await dbConnect();
  await WaConversation.updateOne(
    { _id: params.conversationId },
    {
      status: "waiting_human",
      transferReason: params.reason,
      // Marca o início da espera: é daqui que o SLA da Central conta.
      waitingSince: new Date(),
    },
  );
  await WaMessage.create({
    conversationId: params.conversationId,
    direction: "outbound",
    sender: "system",
    content: `— Transferido para atendimento humano (${params.reason})${params.summary ? `: ${params.summary}` : ""}`,
    mediaType: "text",
    status: "sent",
  });
  await emitEvent(
    "conversa.transferida",
    { reason: params.reason, summary: params.summary ?? null },
    { conversationId: params.conversationId },
  );
}

// Tools que encerram o turno com efeito próprio (cadastro, pagamento, etc.) —
// nelas a mensagem ao cliente vem do input da tool, não do texto solto.
const TERMINAL_TOOLS = new Set([
  "criar_cadastro",
  "gerar_pagamento",
  "transferir_para_humano",
  "encerrar_conversa",
]);

export type AiTurn = {
  /** Emojis de reagir_mensagem da primeira chamada (podem sair antes do texto). */
  reactions: string[];
  /** Tool calls a executar — reagir_mensagem já removida. */
  toolCalls: LlmToolCall[];
  /** Texto saneado da resposta. */
  replyText: string;
};

/**
 * Um turno completo da IA, com a proteção contra "reação sem texto": se o
 * modelo só reagiu (ou o texto era narração de tool e sumiu no saneamento),
 * refaz a chamada SEM a tool de reação, obrigando uma resposta de verdade.
 * Usada pelo fluxo real do WhatsApp e pelo simulador — mesmo cérebro nos dois.
 */
export async function runAiTurn(params: {
  system: string;
  messages: LlmMessage[];
  /** Chamado por reação assim que ela aparece, antes do retry (que é lento). */
  onReaction?: (emoji: string) => Promise<void> | void;
}): Promise<AiTurn> {
  const first = await runLlm({ system: params.system, messages: params.messages, tools: TOOLS });
  let toolCalls = first.toolCalls;
  let replyText = sanitizeAssistantText(first.text);

  const reactions = first.toolCalls
    .filter((t) => t.name === "reagir_mensagem")
    .map((t) => String((t.input as { emoji?: string }).emoji ?? "").trim());
  for (const emoji of reactions) {
    if (emoji) await params.onReaction?.(emoji);
  }

  // Só reagiu (sem texto) ou o texto inteiro era narração de tool: segunda
  // chamada sem a tool de reação. Se o modelo devolveu literalmente nada
  // (sem texto E sem tool), não insiste — deixa o chamador decidir.
  const needsRealReply =
    !replyText &&
    !toolCalls.some((t) => TERMINAL_TOOLS.has(t.name)) &&
    (toolCalls.length > 0 || first.text.trim().length > 0);
  if (needsRealReply) {
    const followUp = await runLlm({
      system: params.system,
      messages: params.messages,
      tools: TOOLS.filter((t) => t.name !== "reagir_mensagem"),
    });
    toolCalls = followUp.toolCalls;
    replyText = sanitizeAssistantText(followUp.text);
  }

  return {
    reactions,
    toolCalls: toolCalls.filter((t) => t.name !== "reagir_mensagem"),
    replyText,
  };
}

// ── Cérebro ──────────────────────────────────────────────────
export async function runAiForConversation(conversationId: string) {
  await dbConnect();

  const conv = await WaConversation.findById(conversationId);
  if (!conv || conv.status !== "ai_active") return;

  const contact = await WaContact.findById(conv.contactId);
  if (!contact || contact.optOut) return;

  const settings = await getSettings();
  if (!settings.aiActive) return;

  const history = await WaMessage.find({ conversationId })
    .sort({ createdAt: 1 })
    .limit(60)
    .then((msgs) => msgs.slice(-40));
  if (history.length === 0) return;

  const last = history[history.length - 1];
  if (last.direction !== "inbound") return; // nada novo a responder

  // Limite de turnos → transfere para humano
  const aiTurns = history.filter((m) => m.sender === "ai").length;
  if (aiTurns >= (settings.maxTurns || 30)) {
    await transferToHuman({
      conversationId,
      reason: "limite_de_mensagens",
      summary: "Limite de mensagens da IA atingido — ver histórico",
    });
    await sendAndLogText({
      conversationId,
      to: contact.phone,
      text: "Vou passar você para um atendente da nossa equipe continuar daqui, um instante! 😊",
      sender: "ai",
    });
    return;
  }

  const [plans, funnel] = await Promise.all([
    getActivePlans(),
    getFunnelStatus({
      userId: contact.userId,
      firebaseUid: contact.firebaseUid,
      phone: contact.phone,
      email: contact.email,
    }),
  ]);

  // A situação do cliente é recalculada a cada mensagem: se a assinatura está
  // ativa, o funil já fechou — a etapa acompanha sem ninguém arrastar cartão.
  if (funnel.registered && funnel.user?.subscriptionActive) {
    await advanceConversationStage(conversationId, "ganho");
  } else if (funnel.registered) {
    await advanceConversationStage(conversationId, "cadastro");
  }

  const systemPrompt = buildSystemPrompt({
    settings,
    plans,
    funnelStatus: formatFunnelStatus(funnel, contact.name),
  });

  const llmMessages: LlmMessage[] = history.map((m) => ({
    role: m.direction === "inbound" ? ("user" as const) : ("assistant" as const),
    content: m.content && m.content.trim().length > 0 ? m.content : `[${m.mediaType}]`,
  }));

  if (last.externalId) await showTyping(last.externalId);

  // Reações saem primeiro — são um extra, nunca a resposta em si.
  const creds = await getWabaCredentials();
  const { toolCalls: toolBlocks, replyText } = await runAiTurn({
    system: systemPrompt,
    messages: llmMessages,
    onReaction: async (emoji) => {
      if (!last.externalId || !creds) return;
      try {
        await sendReaction(creds, contact.phone, last.externalId, emoji);
        await WaMessage.updateOne({ externalId: last.externalId }, { reaction: emoji });
      } catch {
        // Reação é um extra — nunca derruba o atendimento
      }
    },
  });

  // Delay proporcional (parece humano digitando)
  const delayMs = Math.min(2000 + replyText.length * 25, 6000);
  await new Promise((r) => setTimeout(r, delayMs));

  // O modelo às vezes ANUNCIA a ação em texto ("estou criando seu cadastro
  // agora!") e não emite a tool call. Sem isto a mensagem sai, nada acontece e o
  // cliente fica esperando para sempre — foi o que aconteceu três vezes com o
  // mesmo lojista. Damos uma segunda chance exigindo a ferramenta.
  let tools = toolBlocks;
  if (tools.length === 0 && prometeuAcao(replyText)) {
    console.warn(`[ai] Promessa sem tool call: ${JSON.stringify(replyText.slice(0, 120))}`);
    const forced = await runLlm({
      system: systemPrompt,
      messages: [
        ...llmMessages,
        { role: "assistant", content: replyText },
        {
          role: "user",
          content:
            "[SISTEMA] Você anunciou uma ação (cadastro ou pagamento) mas NÃO chamou a ferramenta, " +
            "então nada foi executado e o cliente está esperando. Chame AGORA a ferramenta correspondente. " +
            "Se faltar algum dado obrigatório, não prometa de novo: peça o dado que falta em uma frase curta.",
        },
      ],
      tools: TOOLS,
    });
    tools = forced.toolCalls;

    if (tools.length === 0) {
      // Nem na segunda tentativa. Melhor perguntar do que deixar no vácuo.
      const fallback =
        sanitizeAssistantText(forced.text) ||
        "Me confirma seu nome completo e o e-mail, por favor? Assim eu concluo seu cadastro agora. 😊";
      await sendAndLogText({ conversationId, to: contact.phone, text: fallback, sender: "ai" });
      return;
    }
  }

  for (const tool of tools) {
    if (tool.name === "criar_cadastro") {
      const input = tool.input as {
        nome?: string;
        email?: string;
        documento?: string;
        mensagem?: string;
      };
      const intro = sanitizeAssistantText(input.mensagem) || replyText;
      if (intro) {
        await sendAndLogText({ conversationId, to: contact.phone, text: intro, sender: "ai" });
      }
      const result = await registerClient({
        nome: input.nome ?? contact.name ?? "",
        email: input.email ?? "",
        documento: input.documento,
        telefone: contact.phone,
        contactId: contact._id.toString(),
      });
      if (result.ok) {
        await sendAndLogText({
          conversationId,
          to: contact.phone,
          text: credentialsMessage((input.email ?? "").toLowerCase().trim(), result.tempPassword),
          sender: "system",
        });
        // Conta criada = teste grátis de 24h rodando: o funil andou.
        await advanceConversationStage(conversationId, "cadastro");
        await emitEvent(
          "cadastro.criado",
          {
            registration: {
              name: input.nome ?? null,
              email: (input.email ?? "").toLowerCase().trim(),
              document: input.documento ?? null,
            },
          },
          { conversationId },
        );
      } else if (result.code === "infra") {
        // O dado do cliente estava certo — quem falhou fomos nós (credencial do
        // Firebase, banco fora). Pedir para ele repetir nome e e-mail não
        // conserta nada e queima o lead: avisa uma vez e passa para um humano,
        // que recebe o motivo técnico na nota interna da conversa.
        await sendAndLogText({
          conversationId,
          to: contact.phone,
          text: "Deu um problema aqui do nosso lado para concluir seu cadastro agora — não foi nada que você digitou. Já chamei alguém da equipe para resolver e te dar o acesso, é rapidinho! 🙏",
          sender: "system",
        });
        await transferToHuman({
          conversationId,
          reason: "falha_cadastro",
          summary: `Cadastro falhou por problema nosso: ${result.error}${result.detail ? ` (${result.detail})` : ""}. Dados do cliente: ${input.nome ?? "?"} / ${input.email ?? "?"}${input.documento ? ` / ${input.documento}` : ""}.`,
        });
        console.error(`[ai] Cadastro falhou por infraestrutura: ${result.detail ?? result.error}`);
        return;
      } else {
        // Mensagem determinística para as falhas conhecidas. Deixar a IA
        // "explicar" o erro produziu alucinação grave: com o cadastro falhando
        // ela afirmou que a conta já estava ativa e emitiu cobrança de um plano
        // para um cliente que não existia no sistema.
        const aviso = MENSAGEM_DE_FALHA_NO_CADASTRO[result.code];
        if (aviso) {
          await sendAndLogText({ conversationId, to: contact.phone, text: aviso, sender: "system" });
          console.warn(`[ai] Cadastro falhou (${result.code}): ${result.error}`);
          return;
        }

        // Falha inesperada: a IA conduz, mas sem afirmar que existe cadastro.
        const recovery = await runLlm({
          system: systemPrompt,
          messages: [
            ...llmMessages,
            {
              role: "user",
              content:
                `[SISTEMA] A tentativa de cadastro falhou: ${result.error}. ` +
                "O cliente NÃO foi cadastrado — não afirme que ele tem conta, não ofereça assinatura " +
                "e não gere pagamento. Peça desculpas em uma frase e ofereça tentar novamente.",
            },
          ],
          tools: TOOLS.filter((t) => t.name !== "gerar_pagamento" && t.name !== "reagir_mensagem"),
        });
        const recoveryText = sanitizeAssistantText(recovery.text);
        await sendAndLogText({
          conversationId,
          to: contact.phone,
          text:
            recoveryText ||
            "Tive um problema para concluir seu cadastro agora. Pode me confirmar seu nome completo e e-mail para eu tentar de novo?",
          sender: "ai",
        });
      }
      return;
    }

    if (tool.name === "gerar_pagamento") {
      const input = tool.input as {
        plan_id?: string;
        cobranca?: "monthly" | "annual";
        metodo?: "pix" | "link";
        mensagem?: string;
      };
      const intro = sanitizeAssistantText(input.mensagem) || replyText;
      if (intro) {
        await sendAndLogText({ conversationId, to: contact.phone, text: intro, sender: "ai" });
      }

      // Precisa do vínculo com o usuário da zerokm
      let firebaseUid = contact.firebaseUid;
      if (!firebaseUid) {
        const status = await getFunnelStatus({
          userId: contact.userId,
          firebaseUid: contact.firebaseUid,
          phone: contact.phone,
          email: contact.email,
        });
        if (status.registered && status.user) {
          const User = (await import("@/models/User")).default;
          const u = await User.findOne({ email: status.user.email });
          firebaseUid = u?.firebaseUid;
        }
      }

      const billing = input.cobranca === "annual" ? "annual" : "monthly";
      const planId = input.plan_id ?? "";
      let failure: string | null = null;

      if (!firebaseUid) {
        failure = "cliente ainda sem cadastro vinculado";
      } else if (input.metodo === "pix") {
        const pix = await createPixPayment({ planId, firebaseUid, billing });
        if (pix.ok) {
          const plan = plans.find((p) => String(p._id) === planId);
          await sendAndLogText({
            conversationId,
            to: contact.phone,
            text: pixMessage(
              `${plan?.name ?? "Assinatura CNV"} (${billing === "annual" ? "anual" : "mensal"})`,
              pix.amount,
            ),
            sender: "system",
          });
          await sendAndLogText({
            conversationId,
            to: contact.phone,
            text: pix.qrCode,
            sender: "system",
          });
          await advanceConversationStage(conversationId, "pagamento");
          await emitEvent(
            "pagamento.gerado",
            { payment: { method: "pix", planId, billing, amount: pix.amount } },
            { conversationId },
          );
        } else {
          failure = pix.error;
        }
      } else {
        const link = await createPaymentLink({ planId, firebaseUid, billing });
        if (link.ok) {
          const plan = plans.find((p) => String(p._id) === planId);
          await sendAndLogText({
            conversationId,
            to: contact.phone,
            text: linkMessage(
              `${plan?.name ?? "Assinatura CNV"} (${billing === "annual" ? "anual" : "mensal"})`,
              link.amount,
              link.url,
            ),
            sender: "system",
          });
          await advanceConversationStage(conversationId, "pagamento");
          await emitEvent(
            "pagamento.gerado",
            { payment: { method: "link", planId, billing, amount: link.amount, url: link.url } },
            { conversationId },
          );
        } else {
          failure = link.error;
        }
      }

      if (failure) {
        const recovery = await runLlm({
          system: systemPrompt,
          messages: [
            ...llmMessages,
            {
              role: "user",
              content: `[SISTEMA] A geração do pagamento falhou: ${failure}. Explique ao cliente em uma frase e proponha alternativa (outro método, ou transferir para um humano se persistir).`,
            },
          ],
          tools: TOOLS.filter((t) => t.name !== "gerar_pagamento" && t.name !== "reagir_mensagem"),
        });
        const recoveryText = sanitizeAssistantText(recovery.text);
        if (recoveryText) {
          await sendAndLogText({ conversationId, to: contact.phone, text: recoveryText, sender: "ai" });
        }
      }
      return;
    }

    if (tool.name === "transferir_para_humano") {
      const input = tool.input as {
        motivo?: string;
        resumo?: string;
        mensagem_despedida?: string;
      };
      const bye = sanitizeAssistantText(input.mensagem_despedida) || replyText;
      if (bye) {
        await sendAndLogText({ conversationId, to: contact.phone, text: bye, sender: "ai" });
      }
      await transferToHuman({
        conversationId,
        reason: input.motivo ?? "pediu_humano",
        summary: input.resumo,
      });
      return;
    }

    if (tool.name === "encerrar_conversa") {
      const input = tool.input as { motivo?: string; mensagem_despedida?: string };
      const bye = sanitizeAssistantText(input.mensagem_despedida) || replyText;
      if (bye) {
        await sendAndLogText({ conversationId, to: contact.phone, text: bye, sender: "ai" });
      }
      if (input.motivo === "opt_out") {
        await WaContact.updateOne({ _id: contact._id }, { optOut: true });
        await emitEvent("contato.optout", { phone: contact.phone, via: "ia" }, { conversationId });
      }
      const outcome =
        input.motivo === "opt_out"
          ? "opt_out"
          : input.motivo === "sem_interesse"
            ? "sem_interesse"
            : null;
      await WaConversation.updateOne(
        { _id: conversationId },
        {
          status: "closed",
          waitingSince: null,
          ...(outcome ? { outcome } : {}),
          // Quem já era assinante não vira "perdido" por encerrar a conversa.
          ...(conv.stage === "ganho" ? {} : { stage: "perdido", stageChangedAt: new Date() }),
        },
      );
      await emitEvent(
        "conversa.resolvida",
        { by: "ia", reason: input.motivo ?? null },
        { conversationId },
      );
      return;
    }
  }

  // Resposta normal (sem tool terminal)
  if (replyText) {
    await sendAndLogText({ conversationId, to: contact.phone, text: replyText, sender: "ai" });
  }
}
