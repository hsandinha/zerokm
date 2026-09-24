// Dossiê do cliente: o que quem atende precisa saber ANTES de responder.
//
// Na CNV o dossiê não é grafo societário — é a situação do lojista no funil da
// zerokm: tem conta? o teste de 24h está de pé? a assinatura está ativa? o que
// já foi cobrado? Sem isso, o atendente promete o que já existe ou cobra quem
// já pagou.

import dbConnect from "@/lib/mongodb";
import { WaCampaignRecipient, type IWaContact } from "@wa/models/wa";
import { WaTarget } from "@wa/models/base";
import Payment from "@/models/Payment";
import Plan from "@/models/Plan";
import { getFunnelStatus } from "@wa/lib/register";

export type Dossier = {
  registered: boolean;
  displayName: string | null;
  email: string | null;
  subscriptionActive: boolean;
  planName: string | null;
  trialActive: boolean;
  trialExpiresAt: string | null;
  payments: Array<{
    id: string;
    status: string;
    amount: number;
    method: string | null;
    createdAt: string;
    planName: string | null;
  }>;
  company: {
    cnpj: string | null;
    legalName: string | null;
    city: string | null;
    state: string | null;
    cnae: string | null;
  } | null;
  /** Campanhas que já enviaram template para este número. */
  campaigns: Array<{ campaignId: string; status: string; sentAt: string | null }>;
};

export async function getDossier(contact: IWaContact): Promise<Dossier> {
  await dbConnect();

  const funnel = await getFunnelStatus({
    userId: contact.userId,
    firebaseUid: contact.firebaseUid,
    phone: contact.phone,
    email: contact.email,
  });

  const [payments, target, recipients, plans] = await Promise.all([
    // O pagamento é do usuário da zerokm: casa pelo _id quando o cadastro já
    // está vinculado ao contato, e pelo e-mail quando veio por outro caminho.
    contact.userId || funnel.user?.email
      ? Payment.find(
          contact.userId
            ? { userId: contact.userId }
            : { payerEmail: funnel.user!.email },
        )
          .sort({ createdAt: -1 })
          .limit(5)
          .lean()
      : Promise.resolve([]),
    contact.targetId
      ? WaTarget.findById(contact.targetId).lean()
      : contact.document
        ? WaTarget.findOne({ cnpj: contact.document }).lean()
        : Promise.resolve(null),
    WaCampaignRecipient.find({ phone: contact.phone })
      .sort({ sentAt: -1 })
      .limit(5)
      .select("campaignId status sentAt")
      .lean(),
    Plan.find().select("name").lean(),
  ]);

  const planName = new Map(plans.map((p) => [String(p._id), p.name]));

  return {
    registered: funnel.registered,
    displayName: funnel.user?.displayName ?? contact.name ?? null,
    email: funnel.user?.email ?? contact.email ?? null,
    subscriptionActive: funnel.user?.subscriptionActive ?? false,
    planName: funnel.user?.planId ? (planName.get(String(funnel.user.planId)) ?? null) : null,
    trialActive: funnel.user?.trialActive ?? false,
    trialExpiresAt: funnel.user?.trialExpiresAt
      ? new Date(funnel.user.trialExpiresAt).toISOString()
      : null,
    payments: payments.map((p) => ({
      id: String(p._id),
      status: p.status,
      amount: p.amount,
      method: p.method ?? null,
      createdAt: new Date(p.createdAt).toISOString(),
      planName: p.planId ? (planName.get(String(p.planId)) ?? null) : null,
    })),
    company: target
      ? {
          cnpj: target.cnpj,
          legalName: target.legalName ?? null,
          city: target.city ?? null,
          state: target.state ?? null,
          cnae: target.cnae ?? null,
        }
      : contact.company || contact.document
        ? {
            cnpj: contact.document ?? null,
            legalName: contact.company ?? null,
            city: contact.city ?? null,
            state: contact.state ?? null,
            cnae: contact.cnae ?? null,
          }
        : null,
    campaigns: recipients.map((r) => ({
      campaignId: String(r.campaignId),
      status: r.status,
      sentAt: r.sentAt ? new Date(r.sentAt).toISOString() : null,
    })),
  };
}
