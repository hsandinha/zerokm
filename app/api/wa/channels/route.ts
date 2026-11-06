// Canais de quem está operando (o CNV ou a loja) para a tela de Configuração.
// Segredos nunca saem — a exceção é o endereço do webhook de SMS, que leva o
// segredo do canal no caminho: só o gestor vê, e é ele quem precisa colar o
// endereço no painel da Comtele.

import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireScopeAdmin, type Scope } from "@wa/lib/scope";
import { WaChannel } from "@wa/models/channel";
import { channelLabelOf, cnvWhatsappChannel, safeDecrypt } from "@wa/lib/channels";
import { chatrunConfigured } from "@wa/lib/chatrun";
import { smsWebhookPath } from "@wa/lib/sms";
import { siteUrl } from "@wa/lib/site-url";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  let scope: Scope;
  try {
    scope = await requireScopeAdmin();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  await dbConnect();
  if (!scope.tenantId) await cnvWhatsappChannel(); // migra o WABA antigo, se ainda não migrou
  const channels = await WaChannel.find({ tenantId: scope.tenantId })
    .sort({ kind: -1, createdAt: 1 })
    .lean();
  const base = siteUrl(req);

  return NextResponse.json({
    channels: channels.map((c) => {
      const secret = c.kind === "sms" ? safeDecrypt(c.smsWebhookSecret) : undefined;
      const smsToken = c.kind === "sms" ? safeDecrypt(c.smsToken) : undefined;
      return {
        id: String(c._id),
        kind: c.kind,
        status: c.status,
        label:
          c.kind === "whatsapp"
            ? c.displayPhone || c.phoneNumberId || "WhatsApp"
            : channelLabelOf(c),
        tokenExpiresAt: c.igTokenExpiresAt ?? null,
        lastError: c.lastError ?? null,
        ...(c.kind === "messenger" ? { pageId: c.fbPageId ?? null, pageName: c.fbPageName ?? null } : {}),
        ...(c.kind === "sms"
          ? {
              sms: {
                provider: c.smsProvider ?? null,
                sender: c.smsSender ?? null,
                route: c.smsRoute ?? null,
                rcsAgentId: c.rcsAgentId ?? null,
                // Fim da chave, para conferir sem mostrar a chave.
                tokenEnd: smsToken ? smsToken.slice(-4) : null,
                webhookUrl: secret ? `${base}${smsWebhookPath(String(c._id), secret)}` : null,
              },
            }
          : {}),
      };
    }),
    // Instagram e Messenger conectam pelo Chatrun Conexão: basta a chave dele.
    instagramReady: chatrunConfigured(),
    messengerReady: chatrunConfigured(),
  });
}
