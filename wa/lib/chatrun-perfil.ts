// Direct do Instagram e Messenger que chegam pelo Chatrun Conexão.
//
// O gateway já normaliza a mensagem (tipo, texto, nome e @ da pessoa); aqui
// ela vira a entrada do pipeline (processInbound), como o WhatsApp. O contato
// é "ig:<id>" / "fb:<PSID>", a mesma chave dos webhooks antigos.

import dbConnect from "@/lib/mongodb";
import { WaAiJob, WaContact, WaConversation, WaMessage } from "@wa/models/wa";
import { contactKeyFor, type ResolvedChannel } from "@wa/lib/channels";
import type { NormalizedInbound } from "@wa/lib/inbound";

export type MensagemDoPerfil = {
  wamid?: string;
  type?: string;
  text?: string | null;
  media_url?: string | null;
  /** Mensagem citada (reply_to.mid no Direct e no Messenger). */
  context_wamid?: string | null;
};

export type ContatoDoPerfil = {
  phone?: string;
  ig_id?: string;
  fb_id?: string;
  username?: string | null;
  name?: string | null;
};

const NOME_DO_CANAL = { instagram: "Instagram", messenger: "Messenger" } as const;

/** Tipo e texto que o pipeline entende. A URL do anexo é da Meta e expira:
 *  não guardamos, a IA lê o rótulo (como nos webhooks antigos). */
export function conteudoDoPerfil(
  kind: "instagram" | "messenger",
  m: MensagemDoPerfil,
): { type: string; text: string | null } {
  const tipo = m.type ?? "text";
  const texto = m.text ?? null;
  if (tipo === "text" || tipo === "button") return { type: "text", text: texto };
  if (["image", "video", "audio", "document", "sticker"].includes(tipo)) return { type: tipo, text: texto };
  if (tipo === "share") {
    if (kind === "instagram") return { type: "text", text: "[compartilhou um post]" };
    return { type: "text", text: `[compartilhou um link]${texto ? ` ${texto}` : ""}` };
  }
  if (tipo === "story_mention") return { type: "text", text: "[te mencionou em um story]" };
  if (tipo === "location") return { type: "text", text: "[mandou uma localização]" };
  return { type: "text", text: texto ?? `[conteúdo do ${NOME_DO_CANAL[kind]}: ${tipo || "desconhecido"}]` };
}

/** `message.received` do Instagram/Messenger → entrada do pipeline. */
export function entradaDoPerfil(
  kind: "instagram" | "messenger",
  m: MensagemDoPerfil,
  contato: ContatoDoPerfil,
): NormalizedInbound | null {
  const id = kind === "instagram" ? contato.ig_id : contato.fb_id;
  const pessoa = id ?? contato.phone?.replace(/^(ig|fb):/, "");
  if (!pessoa || !m.wamid) return null;
  const { type, text } = conteudoDoPerfil(kind, m);
  return {
    from: pessoa,
    contactName: contato.name ?? (contato.username ? `@${contato.username}` : null),
    igUsername: kind === "instagram" ? contato.username ?? null : null,
    type,
    text,
    externalId: m.wamid,
    contextExternalId: m.context_wamid ?? null,
  };
}

// O eco de uma mensagem que NÓS mandamos pode chegar antes de ela ser
// gravada: esperar um pouco antes do dedupe evita registrar a fala da IA
// como "a equipe respondeu pelo app" (o que pausaria a IA à toa).
const ECHO_GRACE_MS = 3000;

/** `message.echo`: a conta respondeu pelo app (Instagram, Facebook, Business
 *  Suite). Humano entrou: vira mensagem da equipe e a IA pausa. Só reflete
 *  conversa que já existe. */
export async function ecoDoPerfil(
  channel: ResolvedChannel,
  m: MensagemDoPerfil,
  contato: ContatoDoPerfil,
  graceMs = ECHO_GRACE_MS,
): Promise<void> {
  const kind = channel.kind as "instagram" | "messenger";
  const id = kind === "instagram" ? contato.ig_id : contato.fb_id;
  const pessoa = id ?? contato.phone?.replace(/^(ig|fb):/, "");
  if (!pessoa || !m.wamid || m.type === "story_mention") return;

  if (graceMs > 0) await new Promise((r) => setTimeout(r, graceMs));
  await dbConnect();
  if (await WaMessage.exists({ externalId: m.wamid })) return; // foi a IA/Central

  const contact = await WaContact.findOne({
    tenantId: channel.tenantId ?? null,
    phone: contactKeyFor(kind, pessoa),
  });
  if (!contact) return;
  const conv = await WaConversation.findOne({ contactId: contact._id });
  if (!conv) return;

  const { type, text } = conteudoDoPerfil(kind, m);
  await WaMessage.create({
    conversationId: conv._id,
    direction: "outbound",
    sender: "human",
    content: text || undefined,
    mediaType: type,
    externalId: m.wamid,
    status: "sent",
  }).catch((err) => {
    if ((err as { code?: number })?.code !== 11000) throw err;
  });
  await WaConversation.updateOne(
    { _id: conv._id },
    {
      status: "human_active",
      waitingSince: null,
      lastMessageAt: new Date(),
      lastMessagePreview: (text || `[${type}]`).slice(0, 120),
    },
  );
  await WaAiJob.updateMany(
    { conversationId: conv._id, status: "pending" },
    { status: "done", lastError: `cancelado: equipe respondeu pelo app do ${NOME_DO_CANAL[kind]}` },
  );
}
