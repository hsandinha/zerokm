// Fila do disparo de campanha: cada destinatário é RESERVADO antes de ir para
// a Meta. Mesmo desenho da migration 091 do Chatrun (campanha_sem_repetir):
//
//   - O cron roda a cada minuto e não espera a rodada anterior terminar. Sem
//     reserva, duas rodadas liam o mesmo "pending" e mandavam duas vezes.
//     A reserva é um findOneAndUpdate pending → sending: só uma rodada ganha.
//   - Quem está em "sending" NUNCA volta sozinho para "pending". Se a rodada
//     cair no meio, não dá para saber se a Meta recebeu; depois de alguns
//     minutos vira "failed" com o aviso para conferir na conversa. Reenviar
//     sem saber é justamente o que mandava em dobro.
//   - O mesmo número não recebe o MESMO modelo da mesma loja duas vezes em 24h,
//     em qualquer campanha (clique duplo em "Iniciar", arquivo subido de novo).

import type mongoose from "mongoose";
import { WaCampaign, WaCampaignRecipient, type IWaCampaignRecipient } from "@wa/models/wa";

/** Depois disto em "sending", a rodada caiu no meio do envio. */
export const ENVIO_INTERROMPIDO_MIN = 10;
export const JANELA_REPETIDO_HORAS = 24;
export const MSG_ENVIO_INTERROMPIDO =
  "Envio interrompido no meio. Confira na conversa se a mensagem chegou antes de mandar de novo.";

type Id = mongoose.Types.ObjectId | string;

export type Reserva =
  /** Pode enviar: o destinatário agora está em "sending". */
  | "reservado"
  /** O número já recebeu (ou está recebendo) este modelo nas últimas 24h: ficou "skipped". */
  | "repetido"
  /** Outra rodada pegou antes, ou ele não está mais pendente. */
  | "ocupado";

export function msgRepetido(horas = JANELA_REPETIDO_HORAS): string {
  return `Repetido: este número já recebeu este modelo nas últimas ${horas} horas.`;
}

/**
 * Reserva um destinatário pendente. `mesmoModelo`: ids das campanhas da mesma
 * loja com o mesmo template (inclui a própria), para a checagem de repetido.
 *
 * A checagem vem DEPOIS da reserva, com desempate pela hora da reserva no
 * relógio do banco: duas campanhas reservando o mesmo número ao mesmo tempo se
 * enxergam, e só a que reservou primeiro envia.
 */
export async function reservarDestinatario(
  recipientId: Id,
  mesmoModelo: Id[] = [],
  agora: Date = new Date(),
): Promise<{ reserva: Reserva; recipient: IWaCampaignRecipient | null }> {
  const r = await WaCampaignRecipient.findOneAndUpdate(
    { _id: recipientId, status: "pending" },
    { $set: { status: "sending" }, $currentDate: { claimedAt: true } },
    { new: true },
  );
  if (!r) return { reserva: "ocupado", recipient: null };

  if (mesmoModelo.length > 0) {
    const desde = new Date(agora.getTime() - JANELA_REPETIDO_HORAS * 3600_000);
    const minhaReserva = r.claimedAt ?? agora;
    const outro = await WaCampaignRecipient.exists({
      _id: { $ne: r._id },
      tenantId: r.tenantId ?? null,
      phone: r.phone,
      campaignId: { $in: mesmoModelo },
      $or: [
        { status: { $in: ["sent", "delivered", "read", "replied"] }, sentAt: { $gte: desde } },
        // Outra rodada no meio do envio: quem reservou antes fica com ele.
        { status: "sending", claimedAt: { $gte: desde, $lt: minhaReserva } },
        { status: "sending", claimedAt: minhaReserva, _id: { $lt: r._id } },
      ],
    });
    if (outro) {
      const pulou = await WaCampaignRecipient.updateOne(
        { _id: r._id, status: "sending" },
        { $set: { status: "skipped", error: msgRepetido() } },
      );
      if (pulou.modifiedCount > 0) {
        await WaCampaign.updateOne({ _id: r.campaignId }, { $inc: { skipped: 1 } });
      }
      return { reserva: "repetido", recipient: null };
    }
  }
  return { reserva: "reservado", recipient: r };
}

/**
 * Rodada que caiu no meio do envio: o que está em "sending" há mais de
 * ENVIO_INTERROMPIDO_MIN vira "failed" (não sabemos se a Meta recebeu).
 * Devolve quantos foram encerrados.
 */
export async function encerrarEnviosInterrompidos(
  campaignId: Id,
  agora: Date = new Date(),
): Promise<number> {
  const limite = new Date(agora.getTime() - ENVIO_INTERROMPIDO_MIN * 60_000);
  const r = await WaCampaignRecipient.updateMany(
    {
      campaignId,
      status: "sending",
      $or: [{ claimedAt: { $lt: limite } }, { claimedAt: null }],
    },
    { $set: { status: "failed", error: MSG_ENVIO_INTERROMPIDO } },
  );
  if (r.modifiedCount > 0) {
    await WaCampaign.updateOne({ _id: campaignId }, { $inc: { failed: r.modifiedCount } });
  }
  return r.modifiedCount;
}

/**
 * A Meta aceitou: marca como enviada e conta. Tenta a gravação duas vezes; se
 * ainda assim falhar, o destinatário fica em "sending" e vira "failed" com o
 * aviso de conferir, mas nunca volta para a fila.
 */
export async function marcarEnviado(
  r: { _id: Id; campaignId: Id },
  campos: { externalId?: string | null; conversationId?: Id | null; error?: string | null },
): Promise<void> {
  const set: Record<string, unknown> = { status: "sent", sentAt: new Date() };
  if (campos.externalId) set.externalId = campos.externalId;
  if (campos.conversationId) set.conversationId = campos.conversationId;
  if (campos.error) set.error = campos.error;
  let res: { modifiedCount: number } | null = null;
  for (let tentativa = 0; tentativa < 2 && !res; tentativa++) {
    res = await WaCampaignRecipient.updateOne({ _id: r._id, status: "sending" }, { $set: set }).catch(
      (err) => {
        console.error("[campanha] não consegui marcar como enviada", String(r._id), err);
        return null;
      },
    );
  }
  // Conta mesmo se a linha não casou: a mensagem saiu.
  await WaCampaign.updateOne({ _id: r.campaignId }, { $inc: { sent: 1 } });
}

/** Nada saiu (limite de ritmo do gateway, campanha pausada no meio): volta
 *  para a fila exatamente como estava. */
export async function devolverParaFila(r: { _id: Id }): Promise<void> {
  await WaCampaignRecipient.updateOne(
    { _id: r._id, status: "sending" },
    { $set: { status: "pending" }, $unset: { claimedAt: "" } },
  );
}

/** A Meta recusou este destinatário. */
export async function marcarFalha(r: { _id: Id; campaignId: Id }, erro: string): Promise<void> {
  const res = await WaCampaignRecipient.updateOne(
    { _id: r._id, status: "sending" },
    { $set: { status: "failed", error: erro.slice(0, 300) } },
  );
  if (res.modifiedCount > 0) {
    await WaCampaign.updateOne({ _id: r.campaignId }, { $inc: { failed: 1 } });
  }
}

/** Pula sem enviar (opt-out que chegou depois de montar a campanha...). */
export async function pularDestinatario(
  r: { _id: Id; campaignId: Id },
  motivo: string,
  de: "pending" | "sending" = "pending",
): Promise<boolean> {
  const res = await WaCampaignRecipient.updateOne(
    { _id: r._id, status: de },
    { $set: { status: "skipped", error: motivo } },
  );
  if (res.modifiedCount > 0) {
    await WaCampaign.updateOne({ _id: r.campaignId }, { $inc: { skipped: 1 } });
    return true;
  }
  return false;
}
