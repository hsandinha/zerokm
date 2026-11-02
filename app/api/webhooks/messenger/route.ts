// Webhook da Página do Facebook (objeto "page", canal Messenger).
//   GET  = verificação (hub.challenge)
//   POST = mensagens do Messenger, ecos (a Página respondeu pelo Facebook ou
//          pelo Meta Business Suite), entregas, leituras, reações e cliques
//          em botão
//
// O roteamento é pelo id da Página, que vem em `entry.id`. Depois de
// normalizada, a mensagem entra no MESMO pipeline do WhatsApp e do Instagram
// (processInbound → IA → Central). Portado do Chatrun (088), sem as iscas de
// comentário.

import { after, NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { WaAiJob, WaContact, WaConversation, WaMessage } from "@wa/models/wa";
import { channelByFbPageId, FB_PREFIX, getVerifyToken, type ResolvedChannel } from "@wa/lib/channels";
import { fbGetProfile, fbMarkSeen } from "@wa/lib/messenger";
import { processInbound } from "@wa/lib/inbound";
import { verifyWebhookSignature } from "@wa/lib/meta";
import { isLocalUrl, siteUrl } from "@wa/lib/site-url";

export const maxDuration = 60;

// Eco sem o app_id do nosso app pode ainda assim ser fala nossa que chegou
// antes de ser gravada: espera um pouco antes do dedupe (mesma folga do
// webhook do Instagram), para não pausar a IA à toa.
const ECHO_GRACE_MS = 3000;

type FbAttachment = { type?: string; payload?: { url?: string; title?: string; sticker_id?: number } };
type FbMessaging = {
  sender: { id: string };
  recipient: { id: string };
  timestamp?: number;
  message?: {
    mid: string;
    text?: string;
    is_echo?: boolean;
    app_id?: number | string;
    is_deleted?: boolean;
    is_unsupported?: boolean;
    attachments?: FbAttachment[];
  };
  delivery?: { mids?: string[]; watermark?: number };
  read?: { watermark?: number };
  reaction?: { mid: string; action: "react" | "unreact"; reaction?: string; emoji?: string };
  postback?: { mid?: string; title?: string; payload?: string };
};
type FbEntry = { id: string; time?: number; messaging?: FbMessaging[] };

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const expected = process.env.MESSENGER_WEBHOOK_VERIFY_TOKEN ?? (await getVerifyToken());
  if (expected && sp.get("hub.mode") === "subscribe" && sp.get("hub.verify_token") === expected) {
    return new NextResponse(sp.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

// Anexo do Messenger → tipo/texto que o pipeline entende. A URL do anexo é
// assinada pela Meta e expira: não guardamos, a IA lê o rótulo.
function normalizeAttachment(a: FbAttachment | undefined): { type: string; text: string | null } {
  const kind = a?.type ?? "";
  if (kind === "image") {
    // Figurinha (o "joinha" grande também) chega como imagem com sticker_id.
    return { type: a?.payload?.sticker_id ? "sticker" : "image", text: null };
  }
  if (kind === "video") return { type: "video", text: null };
  if (kind === "audio") return { type: "audio", text: null };
  if (kind === "file") return { type: "document", text: a?.payload?.title ?? null };
  if (kind === "fallback" || kind === "share") {
    const url = a?.payload?.url;
    return { type: "text", text: `[compartilhou um link]${url ? ` ${url}` : ""}` };
  }
  if (kind === "location") return { type: "text", text: "[mandou uma localização]" };
  return { type: "text", text: `[conteúdo do Messenger: ${kind || "desconhecido"}]` };
}

/** Conversa da pessoa nesta Página (para leitura e eco). */
async function conversationOf(channel: ResolvedChannel, psid: string) {
  const contact = await WaContact.findOne({
    tenantId: channel.tenantId ?? null,
    phone: `${FB_PREFIX}${psid}`,
  }).select("_id");
  if (!contact) return null;
  return WaConversation.findOne({ contactId: contact._id });
}

/** Eco: a Página respondeu pelo Facebook/Business Suite — humano entrou, IA pausa. */
async function handleEcho(channel: ResolvedChannel, m: FbMessaging) {
  const message = m.message!;
  if (message.is_deleted) return;
  // O que NÓS mandamos volta com o app_id do nosso app e já está gravado.
  const ourApp = process.env.META_APP_ID;
  if (ourApp && String(message.app_id ?? "") === ourApp) return;

  await new Promise((r) => setTimeout(r, ECHO_GRACE_MS));
  await dbConnect();
  if (await WaMessage.exists({ externalId: message.mid })) return; // foi a Vera/Central

  // Só reflete eco de conversa que já existe: a primeira mensagem partindo
  // da Página não tem por que abrir conversa no funil.
  const conv = await conversationOf(channel, m.recipient.id);
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
    { status: "done", lastError: "cancelado: equipe respondeu pela Página do Facebook" },
  );
}

/** Devolve true quando entrou mensagem nova (para acordar o worker da IA). */
async function handleMessaging(pageId: string, m: FbMessaging): Promise<boolean> {
  const channel = await channelByFbPageId(pageId);
  if (!channel) return false;

  if (m.message?.is_echo) {
    await handleEcho(channel, m);
    return false;
  }

  await dbConnect();
  const psid = m.sender.id;

  // Entregue: as mensagens citadas saem de "enviada".
  if (m.delivery) {
    if (m.delivery.mids?.length) {
      await WaMessage.updateMany(
        { externalId: { $in: m.delivery.mids }, status: "sent" },
        { status: "delivered" },
      ).catch(() => {});
    }
    return false;
  }

  // Lida: o Messenger não diz qual mensagem, diz "tudo até este instante".
  if (m.read?.watermark) {
    const conv = await conversationOf(channel, psid);
    if (conv) {
      await WaMessage.updateMany(
        {
          conversationId: conv._id,
          direction: "outbound",
          status: { $in: ["sent", "delivered"] },
          createdAt: { $lte: new Date(m.read.watermark) },
        },
        { status: "read" },
      ).catch(() => {});
    }
    return false;
  }

  // Reação da pessoa a uma mensagem nossa.
  if (m.reaction?.mid) {
    const emoji = m.reaction.action === "unreact" ? null : (m.reaction.emoji ?? "❤️");
    await WaMessage.updateOne({ externalId: m.reaction.mid }, { reaction: emoji }).catch(() => {});
    return false;
  }

  // Clique em botão vira texto.
  const postbackText = m.postback?.title ?? null;
  if (!m.message && !postbackText) return false;
  if (m.message?.is_deleted) return false;

  // Nome da pessoa: uma busca na Meta por contato novo, não por mensagem.
  let contactName: string | null = null;
  const known = await WaContact.findOne({
    tenantId: channel.tenantId ?? null,
    phone: `${FB_PREFIX}${psid}`,
  })
    .select("name")
    .lean();
  if (!known?.name && channel.fb) {
    contactName = (await fbGetProfile(channel.fb, psid)).name;
  }

  const hasAttachment = Boolean(m.message?.attachments?.length);
  const att = normalizeAttachment(m.message?.attachments?.[0]);
  const type = postbackText ? "text" : hasAttachment ? att.type : "text";
  let text = postbackText ?? m.message?.text ?? (hasAttachment ? att.text : null);
  if (m.message?.is_unsupported) {
    text = "[mensagem que o Messenger não entrega pela API — peça para a pessoa escrever]";
  }

  await processInbound(channel, {
    from: psid,
    contactName,
    type,
    text,
    externalId: m.message?.mid ?? m.postback?.mid ?? `pb-${psid}-${m.timestamp ?? Date.now()}`,
  });

  // Os dois vistos para a pessoa: alguém (ou a IA) recebeu.
  if (channel.fb) await fbMarkSeen(channel.fb, psid);
  return true;
}

export async function POST(req: NextRequest) {
  const raw = await req.text();

  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) return new NextResponse("app secret missing", { status: 500 });
  if (!verifyWebhookSignature(appSecret, raw, req.headers.get("x-hub-signature-256"))) {
    return new NextResponse("invalid signature", { status: 401 });
  }

  let payload: { object?: string; entry?: FbEntry[] };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }
  if (payload.object !== "page") return NextResponse.json({ ok: true });

  // Responde primeiro e processa depois: resposta demorada faz a Meta
  // reenviar, e o eco espera alguns segundos de propósito.
  const entries = payload.entry ?? [];
  const base = siteUrl(req);
  after(async () => {
    let hadInbound = false;
    for (const entry of entries) {
      for (const m of entry.messaging ?? []) {
        try {
          if (await handleMessaging(entry.id, m)) hadInbound = true;
        } catch (err) {
          console.error("[messenger] evento não processado:", err);
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
