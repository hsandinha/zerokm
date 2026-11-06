// Opt-out levado ao gateway. A zerokm já não manda nada para quem pediu para
// sair, mas a isca de comentário do Instagram é enviada pelo próprio gateway,
// sem passar por aqui: sem o bloqueio lá, quem pediu "parar" e comenta de novo
// num post recebe o Direct automático. O gateway confere o bloqueio da conta
// antes de responder ao comentário. O motivo gravado ("no_automation", em
// wa/lib/chatrun.ts) barra só a isca: a resposta da equipe continua saindo.
//
// Só Instagram e Messenger ("ig:" e "fb:"): no WhatsApp o gateway não manda
// nada sozinho. Falha aqui nunca atrapalha o opt-out em si: ele já está
// gravado no contato, e o envio da zerokm continua respeitando.

import dbConnect from "@/lib/mongodb";
import { WaChannel } from "@wa/models/channel";
import { blockContact, chatrunConfigured, unblockContact } from "@wa/lib/chatrun";
import { FB_PREFIX, IG_PREFIX } from "@wa/lib/channels";

const TEMPO_MAXIMO_MS = 4000;

/** O canal do contato pelo prefixo da chave ("ig:" → instagram). */
export function canalDaChave(phone: string): "instagram" | "messenger" | null {
  if (phone.startsWith(IG_PREFIX)) return "instagram";
  if (phone.startsWith(FB_PREFIX)) return "messenger";
  return null;
}

/** Contas do gateway dos canais daquele tipo do dono (normalmente uma). */
async function contasDoDono(tenantId: string | null, kind: "instagram" | "messenger"): Promise<string[]> {
  await dbConnect();
  const canais = await WaChannel.find({
    tenantId: tenantId ?? null,
    kind,
    provider: "chatrun",
    chatrunAccountId: { $exists: true, $nin: [null, ""] },
  })
    .select("chatrunAccountId")
    .lean<Array<{ chatrunAccountId?: string | null }>>();
  return [...new Set(canais.map((c) => c.chatrunAccountId).filter((id): id is string => Boolean(id)))];
}

/**
 * Bloqueia (opt-out) ou desbloqueia o contato no gateway. Nunca lança: o
 * opt-out local já vale, isto é só para o que o gateway manda sozinho.
 */
export async function sincronizarOptOutNoGateway(
  contact: { tenantId?: string | null; phone: string },
  saiu: boolean,
  detalhe?: string,
): Promise<void> {
  const kind = canalDaChave(contact.phone);
  if (!kind || !chatrunConfigured()) return;
  try {
    const contas = await contasDoDono(contact.tenantId ?? null, kind);
    await Promise.allSettled(
      contas.map((accountId) => {
        const signal = AbortSignal.timeout(TEMPO_MAXIMO_MS);
        return saiu
          ? blockContact({ accountId, phone: contact.phone, detail: detalhe, signal })
          : unblockContact({ accountId, phone: contact.phone, signal });
      }),
    ).then((rs) => {
      for (const r of rs) {
        if (r.status === "rejected") console.warn("[chatrun] opt-out não chegou ao gateway:", r.reason);
      }
    });
  } catch (err) {
    console.warn("[chatrun] opt-out não chegou ao gateway:", err);
  }
}
