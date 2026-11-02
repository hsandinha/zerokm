// Atendimento da loja → CRM da zerokm. Para a concessionária, todo interessado
// que a IA qualifica vira (ou atualiza) um Lead no CRM que ela já usa — o
// mesmo caminho do webhook de leads, sem tabela paralela. O lojista não tem
// CRM na zerokm: o funil dele é o próprio quadro do atendimento.

import dbConnect from "@/lib/mongodb";
import Lead from "@/models/Lead";
import LeadStage from "@/models/LeadStage";
import LeadEvent from "@/models/LeadEvent";
import LeadTask from "@/models/LeadTask";
import type { IWaStore } from "@wa/models/store";
import type { IWaContact } from "@wa/models/wa";

export const LEAD_SOURCE_ATENDIMENTO = "Atendimento IA";

function telefoneDoLead(contact: Pick<IWaContact, "phone" | "whatsappPhone" | "igUsername">): string {
  if (contact.phone.startsWith("ig:")) {
    return contact.whatsappPhone || (contact.igUsername ? `@${contact.igUsername}` : contact.phone);
  }
  return contact.phone;
}

function carimbo(): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

/**
 * Cria o lead na primeira fase aberta do CRM da concessionária, ou acrescenta
 * a nota no lead que já existe com esse telefone. Devolve o id do lead (ou
 * null quando a loja não tem CRM — lojista).
 */
export async function registrarNoCrm(params: {
  store: Pick<IWaStore, "kind" | "concessionariaId">;
  contact: Pick<IWaContact, "phone" | "whatsappPhone" | "igUsername" | "name" | "email">;
  nota: string;
  /** Tarefa com prazo (visita/test drive) no quadro do CRM. */
  tarefa?: { titulo: string; quando: Date } | null;
}): Promise<string | null> {
  const { store, contact } = params;
  if (store.kind !== "concessionaria" || !store.concessionariaId) return null;
  await dbConnect();
  const concessionariaId = store.concessionariaId;
  const phone = telefoneDoLead(contact);
  const linha = `[${carimbo()}] ${params.nota}`.slice(0, 1000);

  let lead = await Lead.findOne({ concessionariaId, phone, ativo: true });
  if (lead) {
    lead.notes = [lead.notes, linha].filter(Boolean).join("\n");
    await lead.save();
  } else {
    // Fase de entrada: a primeira aberta (mesma regra do webhook de leads).
    let stage = await LeadStage.findOne({
      concessionariaId,
      $or: [{ type: "open" }, { type: { $exists: false } }],
    }).sort({ order: 1 });
    if (!stage) {
      stage = await LeadStage.create({
        name: "Novo Lead (Atendimento)",
        concessionariaId,
        order: 0,
        color: "#3b82f6",
        type: "open",
      });
    }
    lead = await Lead.create({
      name: contact.name || phone,
      phone,
      email: contact.email || undefined,
      source: LEAD_SOURCE_ATENDIMENTO,
      firstMessage: params.nota.slice(0, 500),
      notes: linha,
      tags: [],
      stageId: stage._id,
      concessionariaId,
    });
    await LeadEvent.create({
      leadId: lead._id,
      concessionariaId,
      type: "created",
      fromStageId: null,
      toStageId: stage._id,
      actor: "webhook",
    });
  }

  if (params.tarefa) {
    await LeadTask.create({
      leadId: lead._id,
      concessionariaId,
      title: params.tarefa.titulo.slice(0, 200),
      dueAt: params.tarefa.quando,
      createdBy: LEAD_SOURCE_ATENDIMENTO,
    });
  }
  return String(lead._id);
}
