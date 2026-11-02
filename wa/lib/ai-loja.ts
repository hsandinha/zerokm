// IA de vendas das LOJAS (concessionárias e lojistas que assinam o
// atendimento). Mesmo motor da Vera — fila, canais, central —, outro cérebro:
// em vez de vender a assinatura do CNV, vende carro do estoque da zerokm.
//
// O que ela faz:
//   1. entende o que a pessoa procura e consulta o estoque (buscar_estoque) —
//      preço, cor e disponibilidade só saem da consulta, nunca do modelo;
//   2. simula a parcela com a taxa da loja (simular_financiamento) — a conta é
//      do sistema;
//   3. leva para o próximo passo: visita ou test drive (agendar_visita), que
//      vai para a fila da equipe e, na concessionária, vira lead + tarefa no
//      CRM que ela já usa;
//   4. carro na troca / quer vender o carro → registrar_captacao;
//   5. desconto, crédito, pediu gente → transferir_para_vendedor.
//
// Ferramentas de CONSULTA (estoque, simulação) devolvem o resultado para o
// modelo e ele responde em seguida; as de AÇÃO encerram o turno com a frase
// que o próprio modelo escreveu no campo da ferramenta.

import dbConnect from "@/lib/mongodb";
import { WaContact, WaConversation, WaMessage, type IWaContact } from "@wa/models/wa";
import type { IWaStore } from "@wa/models/store";
import { reactOnChannel, sendAndLogText, showTyping } from "@wa/lib/send";
import { channelForConversation, isInstagramPhone, safeDecrypt, type ResolvedChannel } from "@wa/lib/channels";
import { runLlm, type LlmCreds, type LlmMessage, type LlmTool, type LlmToolCall } from "@wa/lib/llm";
import { sanitizeAssistantText } from "@wa/lib/ai";
import { getStore, storeIsActive } from "@wa/lib/store";
import { buscarEstoque, ofertasParaIa, type FiltrosEstoque } from "@wa/lib/estoque";
import { numeroDeReais, simular, simuladorDaLoja } from "@wa/lib/simulador";
import { registrarNoCrm } from "@wa/lib/crm-loja";
import { advanceConversationStage } from "@wa/lib/conversation-stage";
import { emitEvent } from "@wa/lib/webhooks";
import { parsePhoneBr } from "@wa/lib/phone";

// ── Ferramentas ──────────────────────────────────────────────
const T_BUSCAR: LlmTool = {
  name: "buscar_estoque",
  description:
    "Consulta o estoque que a loja pode vender. Use SEMPRE antes de falar de carro, preço, cor ou disponibilidade. Pode chamar de novo com outros filtros.",
  schema: {
    type: "object",
    properties: {
      termo: { type: "string", description: "Marca/modelo/características, ex: 'onix automático', 'hilux diesel'" },
      preco_min: { type: "number" },
      preco_max: { type: "number", description: "Teto de preço em reais" },
      ano_min: { type: "number" },
      tipo: { type: "string", enum: ["0km", "usado", "todos"] },
    },
  },
};

const T_SIMULAR: LlmTool = {
  name: "simular_financiamento",
  description:
    "Simula a parcela (tabela Price) com a taxa, a entrada mínima e os prazos da loja. Use quando perguntarem de parcela, entrada ou 'quanto fica por mês', ou o inverso ('o que cabe em R$ 2 mil por mês'). Nunca faça a conta de cabeça.",
  schema: {
    type: "object",
    properties: {
      valor: { type: "number", description: "Preço do carro (da consulta de estoque)" },
      entrada: { type: "number", description: "Entrada que o cliente disse ter" },
      prazo: { type: "number", description: "Prazo em meses, se o cliente pediu um" },
      parcela_desejada: { type: "number", description: "Parcela que o cliente quer pagar" },
    },
  },
};

const T_INTERESSE: LlmTool = {
  name: "registrar_interesse",
  description:
    "Anota o interesse do cliente num carro (ou no perfil de carro que procura) para a equipe. Chame quando o cliente demonstrar interesse claro. Depois continue a conversa normalmente.",
  schema: {
    type: "object",
    properties: {
      ref: { type: "string", description: "Código do carro na consulta, ex: N1A2B3C (se houver)" },
      veiculo: { type: "string", description: "Carro de interesse em texto" },
      resumo: { type: "string", description: "O que o cliente quer: uso, pagamento, troca, prazo" },
    },
    required: ["resumo"],
  },
};

const T_VISITA: LlmTool = {
  name: "agendar_visita",
  description:
    "Registra o pedido de visita à loja ou de test drive com o dia/horário que o cliente quer, e passa para a equipe confirmar. Use quando o cliente topar ir à loja ou pedir test drive.",
  schema: {
    type: "object",
    properties: {
      tipo: { type: "string", enum: ["visita", "test_drive"] },
      quando: { type: "string", description: "Dia e horário como o cliente disse, ex: 'sábado de manhã', '12/11 às 15h'" },
      data_iso: { type: "string", description: "A mesma data em ISO (AAAA-MM-DDTHH:mm), se der para saber" },
      veiculo: { type: "string" },
      telefone: { type: "string", description: "Celular com DDD — OBRIGATÓRIO no Instagram (no WhatsApp já temos)" },
      resumo: { type: "string" },
      mensagem: { type: "string", description: "OBRIGATÓRIO. Frase curta dizendo que a equipe confirma o horário em instantes" },
    },
    required: ["tipo", "quando", "resumo", "mensagem"],
  },
};

const T_CAPTACAO: LlmTool = {
  name: "registrar_captacao",
  description:
    "O cliente tem carro para dar na troca ou quer vender o carro dele. Registra os dados para avaliação da equipe e passa a conversa para ela. Pergunte antes marca, modelo, ano e km.",
  schema: {
    type: "object",
    properties: {
      veiculo_cliente: { type: "string", description: "Marca, modelo e versão do carro do cliente" },
      ano: { type: "string" },
      km: { type: "number" },
      objetivo: { type: "string", enum: ["troca", "venda"] },
      resumo: { type: "string" },
      mensagem: { type: "string", description: "OBRIGATÓRIO. Frase curta dizendo que a equipe avalia e retorna" },
    },
    required: ["veiculo_cliente", "objetivo", "mensagem"],
  },
};

const T_TRANSFERIR: LlmTool = {
  name: "transferir_para_vendedor",
  description:
    "Passa a conversa para um vendedor. Use quando pedirem desconto/negociação, aprovação de crédito, valor exato da troca, pediram uma pessoa, reclamação, ou quando o assunto fugir do que você sabe.",
  schema: {
    type: "object",
    properties: {
      motivo: { type: "string", enum: ["pediu_humano", "negociacao", "credito", "reclamacao", "fora_do_escopo"] },
      resumo: { type: "string", description: "Resumo para o vendedor" },
      mensagem: { type: "string", description: "OBRIGATÓRIO. Frase curta avisando que um vendedor assume em instantes" },
    },
    required: ["motivo", "resumo", "mensagem"],
  },
};

const T_LOCAL: LlmTool = {
  name: "enviar_localizacao",
  description: "Envia o link do endereço da loja no mapa. Use quando pedirem o endereço ou como chegar.",
  schema: { type: "object", properties: {} },
};

const T_REAGIR: LlmTool = {
  name: "reagir_mensagem",
  description:
    "Reage com UM emoji à última mensagem do cliente (agradecimento, elogio, fechamento). Nunca substitui a resposta em texto.",
  schema: { type: "object", properties: { emoji: { type: "string" } }, required: ["emoji"] },
};

const T_ENCERRAR: LlmTool = {
  name: "encerrar_conversa",
  description: "Cliente sem interesse definitivo, pediu para parar de receber mensagens, engano ou spam.",
  schema: {
    type: "object",
    properties: {
      motivo: { type: "string", enum: ["sem_interesse", "opt_out", "engano", "spam"] },
      mensagem: { type: "string" },
    },
    required: ["motivo"],
  },
};

const CONSULTAS = new Set(["buscar_estoque", "simular_financiamento", "registrar_interesse", "enviar_localizacao"]);

export function toolsDaLoja(store: Pick<IWaStore, "financiamento" | "mapsUrl">): LlmTool[] {
  return [
    T_BUSCAR,
    ...(store.financiamento?.ativo ? [T_SIMULAR] : []),
    T_INTERESSE,
    T_VISITA,
    T_CAPTACAO,
    T_TRANSFERIR,
    ...(store.mapsUrl ? [T_LOCAL] : []),
    T_REAGIR,
    T_ENCERRAR,
  ];
}

// ── Prompt ───────────────────────────────────────────────────
export const STORE_PROMPT_VARS: Record<string, string> = {
  assistente: "Nome da assistente",
  loja: "Nome da loja",
  agora: "Data e hora agora (Brasília)",
  saudacao: "Bloco da saudação inicial (vazio se não houver)",
  conhecimento: "Sobre a loja (endereço, horário, diferenciais — editável)",
  estoque: "O que a loja vende (estoque próprio / rede CNV)",
  canal: "Canal desta conversa (WhatsApp ou Instagram)",
  instrucoes: "Instruções extras (vazio se não houver)",
};

export const DEFAULT_STORE_PROMPT = `Você é {{assistente}}, consultor(a) de vendas da {{loja}}.
Agora são {{agora}} (horário de Brasília).
{{saudacao}}
## Sua missão (nesta ordem)
1. Entender o que o cliente procura: modelo ou tipo de carro, 0km ou seminovo, faixa de preço, como vai pagar (à vista, financiado, consórcio) e se tem carro na troca. Uma pergunta por vez;
2. Mostrar opções: SEMPRE consulte buscar_estoque antes de falar de carro, preço, cor ou disponibilidade. Mostre no máximo 3 opções por mensagem, com o principal (modelo, ano, km, preço);
3. Parcela: se o cliente perguntar, use simular_financiamento (quando disponível). Nunca faça conta de cabeça;
4. Próximo passo: a venda acontece na loja. Convide para visita ou test drive e use agendar_visita com o dia/horário que o cliente disser;
5. Carro na troca ou quer vender o carro dele: pergunte marca, modelo, ano e km e use registrar_captacao;
6. Desconto, negociação, aprovação de crédito, valor exato da troca ou pedido de falar com alguém: transferir_para_vendedor.

## O que a loja vende
{{estoque}}

## Sobre a loja (só afirme o que está aqui)
{{conhecimento}}

{{canal}}

## Regras
- Tom simpático, consultivo e direto; mensagens CURTAS (1 a 3 frases). Emojis com moderação;
- Preço, cor, disponibilidade, prazo e condições: SÓ o que veio da consulta. Se não encontrou, diga que não tem no momento e ofereça alternativas parecidas;
- Desconto, valor da troca e aprovação de crédito quem confirma é a equipe — não prometa;
- Fale sempre como a loja. Nunca diga de qual concessionária, fornecedor ou parceiro vem o carro;
- Os códigos entre colchetes ([N1A2B3]) são internos: use nas ferramentas, nunca mostre ao cliente;
- Responda sempre em português brasileiro.
{{instrucoes}}`;

function blocoDoCanal(channel: Pick<ResolvedChannel, "kind" | "label">): string {
  if (channel.kind === "instagram") {
    return [
      "## Canal desta conversa: Direct do Instagram",
      "- Você NÃO tem o celular do cliente. Para agendar visita/test drive, peça o celular com DDD e passe em telefone;",
      "- O Direct não formata *negrito*: escreva texto simples.",
    ].join("\n");
  }
  return "## Canal desta conversa: WhatsApp\n- O celular do cliente é o deste WhatsApp.";
}

function blocoDoEstoque(store: Pick<IWaStore, "kind" | "ai">): string {
  if (store.kind === "concessionaria") {
    return "- Os 0km e os seminovos da própria concessionária (consulte sempre).";
  }
  return store.ai?.vendeEstoqueCnv
    ? "- Os carros do pátio da loja (aparecem primeiro na consulta) e também 0km e seminovos de toda a rede parceira, que a loja consegue entregar. Prazo de entrega dos 0km vem na consulta."
    : "- Os carros do pátio da loja (consulte sempre).";
}

export function buildStorePrompt(params: {
  store: Pick<IWaStore, "name" | "kind" | "ai">;
  channel: Pick<ResolvedChannel, "kind" | "label">;
}): string {
  const { store } = params;
  const ai = store.ai;
  const now = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
  const greeting = ai?.greeting?.trim();
  const values: Record<string, string> = {
    assistente: ai?.assistantName || "Assistente",
    loja: store.name,
    agora: now,
    saudacao: greeting
      ? `\n## Primeira mensagem\nSua PRIMEIRA resposta começa com esta saudação: "${greeting}" (se o cliente já disse o que quer, mantenha só a apresentação e emende no assunto). Não repita depois.\n`
      : "",
    conhecimento: ai?.knowledgeBase?.trim() || "(a loja ainda não preencheu — endereço e horário: transfira para um vendedor)",
    estoque: blocoDoEstoque(store),
    canal: blocoDoCanal(params.channel),
    instrucoes: ai?.extraInstructions?.trim() ? `\n## Instruções da loja\n${ai.extraInstructions.trim()}` : "",
  };
  let template = ai?.systemPrompt?.trim() || DEFAULT_STORE_PROMPT;
  if (!template.includes("{{canal}}")) template += "\n\n{{canal}}";
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? "");
}

/** Chave da IA da loja. Sem chave a loja não tem IA (a zerokm não paga). */
export function credsDaLoja(store: Pick<IWaStore, "ai">): LlmCreds | null {
  const apiKey = safeDecrypt(store.ai?.token);
  if (!apiKey) return null;
  return { provider: store.ai.provider ?? "gemini", apiKey, model: store.ai.model || null };
}

// ── Execução das ferramentas de consulta ─────────────────────
export async function executarConsulta(
  store: IWaStore,
  call: LlmToolCall,
  ctx: { conversationId?: string; contact?: IWaContact | null; send?: (text: string) => Promise<void> },
): Promise<string> {
  const input = call.input as Record<string, unknown>;
  if (call.name === "buscar_estoque") {
    const filtros: FiltrosEstoque = {
      termo: typeof input.termo === "string" ? input.termo : undefined,
      precoMin: numeroDeReais(input.preco_min) ?? undefined,
      precoMax: numeroDeReais(input.preco_max) ?? undefined,
      anoMin: Number(input.ano_min) || undefined,
      tipo: input.tipo === "0km" || input.tipo === "usado" ? input.tipo : "todos",
    };
    const { ofertas } = await buscarEstoque(store, filtros);
    return ofertasParaIa(ofertas);
  }
  if (call.name === "simular_financiamento") {
    const r = simular(simuladorDaLoja(store.financiamento), {
      valor: numeroDeReais(input.valor),
      entrada: numeroDeReais(input.entrada),
      prazo: Number(input.prazo) || null,
      parcelaDesejada: numeroDeReais(input.parcela_desejada),
    });
    if (ctx.conversationId) await advanceConversationStage(ctx.conversationId, "pagamento");
    return [r.aviso, ...r.linhas].filter(Boolean).join("\n") || "Sem dados suficientes para simular.";
  }
  if (call.name === "registrar_interesse") {
    if (ctx.contact) {
      const veiculo = [input.ref ? `[${input.ref}]` : null, input.veiculo].filter(Boolean).join(" ");
      await registrarNoCrm({
        store,
        contact: ctx.contact,
        nota: `Interesse${veiculo ? ` em ${veiculo}` : ""}: ${String(input.resumo ?? "")}`,
      }).catch((err) => console.error("[ai-loja] CRM:", err));
    }
    return "Interesse anotado para a equipe. Continue a conversa.";
  }
  if (call.name === "enviar_localizacao") {
    if (store.mapsUrl && ctx.send) {
      await ctx.send(`📍 ${store.name}: ${store.mapsUrl}`);
      return "Link do endereço enviado ao cliente.";
    }
    return "A loja não cadastrou o endereço no mapa.";
  }
  return "Ferramenta desconhecida.";
}

const MAX_CONSULTAS = 4;

/**
 * Um turno da IA da loja: chama o modelo, executa as consultas e chama de
 * novo com o resultado, até o modelo responder ou acionar uma ação. Usado
 * pela conversa real e pelo simulador da configuração.
 */
export async function runStoreTurn(params: {
  store: IWaStore;
  system: string;
  messages: LlmMessage[];
  creds: LlmCreds;
  onConsulta: (call: LlmToolCall) => Promise<string>;
  onReaction?: (emoji: string) => Promise<void>;
}): Promise<{ replyText: string; acao: LlmToolCall | null }> {
  const tools = toolsDaLoja(params.store);
  const messages = [...params.messages];
  for (let i = 0; i <= MAX_CONSULTAS; i++) {
    const result = await runLlm({ system: params.system, messages, tools, creds: params.creds });
    const replyText = sanitizeAssistantText(result.text);
    for (const t of result.toolCalls.filter((c) => c.name === "reagir_mensagem")) {
      const emoji = String((t.input as { emoji?: string }).emoji ?? "").trim();
      if (emoji) await params.onReaction?.(emoji);
    }
    const calls = result.toolCalls.filter((c) => c.name !== "reagir_mensagem");
    const acao = calls.find((c) => !CONSULTAS.has(c.name)) ?? null;
    if (acao) return { replyText, acao };
    const consultas = calls.filter((c) => CONSULTAS.has(c.name));
    if (!consultas.length) return { replyText, acao: null };

    // Consulta: o resultado volta para o modelo como mensagem do sistema.
    const resultados: string[] = [];
    for (const c of consultas) {
      resultados.push(`Resultado de ${c.name}:\n${await params.onConsulta(c)}`);
    }
    if (replyText) messages.push({ role: "assistant", content: replyText });
    messages.push({
      role: "user",
      content: `[SISTEMA — não é o cliente]\n${resultados.join("\n\n")}\n\nAgora responda ao cliente com base nisso.`,
    });
  }
  return { replyText: "", acao: null };
}

// ── Conversa real ────────────────────────────────────────────
async function paraEquipe(conversationId: string, reason: string, summary?: string) {
  await WaConversation.updateOne(
    { _id: conversationId },
    { status: "waiting_human", transferReason: reason, waitingSince: new Date() },
  );
  await WaMessage.create({
    conversationId,
    direction: "outbound",
    sender: "system",
    content: `— Para a equipe (${reason})${summary ? `: ${summary}` : ""}`,
    mediaType: "text",
    status: "sent",
  });
  await emitEvent("conversa.transferida", { reason, summary: summary ?? null }, { conversationId });
}

function dataDoPedido(iso: unknown): Date {
  const d = typeof iso === "string" ? new Date(iso) : null;
  if (d && !Number.isNaN(d.getTime()) && d.getTime() > Date.now() - 86400_000) return d;
  return new Date(Date.now() + 2 * 3600_000); // sem data clara: a equipe confirma em 2h
}

export async function runStoreAiForConversation(conversationId: string): Promise<void> {
  await dbConnect();
  const conv = await WaConversation.findById(conversationId);
  if (!conv || conv.status !== "ai_active" || !conv.tenantId) return;
  const contact = await WaContact.findById(conv.contactId);
  if (!contact || contact.optOut) return;
  const store = await getStore(conv.tenantId);
  if (!store) return;

  // Sem IA ligada, sem chave ou sem assinatura: a conversa vai direto para a
  // fila da equipe — nunca fica parada esperando uma IA que não vai responder.
  const creds = credsDaLoja(store);
  if (!store.ai?.active || !creds || !storeIsActive(store)) {
    const motivo = !storeIsActive(store) ? "assinatura_inativa" : !creds ? "ia_sem_chave" : "ia_desligada";
    await paraEquipe(conversationId, motivo);
    return;
  }

  const history = await WaMessage.find({ conversationId })
    .sort({ createdAt: 1 })
    .limit(60)
    .then((msgs) => msgs.slice(-40));
  const last = history[history.length - 1];
  if (!last || last.direction !== "inbound") return;

  if (history.filter((m) => m.sender === "ai").length >= (store.ai.maxTurns || 30)) {
    await sendAndLogText({
      conversationId,
      to: contact.phone,
      text: "Vou chamar um vendedor da nossa equipe para continuar com você, um instante! 😊",
      sender: "ai",
    });
    await paraEquipe(conversationId, "limite_de_mensagens");
    return;
  }

  const channel = await channelForConversation(conv);
  const system = buildStorePrompt({ store, channel });
  const messages: LlmMessage[] = history.map((m) => ({
    role: m.direction === "inbound" ? "user" : "assistant",
    content: m.content && m.content.trim() ? m.content : `[${m.mediaType}]`,
  }));
  const send = (text: string) =>
    sendAndLogText({ conversationId, to: contact.phone, text, sender: "ai" }).then(() => undefined);

  if (last.externalId) {
    await showTyping({ conversationId, to: contact.phone, lastInboundExternalId: last.externalId });
  }

  // Chave recusada (LlmAuthError) sobe para o worker, que manda para a equipe.
  const { replyText, acao } = await runStoreTurn({
    store,
    system,
    messages,
    creds,
    onConsulta: (call) => executarConsulta(store, call, { conversationId, contact, send }),
    onReaction: async (emoji) => {
      if (!last.externalId) return;
      try {
        const sent = await reactOnChannel({
          conversationId,
          to: contact.phone,
          messageExternalId: last.externalId,
          emoji,
        });
        await WaMessage.updateOne({ externalId: last.externalId }, { reaction: sent });
      } catch {
        // Reação é um extra — nunca derruba o atendimento.
      }
    },
  });

  await new Promise((r) => setTimeout(r, Math.min(1500 + replyText.length * 20, 5000)));

  if (!acao) {
    if (replyText) await send(replyText);
    else await paraEquipe(conversationId, "ia_sem_resposta");
    return;
  }

  const input = acao.input as Record<string, unknown>;
  const fala = sanitizeAssistantText(String(input.mensagem ?? "")) || replyText;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  if (acao.name === "agendar_visita") {
    // No Direct não há telefone: sem um celular válido, a visita não sai.
    let celular: string | null = null;
    if (isInstagramPhone(contact.phone)) {
      const p = parsePhoneBr(str(input.telefone) || contact.whatsappPhone || "");
      if (!p.valid || !p.e164) {
        await send("Para a equipe confirmar o horário com você, me passa seu celular com DDD? 😊");
        return;
      }
      celular = p.e164;
      await WaContact.updateOne({ _id: contact._id }, { whatsappPhone: celular });
      contact.whatsappPhone = celular;
    }
    const tipo = input.tipo === "test_drive" ? "Test drive" : "Visita";
    const nota = `${tipo} pedido para ${str(input.quando)}${str(input.veiculo) ? ` — ${str(input.veiculo)}` : ""}. ${str(input.resumo)}`;
    if (fala) await send(fala);
    await registrarNoCrm({
      store,
      contact,
      nota,
      tarefa: { titulo: `${tipo}: ${contact.name || "cliente"} — ${str(input.quando)}`, quando: dataDoPedido(input.data_iso) },
    }).catch((err) => console.error("[ai-loja] CRM:", err));
    await advanceConversationStage(conversationId, "cadastro");
    await paraEquipe(conversationId, input.tipo === "test_drive" ? "test_drive" : "visita", nota);
    return;
  }

  if (acao.name === "registrar_captacao") {
    const nota = `Captação (${input.objetivo === "venda" ? "quer vender" : "troca"}): ${str(input.veiculo_cliente)}${str(input.ano) ? ` ${str(input.ano)}` : ""}${input.km ? `, ${Number(input.km).toLocaleString("pt-BR")} km` : ""}. ${str(input.resumo)}`;
    if (fala) await send(fala);
    await registrarNoCrm({ store, contact, nota }).catch((err) => console.error("[ai-loja] CRM:", err));
    await paraEquipe(conversationId, "avaliacao_troca", nota);
    return;
  }

  if (acao.name === "transferir_para_vendedor") {
    if (fala) await send(fala);
    const resumo = str(input.resumo);
    await registrarNoCrm({ store, contact, nota: `Para vendedor (${str(input.motivo)}): ${resumo}` }).catch(
      (err) => console.error("[ai-loja] CRM:", err),
    );
    await paraEquipe(conversationId, str(input.motivo) || "pediu_humano", resumo);
    return;
  }

  if (acao.name === "encerrar_conversa") {
    if (fala) await send(fala);
    if (input.motivo === "opt_out") {
      await WaContact.updateOne({ _id: contact._id }, { optOut: true });
      await emitEvent("contato.optout", { phone: contact.phone, via: "ia" }, { conversationId });
    }
    await WaConversation.updateOne(
      { _id: conversationId },
      {
        status: "closed",
        waitingSince: null,
        outcome: input.motivo === "opt_out" ? "opt_out" : input.motivo === "sem_interesse" ? "sem_interesse" : null,
        ...(conv.stage === "ganho" ? {} : { stage: "perdido", stageChangedAt: new Date() }),
      },
    );
    await emitEvent("conversa.resolvida", { by: "ia", reason: input.motivo ?? null }, { conversationId });
    return;
  }

  if (replyText) await send(replyText);
}
