// Webhook do Instagram (objeto "instagram", app com Instagram Login).
//   GET  = verificação (hub.challenge)
//   POST = mensagens do Direct, ecos (o que a conta mandou), leituras e reações
//
// O roteamento é pela conta profissional: `recipient.id` na mensagem recebida,
// `sender.id` no eco. Depois de normalizado, o Direct entra no MESMO pipeline
// do WhatsApp (processInbound → IA → Central). Portado do Chatrun.

import { after, NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { WaAiJob, WaContact, WaConversation, WaMessage } from "@wa/models/wa";
import { channelByIgUserId, getVerifyToken, IG_PREFIX } from "@wa/lib/channels";
import { igGetProfile } from "@wa/lib/instagram";
import { processInbound } from "@wa/lib/inbound";
import { verifyWebhookSignature } from "@wa/lib/meta";
import { isLocalUrl, siteUrl } from "@wa/lib/site-url";

export const maxDuration = 60;

// O eco de uma mensagem que NÓS mandamos pela API pode chegar antes de ela
// ser gravada. Esperar um pouco antes do dedupe evita registrar a fala da
// Vera como "a equipe respondeu pelo app" — o que pausaria a IA à toa.
const ECHO_GRACE_MS = 3000;

type IgAttachment = { type?: string; payload?: { url?: string; title?: string } };
type IgMessaging = {
  sender: { id: string };
  recipient: { id: string };
  timestamp?: number;
  message?: {
    mid: string;
    text?: string;
    is_echo?: boolean;
    is_deleted?: boolean;
    is_unsupported?: boolean;
    attachments?: IgAttachment[];
    reply_to?: { mid?: string; story?: { url?: string; id?: string } };
  };
  read?: { mid: string };
  reaction?: { mid: string; action: "react" | "unreact"; emoji?: string };
  postback?: { mid?: string; title?: string; payload?: string };
};
type IgEntry = { id: string; messaging?: IgMessaging[] };

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const expected = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ?? (await getVerifyToken());
  if (expected && sp.get("hub.mode") === "subscribe" && sp.get("hub.verify_token") === expected) {
    return new NextResponse(sp.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

// Anexo do Direct → tipo/texto que o pipeline entende. A URL do anexo é
// assinada pela Meta e expira em horas: não guardamos, a IA lê o rótulo.
function normalizeAttachment(a: IgAttachment | undefined): { type: string; text: string | null } {
  const kind = a?.type ?? "";
  if (kind === "image") return { type: "image", text: null };
  if (kind === "video" || kind === "ig_reel" || kind === "reel") return { type: "video", text: null };
  if (kind === "audio") return { type: "audio", text: null };
  if (kind === "file") return { type: "document", text: a?.payload?.title ?? null };
  if (kind === "share") return { type: "text", text: "[compartilhou um post]" };
  if (kind === "story_mention") return { type: "text", text: "[te mencionou em um story]" };
  return { type: "text", text: `[conteúdo do Instagram: ${kind || "desconhecido"}]` };
}

/** Eco: a conta respondeu pelo app do Instagram — humano entrou, IA pausa. */
async function handleEcho(m: IgMessaging) {
  const message = m.message!;
  if (message.is_deleted) return;
  // Marcar alguém no próprio story também chega como eco, e não é resposta a
  // ninguém (medido no Chatrun: abria conversas que nunca existiram).
  if (message.attachments?.[0]?.type === "story_mention") return;

  const channel = await channelByIgUserId(m.sender.id);
  if (!channel) return;

  await new Promise((r) => setTimeout(r, ECHO_GRACE_MS));
  await dbConnect();
  if (await WaMessage.exists({ externalId: message.mid })) return; // foi a Vera/Central

  // Só reflete eco de conversa que já existe: a primeira mensagem partindo do
  // app não tem por que abrir conversa no funil da Vera.
  const contact = await WaContact.findOne({
    tenantId: channel.tenantId ?? null,
    phone: `${IG_PREFIX}${m.recipient.id}`,
  });
  if (!contact) return;
  const conv = await WaConversation.findOne({ contactId: contact._id });
  if (!conv) return;

  const att = normalizeAttachment(message.attachments?.[0]);
  const text = message.text ?? att.text ?? "";
  await WaMessage.create({
    conversationId: conv._id,
    direction: "outbound",
    sender: "human",
    content: text || undefined,
    mediaType: message.attachments?.length ? att.type : "text",
    externalId: message.mid,
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
      lastMessagePreview: (text || `[${att.type}]`).slice(0, 120),
    },
  );
  await WaAiJob.updateMany(
    { conversationId: conv._id, status: "pending" },
    { status: "done", lastError: "cancelado: equipe respondeu pelo app do Instagram" },
  );
}

/** Devolve true quando entrou mensagem nova (para acordar o worker da IA). */
async function handleMessaging(m: IgMessaging): Promise<boolean> {
  if (m.message?.is_echo) {
    await handleEcho(m);
    return false;
  }

  const channel = await channelByIgUserId(m.recipient.id);
  if (!channel) return false;
  await dbConnect();

  if (m.read?.mid) {
    await WaMessage.updateOne({ externalId: m.read.mid }, { status: "read" }).catch(() => {});
    return false;
  }
  if (m.reaction?.mid) {
    const emoji = m.reaction.action === "unreact" ? null : (m.reaction.emoji ?? "❤️");
    await WaMessage.updateOne({ externalId: m.reaction.mid }, { reaction: emoji }).catch(() => {});
    return false;
  }

  const postbackText = m.postback?.title ?? null;
  if (!m.message && !postbackText) return false;
  if (m.message?.is_deleted) return false;

  // Nome/@ da pessoa: uma busca na Meta por contato novo, não por mensagem.
  let contactName: string | null = null;
  let igUsername: string | null = null;
  const known = await WaContact.findOne({
    tenantId: channel.tenantId ?? null,
    phone: `${IG_PREFIX}${m.sender.id}`,
  })
    .select("name")
    .lean();
  if (!known?.name && channel.ig) {
    const profile = await igGetProfile(channel.ig, m.sender.id);
    contactName = profile.name ?? (profile.username ? `@${profile.username}` : null);
    igUsername = profile.username;
  }

  const hasAttachment = Boolean(m.message?.attachments?.length);
  const att = normalizeAttachment(m.message?.attachments?.[0]);
  const type = postbackText ? "text" : hasAttachment ? att.type : "text";
  let text = postbackText ?? m.message?.text ?? (hasAttachment ? att.text : null);
  if (m.message?.is_unsupported) {
    text = "[mensagem que o Instagram não entrega pela API — peça para a pessoa escrever]";
  }
  // Resposta a um story nosso: o contexto importa para a IA.
  if (m.message?.reply_to?.story) {
    text = `(respondeu ao seu story) ${text ?? ""}`.trim();
  }

  await processInbound(channel, {
    from: m.sender.id,
    contactName,
    igUsername,
    type,
    text,
    externalId: m.message?.mid ?? m.postback?.mid ?? `pb-${m.sender.id}-${m.timestamp ?? Date.now()}`,
  });
  return true;
}

export async function POST(req: NextRequest) {
  const raw = await req.text();

  const appSecret = process.env.INSTAGRAM_APP_SECRET ?? process.env.META_APP_SECRET;
  if (!appSecret) return new NextResponse("app secret missing", { status: 500 });
  if (!verifyWebhookSignature(appSecret, raw, req.headers.get("x-hub-signature-256"))) {
    return new NextResponse("invalid signature", { status: 401 });
  }

  let payload: { object?: string; entry?: IgEntry[] };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }
  if (payload.object !== "instagram") return NextResponse.json({ ok: true });

  // Responde primeiro e processa depois: resposta demorada faz a Meta
  // reenviar, e o eco espera alguns segundos de propósito.
  const entries = payload.entry ?? [];
  const base = siteUrl(req);
  after(async () => {
    let hadInbound = false;
    for (const entry of entries) {
      for (const m of entry.messaging ?? []) {
        try {
          if (await handleMessaging(m)) hadInbound = true;
        } catch (err) {
          console.error("[instagram] evento não processado:", err);
        }
      }
    }
    // Acorda o worker da IA (o cron de 1 min é a rede de segurança).
    if (hadInbound && process.env.CRON_SECRET && !isLocalUrl(base)) {
      await fetch(`${base}/api/wa/workers/ai`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      }).catch(() => {});
    }
  });

  return NextResponse.json({ ok: true });
}
