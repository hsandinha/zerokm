// Copiloto da Central (sob demanda): sugerir a próxima resposta, melhorar o
// texto digitado e resumir a conversa. Usa a chave e o provedor de IA da loja,
// os mesmos da IA de vendas (credsDaLoja em wa/lib/ai-loja.ts); a Vera (CNV)
// usa as chaves do deploy. Nunca roda sozinho: cada pedido é um clique.
//
// Cada pedido é uma chamada paga: um contador por loja e por dia
// (wa_copiloto_uso) segura clique repetido ou script virando conta alta.

import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { WaContact, WaConversation, WaMessage } from "@wa/models/wa";
import { WaNote } from "@wa/models/atendimento";
import { WaCopilotoUso } from "@wa/models/central";
import type { IWaStore } from "@wa/models/store";
import { credsDaLoja } from "@wa/lib/ai-loja";
import { llmProvider, runLlm, type LlmCreds } from "@wa/lib/llm";
import { getSettings } from "@wa/lib/settings";
import { storeIsActive } from "@wa/lib/store";
import { podeUsar, type Scope } from "@wa/lib/scope";
import {
  PROMPT_MELHORAR,
  agoraEmBrasilia,
  limparSaida,
  montarTranscricao,
  promptDaSugestao,
  promptDoResumo,
  type ItemDaConversa,
} from "@wa/lib/copiloto-texto";

/** Pedidos por loja por dia (sugerir, melhorar e resumir somados). */
export function limiteDiario(): number {
  const n = Number(process.env.WA_COPILOTO_LIMITE_DIA);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 100;
}

export type AcaoDoCopiloto = "sugerir" | "melhorar" | "resumir";

export type CopilotoDisponivel =
  | { disponivel: true; creds: LlmCreds | null; chave: string }
  | { disponivel: false; motivo: string };

/**
 * O copiloto aparece para esta loja? Loja: IA de vendas liberada pelo CNV,
 * assinatura do atendimento ativa e a chave de IA cadastrada (não precisa
 * da IA ligada: o copiloto é da equipe, não responde o cliente). CNV: as
 * chaves do deploy.
 */
export function copilotoDisponivel(scope: Pick<Scope, "tenantId" | "store">, store: IWaStore | null): CopilotoDisponivel {
  if (!scope.tenantId) {
    const chave = llmProvider() === "openai" ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY;
    return chave ? { disponivel: true, creds: null, chave: "cnv" } : { disponivel: false, motivo: "Sem chave de IA no deploy." };
  }
  if (!podeUsar(scope, "ia")) return { disponivel: false, motivo: "A IA não foi liberada para a loja." };
  if (!store) return { disponivel: false, motivo: "Loja não encontrada." };
  if (!storeIsActive(store)) return { disponivel: false, motivo: "Assinatura do atendimento inativa." };
  const creds = credsDaLoja(store);
  if (!creds) return { disponivel: false, motivo: "Falta a chave da IA na Configuração." };
  return { disponivel: true, creds, chave: scope.tenantId };
}

/** Dia em Brasília ("2026-11-06"): o limite vira à meia-noite da loja. */
function diaDeHoje(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

/** Soma 1 no dia e diz se ainda cabe. */
export async function consumirCota(chave: string): Promise<{ ok: boolean; restante: number }> {
  await dbConnect();
  const limite = limiteDiario();
  const doc = await WaCopilotoUso.findOneAndUpdate(
    { chave, dia: diaDeHoje() },
    { $inc: { contador: 1 }, $setOnInsert: { expiraEm: new Date(Date.now() + 3 * 86400_000) } },
    { upsert: true, new: true },
  );
  const usado = doc?.contador ?? 1;
  return { ok: usado <= limite, restante: Math.max(0, limite - usado) };
}

/** A chamada deu erro do provedor: não conta como uso. */
export async function devolverCota(chave: string): Promise<void> {
  await WaCopilotoUso.updateOne({ chave, dia: diaDeHoje(), contador: { $gt: 0 } }, { $inc: { contador: -1 } }).catch(
    () => {},
  );
}

export class CopilotoError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

async function historico(conversationId: mongoose.Types.ObjectId, limite: number, comNotas: boolean): Promise<ItemDaConversa[]> {
  const [mensagens, notas] = await Promise.all([
    WaMessage.find({ conversationId })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limite)
      .select("direction sender content mediaType authorName authorEmail externalId createdAt")
      .lean(),
    // Nota interna nunca entra na sugestão: é conversa da equipe e não pode
    // virar o que se diz ao cliente. No resumo (para a equipe) ela ajuda.
    comNotas
      ? WaNote.find({ conversationId }).sort({ createdAt: -1 }).limit(30).select("authorEmail authorName text createdAt").lean()
      : Promise.resolve([]),
  ]);
  return [
    ...mensagens.map((m) => ({
      tipo: "mensagem" as const,
      direction: m.direction,
      sender: m.sender,
      content: m.content ?? null,
      mediaType: m.mediaType,
      authorName: m.authorName ?? null,
      authorEmail: m.authorEmail ?? null,
      externalId: m.externalId ?? null,
      createdAt: m.createdAt,
    })),
    ...notas.map((n) => ({
      tipo: "nota" as const,
      autor: n.authorName || n.authorEmail.split("@")[0],
      texto: n.text,
      createdAt: n.createdAt,
    })),
  ];
}

/** O que a loja escreveu sobre ela (o mesmo texto que a IA de vendas lê). */
async function sobreALoja(store: IWaStore | null): Promise<{ loja: string; conhecimento: string; endereco: string | null }> {
  if (store) {
    return {
      loja: store.name,
      conhecimento: store.ai?.knowledgeBase?.trim() ?? "",
      endereco: store.mapsUrl?.trim() || null,
    };
  }
  const settings = await getSettings();
  return { loja: "CNV", conhecimento: settings.knowledgeBase?.trim() ?? "", endereco: null };
}

/** Um pedido ao copiloto. Quem chama já conferiu a loja e a cota. */
export async function pedirAoCopiloto(p: {
  conversationId: string;
  acao: AcaoDoCopiloto;
  texto?: string | null;
  creds: LlmCreds | null;
  store: IWaStore | null;
}): Promise<string> {
  await dbConnect();
  const conv = await WaConversation.findById(p.conversationId).select("_id contactId").lean();
  if (!conv) throw new CopilotoError("Conversa não encontrada.", 404);
  const agora = agoraEmBrasilia();
  const sobre = await sobreALoja(p.store);

  let system: string;
  let conteudo: string;
  if (p.acao === "melhorar") {
    const original = (p.texto ?? "").trim();
    if (!original) throw new CopilotoError("Escreva o texto antes de pedir para melhorar.");
    if (original.length > 4000) throw new CopilotoError("Texto longo demais (até 4.000 caracteres).");
    system = PROMPT_MELHORAR;
    conteudo = `<texto>\n${original}\n</texto>`;
  } else {
    const resumo = p.acao === "resumir";
    const itens = await historico(conv._id, resumo ? 80 : 40, resumo);
    if (!itens.some((i) => i.tipo === "mensagem")) {
      throw new CopilotoError("A conversa ainda não tem mensagens.");
    }
    // Sugestão: só o que o cliente viu. Resumo: as linhas internas também,
    // marcadas como tal.
    const transcricao = montarTranscricao(itens, { internas: resumo ? "nota" : "omitir" });
    if (resumo) {
      system = promptDoResumo({ loja: sobre.loja, agora });
      conteudo = `## Conversa (da mais antiga para a mais nova)\n${transcricao}`;
    } else {
      const contato = await WaContact.findById(conv.contactId).select("name").lean();
      const primeiro = contato?.name?.trim().split(/\s+/)[0] ?? null;
      system = promptDaSugestao({ ...sobre, agora, cliente: primeiro && !primeiro.startsWith("@") ? primeiro : null });
      conteudo = `## Conversa (da mais antiga para a mais nova)\n${transcricao}\n\nEscreva a próxima mensagem da loja para o cliente.`;
    }
  }

  const r = await runLlm({
    system,
    messages: [{ role: "user", content: conteudo }],
    tools: [],
    // Folga: no Gemini o raciocínio conta dentro do teto.
    maxTokens: 2048,
    creds: p.creds,
  });
  const texto = limparSaida(r.text);
  if (!texto) throw new CopilotoError("A IA não devolveu texto. Tente de novo.", 502);
  return texto;
}
