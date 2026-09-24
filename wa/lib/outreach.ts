// Abordagem manual por template: "Nova conversa" na Central e a reabertura de
// conversa fora da janela de 24h.
//
// Fora da janela a Meta só aceita template aprovado — é a mesma regra da
// campanha e do follow-up, só que escolhida na hora por quem atende. O caminho
// é um só: resolve o contato, garante a conversa (reabrindo se estava
// encerrada), valida o template na Meta e envia.

import dbConnect from "@/lib/mongodb";
import { WaContact, WaConversation, WaFollowup, type IWaContact } from "@wa/models/wa";
import { WaTarget } from "@wa/models/base";
import { parsePhoneBr } from "@wa/lib/phone";
import { getWabaCredentials } from "@wa/lib/settings";
import { listTemplates, templateVariables } from "@wa/lib/meta";
import { sendAndLogTemplate } from "@wa/lib/send";
import { renderTemplateBody } from "@wa/lib/campaign-params";
import { emitEvent } from "@wa/lib/webhooks";

export class OutreachError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "OutreachError";
  }
}

export async function sendTemplateOutreach(params: {
  /** Um dos dois: telefone (conversa nova) ou a conversa existente. */
  phone?: string;
  conversationId?: string;
  name?: string | null;
  templateName: string;
  language?: string;
  params: string[];
  userEmail: string;
}): Promise<{ conversationId: string; contactId: string; created: boolean; text: string }> {
  await dbConnect();

  // ── 1. Contato ─────────────────────────────────────────────
  let contact: IWaContact | null = null;
  if (params.conversationId) {
    const conv = await WaConversation.findById(params.conversationId);
    if (!conv) throw new OutreachError("Conversa não encontrada", 404);
    contact = await WaContact.findById(conv.contactId);
  } else {
    const parsed = parsePhoneBr(params.phone);
    if (!parsed.valid || !parsed.e164) {
      throw new OutreachError(`Telefone inválido${parsed.reason ? ` (${parsed.reason})` : ""}`);
    }
    if (parsed.kind !== "movel") {
      throw new OutreachError("Só celular recebe WhatsApp — este número é fixo");
    }

    contact = await WaContact.findOne({ phone: parsed.e164 });
    if (contact) {
      if (!contact.name && params.name?.trim()) {
        contact.name = params.name.trim();
        await contact.save();
      }
    } else {
      // Se o número já é de uma empresa da base, o contato nasce com o vínculo.
      const target = await WaTarget.findOne({ phone: parsed.e164 }).sort({ priority: -1 });
      contact = await WaContact.create({
        phone: parsed.e164,
        name: params.name?.trim() || undefined,
        source: "manual",
        targetId: target?._id,
        company: target?.legalName,
        city: target?.city,
        state: target?.state,
        document: target?.cnpj,
      });
    }
  }
  if (!contact) throw new OutreachError("Contato não encontrado", 404);
  if (contact.optOut) {
    throw new OutreachError("Este contato pediu para não receber mensagens (opt-out).", 409);
  }

  // ── 2. Template: precisa existir, estar aprovado e ter as variáveis ──
  const creds = await getWabaCredentials();
  if (!creds?.wabaId) throw new OutreachError("WABA não configurado — preencha em IA & WABA.");

  const templates = await listTemplates(creds);
  const tpl =
    templates.find(
      (t) => t.name === params.templateName && (!params.language || t.language === params.language),
    ) ?? templates.find((t) => t.name === params.templateName);
  if (!tpl) throw new OutreachError(`Template "${params.templateName}" não existe neste WABA.`);
  if (tpl.status !== "APPROVED") {
    throw new OutreachError(
      `O template "${tpl.name}" está ${tpl.status} — só APPROVED pode ser enviado.`,
    );
  }

  const body = tpl.components?.find((c) => c.type === "BODY")?.text ?? "";
  const needed = templateVariables(body).length;
  const values = (params.params ?? []).map((v) => String(v ?? "").trim()).slice(0, needed);
  if (values.length < needed || values.some((v) => !v)) {
    throw new OutreachError(
      `O template tem ${needed} variável${needed === 1 ? "" : "is"} — preencha todas.`,
    );
  }
  const text = renderTemplateBody(body, values);

  // ── 3. Conversa (nova, ou reaberta se estava encerrada) ────
  let created = false;
  let conversation = await WaConversation.findOne({ contactId: contact._id });
  if (!conversation) {
    conversation = await WaConversation.create({
      contactId: contact._id,
      status: "ai_active",
      stage: "abordado",
      stageChangedAt: new Date(),
    });
    created = true;
  } else {
    // Abordar de novo quem estava encerrado é recomeçar: a IA volta a
    // responder e a etapa volta ao início do funil.
    if (conversation.status === "closed") {
      conversation.status = "ai_active";
      conversation.transferReason = undefined;
      conversation.outcome = null;
      conversation.assignedTo = undefined;
      conversation.waitingSince = null;
    }
    if (conversation.stage === "perdido") {
      conversation.stage = "abordado";
      conversation.stageChangedAt = new Date();
    }
    await conversation.save();
  }
  const conversationId = String(conversation._id);

  // Quem manda template à mão não quer o lembrete automático em cima.
  await WaFollowup.updateMany(
    { conversationId: conversation._id, status: "pending" },
    { status: "cancelled" },
  );

  // ── 4. Envio ───────────────────────────────────────────────
  await sendAndLogTemplate({
    conversationId,
    to: contact.phone,
    templateName: tpl.name,
    language: tpl.language,
    bodyParams: values,
    renderedText: text,
    sender: "human",
  });

  if (contact.targetId) {
    await WaTarget.updateOne(
      { _id: contact.targetId, status: { $in: ["new", "ready", "queued"] } },
      { status: "sent" },
    );
  }

  if (created) {
    await emitEvent(
      "conversa.criada",
      { origin: "template", templateName: tpl.name, by: params.userEmail },
      { conversationId },
    );
  }

  console.info(`[outreach] ${params.userEmail} enviou ${tpl.name} para ${contact.phone}`);
  return { conversationId, contactId: String(contact._id), created, text };
}
