// Webhook da Meta Cloud API — GET verifica a assinatura do canal,
// POST recebe mensagens e status. Sempre responde 200 (senão a Meta re-tenta).
// Os números das lojas conectados pelo Chatrun Conexão não passam aqui: o
// gateway recebe e repassa em /api/chatrun/eventos (mesmo processamento).

import { NextRequest, NextResponse } from "next/server";
import { getVerifyToken, getWabaCredentials } from "@wa/lib/settings";
import { verifyWebhookSignature, type MetaWebhookValue } from "@wa/lib/meta";
import { channelForWhatsappNumber } from "@wa/lib/channels";
import { processWhatsappValue, wakeAiWorker } from "@wa/lib/whatsapp-webhook";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const mode = sp.get("hub.mode");
  const token = sp.get("hub.verify_token");
  const challenge = sp.get("hub.challenge");

  const expected = await getVerifyToken();
  if (mode === "subscribe" && expected && token === expected) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();

  // Assinatura HMAC (se houver app secret configurado). Vale o segredo do app
  // da plataforma (por onde chegam os números das lojas, via Embedded Signup)
  // e o do WABA do CNV, que pode ser de outro app.
  const creds = await getWabaCredentials().catch(() => null);
  const secrets = [...new Set([process.env.META_APP_SECRET, creds?.appSecret].filter(Boolean))] as string[];
  if (secrets.length) {
    const header = req.headers.get("x-hub-signature-256");
    const ok = secrets.some((secret) => verifyWebhookSignature(secret, raw, header));
    if (!ok) return new NextResponse("ok", { status: 200 }); // descarta silenciosamente
  }

  let payload: { entry?: Array<{ changes?: Array<{ value?: MetaWebhookValue }> }> };
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse("ok", { status: 200 });
  }

  let hadInbound = false;
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;
      // O número que recebeu diz de qual canal (e de qual dono) é a conversa.
      const channel = await channelForWhatsappNumber(value.metadata?.phone_number_id);
      const r = await processWhatsappValue(channel, value);
      hadInbound ||= r.hadInbound;
    }
  }

  if (hadInbound) wakeAiWorker(req);

  return new NextResponse("ok", { status: 200 });
}
