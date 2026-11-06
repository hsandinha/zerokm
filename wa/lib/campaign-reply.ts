// Atribuição de resposta a campanha: o cliente escreveu, e o último disparo
// para este número (nesta loja, nos últimos 7 dias) ganha o "respondeu".
//
// Antes a atribuição dependia de a conversa ainda não ter campaignId, mas o
// próprio worker grava o campaignId na conversa ao disparar: o "respondeu"
// nunca contava. Agora a fonte é o destinatário da campanha, e a transição
// enviado → respondeu é atômica (findOneAndUpdate com o status no filtro):
// duas mensagens picadas chegando juntas contam uma vez só.

import type mongoose from "mongoose";
import { WaCampaign, WaCampaignRecipient, WaConversation } from "@wa/models/wa";

export const JANELA_ATRIBUICAO_DIAS = 7;
export const MSG_JA_RESPONDEU = "a pessoa já respondeu em outro número";

type Id = mongoose.Types.ObjectId | string;

export async function atribuirRespostaDeCampanha(input: {
  tenantId: string | null;
  /** Telefone canônico (+55...), a mesma chave do destinatário. */
  phone: string;
  conversationId: Id;
  agora?: Date;
}): Promise<{ campaignId: string; recipientId: string } | null> {
  const agora = input.agora ?? new Date();
  const desde = new Date(agora.getTime() - JANELA_ATRIBUICAO_DIAS * 86_400_000);

  // O toque mais recente decide. Se ele já foi atribuído, esta é só mais uma
  // mensagem da mesma conversa: não vale "subir" para um disparo mais antigo.
  const ultimo = await WaCampaignRecipient.findOne({
    tenantId: input.tenantId,
    phone: input.phone,
    status: { $in: ["sent", "delivered", "read", "replied"] },
    sentAt: { $gte: desde, $lte: agora },
  })
    .sort({ sentAt: -1 })
    .select("_id status campaignId");
  if (!ultimo || ultimo.status === "replied") return null;

  const ganho = await WaCampaignRecipient.findOneAndUpdate(
    { _id: ultimo._id, status: { $in: ["sent", "delivered", "read"] } },
    { $set: { status: "replied", repliedAt: agora, conversationId: input.conversationId } },
    { new: true },
  );
  // Outra mensagem da mesma pessoa chegou junto e já contou.
  if (!ganho) return null;

  await WaCampaign.updateOne({ _id: ganho.campaignId }, { $inc: { replied: 1 } });
  await WaConversation.updateOne({ _id: input.conversationId }, { $set: { campaignId: ganho.campaignId } });

  // Campanha por pessoa: o bureau devolve vários celulares do mesmo sócio e
  // não diz qual está ativo. Respondeu em um, os outros que ainda não saíram
  // são cancelados: falar oito vezes com quem já respondeu é o caminho mais
  // curto para virar spam. Cada campanha conta os seus pulados.
  if (ganho.partnerId) {
    const outros = await WaCampaignRecipient.find({
      partnerId: ganho.partnerId,
      status: "pending",
      _id: { $ne: ganho._id },
    })
      .select("_id campaignId")
      .lean();
    const porCampanha = new Map<string, Array<(typeof outros)[number]["_id"]>>();
    for (const o of outros) {
      const k = String(o.campaignId);
      porCampanha.set(k, [...(porCampanha.get(k) ?? []), o._id]);
    }
    for (const [campaignId, ids] of porCampanha) {
      const cancelados = await WaCampaignRecipient.updateMany(
        { _id: { $in: ids }, status: "pending" },
        { $set: { status: "skipped", error: MSG_JA_RESPONDEU } },
      );
      if (cancelados.modifiedCount > 0) {
        await WaCampaign.updateOne({ _id: campaignId }, { $inc: { skipped: cancelados.modifiedCount } });
      }
    }
  }

  return { campaignId: String(ganho.campaignId), recipientId: String(ganho._id) };
}
