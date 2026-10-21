// Lembrete de estoque desatualizado para a concessionária, pelo WhatsApp do CNV
// (a Vera). Fora da janela de 24h a Meta só aceita modelo aprovado, então o
// envio é sempre por template.
//
// A conversa nasce (ou fica) encerrada e fora do funil de vendas: a loja não é
// lead. Se ela responder, a conversa reabre como qualquer outra na Central.

import dbConnect from "@/lib/mongodb";
import { WaContact, WaConversation } from "@wa/models/wa";
import { parsePhoneBr } from "@wa/lib/phone";
import { getWabaCredentials } from "@wa/lib/settings";
import { listTemplates, templateVariables } from "@wa/lib/meta";
import { sendAndLogTemplate } from "@wa/lib/send";
import { renderTemplateBody } from "@wa/lib/campaign-params";

export type ResultadoLembrete = { ok: true; telefone: string } | { ok: false; motivo: string };

/** Cache por execução do cron: a lista de templates não muda entre uma loja e outra. */
let templatesCache: { quando: number; lista: Awaited<ReturnType<typeof listTemplates>> } | null = null;

async function templateAprovado(nome: string) {
  const creds = await getWabaCredentials();
  if (!creds?.wabaId) return { erro: "WhatsApp do CNV não configurado (IA & WABA)." } as const;
  if (!templatesCache || Date.now() - templatesCache.quando > 5 * 60_000) {
    templatesCache = { quando: Date.now(), lista: await listTemplates(creds) };
  }
  const tpl = templatesCache.lista.find((t) => t.name === nome);
  if (!tpl) return { erro: `O modelo "${nome}" não existe no WhatsApp do CNV.` } as const;
  if (tpl.status !== "APPROVED") return { erro: `O modelo "${nome}" está ${tpl.status} na Meta.` } as const;
  return { tpl } as const;
}

export async function enviarLembreteEstoque(params: {
  telefone: string;
  loja: string;
  dias: number;
  templateName: string;
}): Promise<ResultadoLembrete> {
  const parsed = parsePhoneBr(params.telefone);
  if (!parsed.valid || !parsed.e164) return { ok: false, motivo: "telefone inválido" };
  if (parsed.kind !== "movel") return { ok: false, motivo: "telefone fixo não recebe WhatsApp" };

  const modelo = await templateAprovado(params.templateName);
  if ("erro" in modelo) return { ok: false, motivo: modelo.erro ?? "modelo indisponível" };
  const tpl = modelo.tpl;

  await dbConnect();
  let contact = await WaContact.findOne({ phone: parsed.e164 });
  if (!contact) {
    contact = await WaContact.create({ phone: parsed.e164, name: params.loja, company: params.loja, source: "manual" });
  }
  if (contact.optOut) return { ok: false, motivo: "a loja pediu para não receber mensagens" };

  let conversation = await WaConversation.findOne({ contactId: contact._id });
  if (!conversation) {
    conversation = await WaConversation.create({ contactId: contact._id, status: "closed", stage: "conversa", stageChangedAt: new Date() });
  }

  const corpo = tpl.components?.find((c) => c.type === "BODY")?.text ?? "";
  const valores = [params.loja, String(params.dias)].slice(0, templateVariables(corpo).length);
  await sendAndLogTemplate({
    conversationId: String(conversation._id),
    to: contact.phone,
    templateName: tpl.name,
    language: tpl.language,
    bodyParams: valores,
    renderedText: renderTemplateBody(corpo, valores),
    sender: "system",
  });
  return { ok: true, telefone: contact.phone };
}
