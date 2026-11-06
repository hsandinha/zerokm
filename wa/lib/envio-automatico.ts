// O envio de uma mensagem automática (follow-up da coluna do funil e
// automações da loja). As regras que valem para todas:
//
//   1. Quem pediu para sair (opt-out) não recebe nada.
//   2. Janela de 24h aberta (com margem) e canal que não seja SMS: vai o
//      texto, pela conversa (o Direct e o Messenger também).
//   3. Fora da janela: só o template aprovado, pelo WhatsApp da loja. Sem
//      template, ou contato sem telefone (Instagram, Messenger), não sai.
//   4. Tudo que sai fica na conversa (wa/lib/send.ts grava a mensagem), e a
//      conversa guarda a hora da última automática: uma não sai em cima da
//      outra (wa/lib/automacoes.ts, INTERVALO_ENTRE_AUTOMATICAS_MS).
//
// SMS nunca recebe automática: cada mensagem é paga pela loja, e a regra do
// atendimento é que lá só a equipe fala.

import type { Types } from "mongoose";
import dbConnect from "@/lib/mongodb";
import { WaConversation, WaMessage, WaSettings, type IWaContact, type IWaConversation } from "@wa/models/wa";
import type { IWaStore } from "@wa/models/store";
import { WaAutomacaoEnvio, type WaEnvioSituacao, type WaEnvioTipo } from "@wa/models/automacao";
import { channelForConversation, isProfilePhone, whatsappChannelOf, type ResolvedChannel } from "@wa/lib/channels";
import { formaDoTemplate, listTemplates, podeUsarTemplates, type MetaTemplate } from "@wa/lib/meta";
import { TemplateIncompletoError, extrasDoEnvio, textoDoTemplate } from "@wa/lib/template-envio";
import { sendAndLogTemplate, sendAndLogText } from "@wa/lib/send";
import { getStore, recursosDaLoja, storeIsActive } from "@wa/lib/store";
import { credsDaLoja, sanitizeStoreText } from "@wa/lib/ai-loja";
import { runLlm, type LlmCreds } from "@wa/lib/llm";
import type { Recursos } from "@/lib/recursos";
import { janelaAberta, parametrosDoModelo, primeiroNome, type DadosDaMensagem } from "@wa/lib/automacoes";

export type Saida = {
  situacao: Exclude<WaEnvioSituacao, "enviando">;
  canal?: string | null;
  como?: "texto" | "ia" | "modelo" | null;
  motivo?: string | null;
  externalId?: string | null;
  conversationId?: string | null;
};

type Dono = {
  /** null = CNV. */
  store: IWaStore | null;
  recursos: Recursos | null;
  /** A loja pode receber automática agora (assinatura em dia, recurso liberado). */
  liberado: boolean;
  nome: string;
};

/** Cache de uma rodada do worker: loja, templates e canal, uma leitura cada. */
export class Rodada {
  private donos = new Map<string, Dono>();
  private templates = new Map<string, MetaTemplate[]>();
  private whats = new Map<string, ResolvedChannel | null>();
  readonly inicio = Date.now();

  constructor(readonly prazoMs = 240_000) {}

  get esgotada(): boolean {
    return Date.now() - this.inicio > this.prazoMs;
  }

  async dono(tenantId: string | null): Promise<Dono> {
    const chave = tenantId ?? "cnv";
    const pronto = this.donos.get(chave);
    if (pronto) return pronto;
    let dono: Dono;
    if (!tenantId) {
      dono = { store: null, recursos: null, liberado: true, nome: "CNV" };
    } else {
      const store = await getStore(tenantId);
      const recursos = store ? await recursosDaLoja(store) : null;
      dono = {
        store,
        recursos,
        // Sem assinatura (ou teste) o atendimento da loja está parado: nada
        // automático sai em nome dela.
        liberado: Boolean(store && recursos?.atendimento && recursos.automacoes && storeIsActive(store)),
        nome: store?.name ?? "",
      };
    }
    this.donos.set(chave, dono);
    return dono;
  }

  async whatsappDe(tenantId: string | null): Promise<ResolvedChannel | null> {
    const chave = tenantId ?? "cnv";
    if (!this.whats.has(chave)) this.whats.set(chave, await whatsappChannelOf(tenantId).catch(() => null));
    return this.whats.get(chave) ?? null;
  }

  async templatesDe(tenantId: string | null): Promise<MetaTemplate[]> {
    const chave = tenantId ?? "cnv";
    if (!this.templates.has(chave)) {
      const canal = await this.whatsappDe(tenantId);
      const creds = canal?.whatsapp ?? null;
      this.templates.set(chave, podeUsarTemplates(creds) ? await listTemplates(creds).catch(() => []) : []);
    }
    return this.templates.get(chave)!;
  }
}

export type PedidoDeEnvio = {
  tenantId: string | null;
  contact: Pick<IWaContact, "_id" | "phone" | "name" | "optOut">;
  conversation: Pick<IWaConversation, "_id" | "channelId" | "lastInboundAt"> | null;
  /** Texto da janela aberta (null = não tem o que dizer, não sai). Chamado
   *  só quando a janela está aberta: a IA não roda à toa. */
  texto: () => Promise<{ texto: string; como: "texto" | "ia" } | null>;
  template: { nome: string; idioma: string; vars: string[] } | null;
  dados: DadosDaMensagem;
  /** Sem conversa e com template: cria a conversa para o template (aniversário). */
  criarConversa?: boolean;
};

/** Manda pela regra acima. Nunca lança: o que deu errado volta como "falhou". */
export async function enviarAutomatico(rodada: Rodada, p: PedidoDeEnvio): Promise<Saida> {
  const { contact } = p;
  if (contact.optOut) return { situacao: "pulada", motivo: "pediu para não receber mensagens" };
  try {
    await dbConnect();
    let conversa = p.conversation;
    const canal = conversa ? await channelForConversation(conversa) : null;

    // 1. Janela aberta: texto pela própria conversa.
    if (conversa && canal && canal.kind !== "sms" && janelaAberta(conversa.lastInboundAt)) {
      const t = await p.texto();
      if (!t) return { situacao: "pulada", motivo: "sem texto para mandar (IA indisponível?)" };
      await sendAndLogText({
        conversationId: String(conversa._id),
        to: contact.phone,
        text: t.texto,
        sender: t.como === "ia" ? "ai" : "system",
      });
      await marcarAutomatica(String(conversa._id));
      return { situacao: "enviada", canal: canal.kind, como: t.como, conversationId: String(conversa._id) };
    }

    // 2. Fora da janela: template aprovado, pelo WhatsApp.
    if (!p.template) {
      return {
        situacao: "pulada",
        motivo: conversa ? "janela de 24h fechada e sem template configurado" : "sem conversa e sem template configurado",
      };
    }
    if (isProfilePhone(contact.phone)) {
      return { situacao: "pulada", motivo: "contato do Instagram ou Messenger: template só existe no WhatsApp" };
    }
    if (canal && canal.kind !== "whatsapp" && canal.kind !== "sms") {
      return { situacao: "pulada", motivo: "conversa fora do WhatsApp com a janela fechada" };
    }
    const whats = await rodada.whatsappDe(p.tenantId);
    if (!whats?.whatsapp) return { situacao: "pulada", motivo: "WhatsApp não conectado" };
    const lista = await rodada.templatesDe(p.tenantId);
    const t = lista.find((m) => m.name === p.template!.nome && m.language === p.template!.idioma);
    if (!t || t.status !== "APPROVED") {
      return { situacao: "pulada", motivo: `template "${p.template.nome}" não está aprovado neste número` };
    }
    const forma = formaDoTemplate(t);
    const params = parametrosDoModelo(p.template.vars, forma.bodyVars, p.dados);
    const headerTexto = forma.headerVars > 0 ? primeiroNome(contact.name) || "cliente" : null;
    let extras;
    try {
      // Template com mídia no cabeçalho ou link dinâmico não serve aqui: a
      // automação não tem o arquivo nem o final do link.
      extras = extrasDoEnvio(forma, { headerTexto });
    } catch (err) {
      if (err instanceof TemplateIncompletoError) {
        return { situacao: "pulada", motivo: `template "${t.name}" pede mais que o texto: ${err.message}` };
      }
      throw err;
    }

    if (!conversa) {
      if (!p.criarConversa) return { situacao: "pulada", motivo: "sem conversa" };
      conversa = await conversaParaTemplate(p.tenantId, String(contact._id), whats.id);
    }
    const externalId = await sendAndLogTemplate({
      conversationId: String(conversa._id),
      to: contact.phone,
      templateName: t.name,
      language: t.language,
      bodyParams: params,
      renderedText: textoDoTemplate(forma, params, headerTexto),
      sender: "system",
      headerParams: extras.headerParams,
      buttonUrlParams: extras.buttonUrlParams,
    });
    await marcarAutomatica(String(conversa._id));
    return {
      situacao: "enviada",
      canal: "whatsapp",
      como: "modelo",
      externalId: externalId || null,
      conversationId: String(conversa._id),
    };
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    console.warn("[automatico] falhou", String(contact._id), motivo);
    return { situacao: "falhou", motivo: motivo.slice(0, 300) };
  }
}

async function marcarAutomatica(conversationId: string): Promise<void> {
  await WaConversation.updateOne({ _id: conversationId }, { $set: { ultimoAutomaticoAt: new Date() } });
}

/** Contato sem conversa (aniversário de quem veio da planilha): a conversa
 *  nasce encerrada e em "abordado", como a abordagem manual; se a pessoa
 *  responder, o inbound reabre e a IA assume. */
async function conversaParaTemplate(
  tenantId: string | null,
  contactId: string,
  channelId: string | null,
): Promise<Pick<IWaConversation, "_id" | "channelId" | "lastInboundAt">> {
  const existente = await WaConversation.findOne({ contactId }).select("_id channelId lastInboundAt").lean();
  if (existente) return existente;
  try {
    const nova = await WaConversation.create({
      contactId,
      tenantId,
      ...(channelId ? { channelId } : {}),
      status: "closed",
      stage: "abordado",
      stageChangedAt: new Date(),
    });
    return nova;
  } catch (err) {
    // Corrida com o inbound: a conversa nasceu agora por outro caminho.
    if ((err as { code?: number })?.code === 11000) {
      const outra = await WaConversation.findOne({ contactId }).select("_id channelId lastInboundAt").lean();
      if (outra) return outra;
    }
    throw err;
  }
}

// ── Registro (reserva antes de enviar) ───────────────────────

/** Reserva o evento. null = outra rodada já cuidou dele (nunca repete). */
export async function reservarEnvio(p: {
  tenantId: string | null;
  tipo: WaEnvioTipo;
  chave: string;
  contactId?: Types.ObjectId | string | null;
  conversationId?: Types.ObjectId | string | null;
}): Promise<string | null> {
  try {
    const doc = await WaAutomacaoEnvio.create({
      tenantId: p.tenantId,
      tipo: p.tipo,
      chave: p.chave,
      contactId: p.contactId ?? null,
      conversationId: p.conversationId ?? null,
      situacao: "enviando",
    });
    return String(doc._id);
  } catch (err) {
    if ((err as { code?: number })?.code === 11000) return null;
    throw err;
  }
}

export async function concluirEnvio(envioId: string, saida: Saida): Promise<void> {
  await WaAutomacaoEnvio.updateOne(
    { _id: envioId },
    {
      $set: {
        situacao: saida.situacao,
        canal: saida.canal ?? null,
        como: saida.como ?? null,
        motivo: saida.motivo ?? null,
        externalId: saida.externalId ?? null,
        ...(saida.conversationId ? { conversationId: saida.conversationId } : {}),
      },
    },
  );
}

// ── IA (follow-up no modo "a IA escreve") ────────────────────

/** A IA do dono: a da loja (chave dela, recurso liberado, IA ligada e
 *  assinatura em dia) ou a Vera, no CNV. null = sem IA agora. */
async function iaDoDono(dono: Dono): Promise<{ creds: LlmCreds | null; assistente: string } | null> {
  if (!dono.store) {
    const s = await WaSettings.findOne().select("aiActive assistantName").lean();
    if (s && s.aiActive === false) return null;
    return { creds: null, assistente: s?.assistantName ?? "Vera" };
  }
  if (!dono.recursos?.ia || !dono.store.ai?.active || !storeIsActive(dono.store)) return null;
  const creds = credsDaLoja(dono.store);
  if (!creds) return null;
  return { creds, assistente: dono.store.ai.assistantName || "Assistente" };
}

const T_MENSAGEM = {
  name: "enviar_mensagem",
  description: "Entrega a mensagem de follow-up que será enviada ao cliente.",
  schema: {
    type: "object",
    properties: { mensagem: { type: "string", description: "O texto da mensagem, pronto para enviar." } },
    required: ["mensagem"],
  },
};

/**
 * Mensagem de follow-up escrita pela IA do dono, lendo as últimas 20
 * mensagens da conversa. Uma chamada por toque, e só com a janela aberta (o
 * texto livre só sai assim). null = sem IA, resposta vazia ou erro: o toque
 * não sai.
 */
export async function escreverFollowupComIa(
  rodada: Rodada,
  p: {
    tenantId: string | null;
    conversationId: string;
    contactName?: string | null;
    horasParado: number;
    etapa: string;
    orientacao?: string | null;
  },
): Promise<string | null> {
  const dono = await rodada.dono(p.tenantId);
  const ia = await iaDoDono(dono);
  if (!ia) return null;
  const msgs = await WaMessage.find({ conversationId: p.conversationId, mediaType: { $ne: "evento" } })
    .sort({ createdAt: -1 })
    .limit(20)
    .select("direction content mediaType")
    .lean();
  const conversa = msgs
    .reverse()
    .map((m) => {
      const quem = m.direction === "inbound" ? "Cliente" : "Loja";
      const texto = m.content || (m.mediaType !== "text" ? `[${m.mediaType}]` : "");
      return texto ? `${quem}: ${String(texto).slice(0, 500)}` : null;
    })
    .filter(Boolean)
    .join("\n");
  const nome = primeiroNome(p.contactName);
  const loja = dono.nome || "a loja";
  const system = [
    `Você escreve mensagens de follow-up no WhatsApp em nome de ${loja} (a atendente virtual se chama ${ia.assistente}).`,
    `O contato${nome ? ` ${nome}` : ""} está na etapa "${p.etapa}" do funil de vendas e a conversa está parada há cerca de ${Math.round(p.horasParado)} horas, esperando a resposta dele.`,
    "Escreva UMA mensagem curta (no máximo 3 frases), natural e cordial, em português do Brasil, retomando o assunto da conversa e convidando a pessoa a continuar.",
    "Não invente preços, carros, datas, condições ou promoções que não estejam na conversa. Não assine e não use listas.",
    p.orientacao ? `Orientação da loja para este follow-up: ${p.orientacao}` : "",
    "Entregue a mensagem chamando a ferramenta enviar_mensagem.",
  ]
    .filter(Boolean)
    .join("\n");
  try {
    const r = await runLlm({
      system,
      messages: [
        {
          role: "user",
          content: `Conversa até agora:\n${conversa || "(sem mensagens de texto)"}\n\nEscreva a mensagem de follow-up.`,
        },
      ],
      // Uma ferramenta só para entregar o texto: o mesmo formato em todo provedor.
      tools: [T_MENSAGEM],
      maxTokens: 2048,
      creds: ia.creds,
    });
    const bruto = String(r.toolCalls.find((c) => c.name === T_MENSAGEM.name)?.input.mensagem ?? r.text ?? "");
    const texto = sanitizeStoreText(bruto).trim();
    return texto.length >= 3 ? texto.slice(0, 1000) : null;
  } catch (err) {
    console.warn("[automatico] IA do follow-up falhou", p.conversationId, err instanceof Error ? err.message : err);
    return null;
  }
}
