// Mensagens programadas: programar (com a checagem do template) e o envio na
// hora marcada, chamado pelo worker /api/wa/workers/programadas a cada minuto.
//
// Cada mensagem é "pega" com um update condicional (programada → enviando):
// dois workers rodando ao mesmo tempo nunca mandam a mesma duas vezes. Uma
// que ficou "enviando" por mais de 10 minutos (o worker caiu no meio) NÃO é
// reenviada: pode ter saído. Vira "falhou" com o aviso, para alguém conferir.

import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { WaProgramada, type IWaProgramada } from "@wa/models/central";
import { WaAiJob, WaContact, WaConversation, WaFollowup } from "@wa/models/wa";
import { WaNote } from "@wa/models/atendimento";
import { channelForConversation, wabaCredentialsOf } from "@wa/lib/channels";
import { formaDoTemplate, listTemplates, MetaApiError, podeUsarTemplates, type MetaTemplate } from "@wa/lib/meta";
import { metaErrorInfo } from "@wa/lib/meta-errors";
import { sendAndLogTemplate, sendAndLogText } from "@wa/lib/send";
import { extrasDoEnvio, textoDoTemplate } from "@wa/lib/template-envio";
import { ENVIANDO_PRESO_MS, decidirEnvio, quandoTexto, templateProgramavel } from "@wa/lib/programadas";

export class ProgramadaError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/** Template aprovado da loja pelo nome (e idioma). */
async function templateDaLoja(tenantId: string | null, nome: string, idioma?: string | null): Promise<MetaTemplate | null> {
  const creds = await wabaCredentialsOf(tenantId);
  if (!podeUsarTemplates(creds)) return null;
  const lista = await listTemplates(creds);
  return (
    lista.find((t) => t.name === nome && (!idioma || t.language === idioma) && t.status === "APPROVED") ??
    lista.find((t) => t.name === nome && t.status === "APPROVED") ??
    null
  );
}

/**
 * O template escolhido para a janela fechada: precisa existir aprovado, ser
 * só corpo e ter as variáveis preenchidas. Devolve o que se grava.
 */
export async function modeloParaProgramar(
  tenantId: string | null,
  bruto: { nome?: unknown; idioma?: unknown; params?: unknown } | null | undefined,
): Promise<IWaProgramada["modelo"]> {
  const nome = typeof bruto?.nome === "string" ? bruto.nome.trim() : "";
  if (!nome) return null;
  const tpl = await templateDaLoja(tenantId, nome, typeof bruto?.idioma === "string" ? bruto.idioma : null);
  if (!tpl) throw new ProgramadaError(`O template "${nome}" não está aprovado no WhatsApp da loja.`);
  const forma = formaDoTemplate(tpl);
  if (!templateProgramavel(forma)) {
    throw new ProgramadaError(
      "Este template pede arquivo no cabeçalho ou link no botão: mande pela Central na hora, ou escolha outro.",
    );
  }
  const params = (Array.isArray(bruto?.params) ? bruto.params : [])
    .map((v) => String(v ?? "").trim())
    .slice(0, forma.bodyVars);
  if (params.length < forma.bodyVars || params.some((v) => !v)) {
    throw new ProgramadaError("Preencha todas as variáveis do template.");
  }
  return { nome: tpl.name, idioma: tpl.language, params, texto: textoDoTemplate(forma, params) };
}

/** Nota interna com o motivo: quem programou vê na conversa por que não saiu. */
async function anotarFalha(p: IWaProgramada, motivo: string) {
  await WaNote.create({
    conversationId: p.conversationId,
    tenantId: p.tenantId ?? null,
    authorEmail: p.criadoPor,
    authorName: p.criadoPorNome ?? undefined,
    text: `Mensagem programada para ${quandoTexto(p.enviarEm)} não saiu: ${motivo}`,
  }).catch((err) => console.warn("[programadas] nota não gravada:", err instanceof Error ? err.message : err));
}

async function falhou(p: IWaProgramada, motivo: string) {
  await WaProgramada.updateOne({ _id: p._id }, { situacao: "falhou", erro: motivo });
  await anotarFalha(p, motivo);
}

/** Manda uma. Devolve como saiu, ou lança com o motivo. */
async function enviarUma(p: IWaProgramada): Promise<"texto" | "template"> {
  const conv = await WaConversation.findById(p.conversationId);
  // A conversa precisa continuar da mesma loja de quem programou.
  if (!conv || (conv.tenantId ?? null) !== (p.tenantId ?? null)) throw new Error("A conversa não existe mais.");
  const contact = await WaContact.findById(conv.contactId).select("phone optOut").lean();
  if (!contact) throw new Error("O contato da conversa não existe mais.");
  const channel = await channelForConversation(conv);

  const decisao = decidirEnvio({
    kind: channel.kind,
    lastInboundAt: conv.lastInboundAt,
    agora: Date.now(),
    temModelo: Boolean(p.modelo?.nome),
    optOut: contact.optOut,
  });
  if ("falha" in decisao) throw new Error(decisao.falha);

  const author = { email: p.criadoPor, name: p.criadoPorNome ?? null };
  if (decisao.como === "texto") {
    await sendAndLogText({ conversationId: String(conv._id), to: contact.phone, text: p.texto, sender: "human", author });
  } else {
    const modelo = p.modelo!;
    // Pode ter sido despublicado desde que programaram.
    const tpl = await templateDaLoja(conv.tenantId ?? null, modelo.nome, modelo.idioma);
    if (!tpl) throw new Error(`O template "${modelo.nome}" não está mais aprovado.`);
    const forma = formaDoTemplate(tpl);
    const extras = extrasDoEnvio(forma, {});
    await sendAndLogTemplate({
      conversationId: String(conv._id),
      to: contact.phone,
      templateName: tpl.name,
      language: tpl.language,
      bodyParams: modelo.params,
      renderedText: modelo.texto || textoDoTemplate(forma, modelo.params),
      sender: "human",
      headerParams: extras.headerParams,
      buttonUrlParams: extras.buttonUrlParams,
      author,
    });
  }

  // Como no envio pela Central: gente falou, a IA não responde por cima.
  // Conversa encerrada continua encerrada (é um lembrete; se o cliente
  // responder, ela volta sozinha para a fila).
  if (conv.status === "ai_active") {
    await WaConversation.updateOne(
      { _id: conv._id, status: "ai_active" },
      { status: "human_active", assignedTo: conv.assignedTo ?? p.criadoPor, waitingSince: null },
    );
    await WaAiJob.updateMany(
      { conversationId: conv._id, status: "pending" },
      { status: "done", lastError: "cancelado: mensagem programada" },
    );
  }
  // Quem falou com o cliente não quer o lembrete automático da campanha em cima.
  await WaFollowup.updateMany({ conversationId: conv._id, status: "pending" }, { status: "cancelled" });
  return decisao.como;
}

function motivoDoErro(err: unknown): string {
  if (err instanceof MetaApiError) {
    const info = metaErrorInfo(err.message);
    return info ? `${info.titulo}. ${info.explicacao}` : `A Meta recusou: ${err.message}`;
  }
  return (err instanceof Error ? err.message : String(err)).slice(0, 400) || "Erro no envio.";
}

export async function enviarProgramadasVencidas(limite = 30): Promise<{ enviadas: number; falhas: number }> {
  await dbConnect();
  const agora = new Date();

  // Presas em "enviando": podem ter saído. Avisa em vez de reenviar.
  const presas = await WaProgramada.find({
    situacao: "enviando",
    pegoEm: { $lt: new Date(agora.getTime() - ENVIANDO_PRESO_MS) },
  }).limit(50);
  for (const p of presas) {
    const r = await WaProgramada.updateOne(
      { _id: p._id, situacao: "enviando" },
      {
        situacao: "falhou",
        erro: "O envio foi interrompido no meio e pode ter saído. Confira a conversa antes de mandar de novo.",
      },
    );
    if (r.modifiedCount > 0) {
      await anotarFalha(p, "o envio foi interrompido no meio e pode ter saído. Confira a conversa antes de mandar de novo.");
    }
  }

  const vencidas = await WaProgramada.find({ situacao: "programada", enviarEm: { $lte: agora } })
    .sort({ enviarEm: 1 })
    .limit(limite)
    .select("_id")
    .lean();

  let enviadas = 0;
  let falhas = 0;
  for (const { _id } of vencidas) {
    const pega = await WaProgramada.findOneAndUpdate(
      { _id, situacao: "programada" },
      { situacao: "enviando", pegoEm: new Date() },
      { new: true },
    );
    if (!pega) continue;
    try {
      const como = await enviarUma(pega);
      await WaProgramada.updateOne(
        { _id },
        { situacao: "enviada", enviadaEm: new Date(), erro: null, saiuComo: como },
      );
      enviadas++;
    } catch (err) {
      falhas++;
      await falhou(pega, motivoDoErro(err));
    }
  }
  return { enviadas, falhas };
}

/** As da conversa que a faixa mostra: as que vão sair e as que falharam
 *  (até alguém dar "Ok"). */
export async function programadasDaConversa(conversationId: string) {
  if (!mongoose.isValidObjectId(conversationId)) return [];
  await dbConnect();
  const lista = await WaProgramada.find({
    conversationId,
    $or: [{ situacao: { $in: ["programada", "enviando"] } }, { situacao: "falhou", dispensada: { $ne: true } }],
  })
    .sort({ enviarEm: 1 })
    .limit(20)
    .lean();
  return lista.map((p) => ({
    id: String(p._id),
    texto: p.texto,
    enviarEm: p.enviarEm,
    situacao: p.situacao,
    erro: p.erro ?? null,
    modelo: p.modelo ? { nome: p.modelo.nome, texto: p.modelo.texto } : null,
    criadoPor: p.criadoPor,
    criadoPorNome: p.criadoPorNome ?? null,
  }));
}
