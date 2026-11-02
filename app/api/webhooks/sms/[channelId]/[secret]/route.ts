// Webhook do canal SMS/RCS de uma loja: resposta da cliente e status de
// entrega, da Zenvia ou da Comtele. Um endereço por canal:
//   /api/webhooks/sms/<id do canal>/<segredo>
// Nenhum dos dois provedores assina o que manda, então o segredo no caminho
// (gerado por canal, guardado cifrado) é a autenticação — e o id do canal já
// diz de qual loja é a mensagem. O corpo é lido no formato do provedor que o
// canal usa.
//
// Os dois provedores contam como falha a resposta lenta (a Zenvia rebaixa o
// webhook depois de 10 falhas): responde na hora e processa depois.

import { after, NextRequest, NextResponse } from "next/server";
import { parseZenviaEvent } from "@wa/lib/zenvia";
import { parseComteleEvent } from "@wa/lib/comtele";
import { processSmsEvent, smsChannelForWebhook } from "@wa/lib/sms";
import { WaChannel } from "@wa/models/channel";

export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ channelId: string; secret: string }> },
) {
  const { channelId, secret } = await ctx.params;
  const found = await smsChannelForWebhook(channelId, secret);
  if (!found) return new NextResponse("unauthorized", { status: 401 });

  const body = await req.json().catch(() => null);
  let event = null;
  let lowBalance = false;
  if (found.provider === "comtele") {
    ({ event, lowBalance } = parseComteleEvent(body));
  } else {
    event = parseZenviaEvent(body);
  }

  after(async () => {
    if (lowBalance) {
      // A conta DA LOJA acabou na Comtele: nada sai até a recarga. O painel
      // mostra o aviso no canal.
      await WaChannel.updateOne(
        { _id: channelId },
        { lastError: "Conta da Comtele sem saldo: recarregue no painel da Comtele." },
      ).catch(() => {});
    }
    if (!event) return;
    try {
      await processSmsEvent(found.channel, event);
    } catch (err) {
      console.error("[sms] evento não processado:", event.type, event.id, err);
    }
  });
  return NextResponse.json({ ok: true });
}
