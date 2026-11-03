// Conta de SMS/RCS de quem está operando (o CNV ou a loja): cria ou atualiza
// o canal `sms`. Cada loja paga o próprio disparo — a conta do provedor é
// dela, e não existe crédito nem cobrança aqui (diferente do Chatrun, onde a
// plataforma revendia SMS).
//
//   POST { provider: "zenvia" | "comtele", token?, sender?, route?, rcsAgentId? }
//
// Token em branco mantém o guardado (para trocar só o remetente ou o agente).
// Antes de gravar, a conta é conferida no provedor: Comtele pelo saldo,
// Zenvia pela lista de webhooks. Na Zenvia o webhook do canal é assinado
// sozinho; na Comtele o endereço é cadastrado à mão (a tela mostra qual).

import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireScopeAdmin, scopeError, type Scope } from "@wa/lib/scope";
import { WaChannel } from "@wa/models/channel";
import { encrypt } from "@wa/lib/crypto";
import { safeDecrypt } from "@wa/lib/channels";
import { newSmsWebhookSecret, smsWebhookPath } from "@wa/lib/sms";
import { comteleBalance } from "@wa/lib/comtele";
import { zenviaSubscribe, zenviaSubscriptions, zenviaUnsubscribe } from "@wa/lib/zenvia";
import { validateSmsAccount } from "@wa/lib/sms-types";
import { isLocalUrl, siteUrl } from "@wa/lib/site-url";

export async function POST(req: NextRequest) {
  let scope: Scope;
  try {
    scope = await requireScopeAdmin("sms");
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  await dbConnect();
  // O dono vem da sessão, nunca do corpo.
  const existing = await WaChannel.findOne({ tenantId: scope.tenantId, kind: "sms" });
  const storedToken = safeDecrypt(existing?.smsToken);

  const checked = validateSmsAccount(body, {
    hasStoredToken: Boolean(storedToken),
    storedProvider: existing?.smsProvider ?? null,
  });
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const account = checked.account;
  const token = account.token ?? storedToken!;

  // Confere a conta no provedor: chave errada não entra.
  try {
    if (account.provider === "comtele") await comteleBalance(token);
    else await zenviaSubscriptions(token);
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `O provedor recusou a conta: ${why.slice(0, 160)}` },
      { status: 400 },
    );
  }

  const secret = safeDecrypt(existing?.smsWebhookSecret) || newSmsWebhookSecret();
  // Campo vazio no formulário sai do canal (ex.: tirar o agente RCS volta a SMS).
  const unset: Record<string, 1> = {};
  if (!account.sender) unset.smsSender = 1;
  if (!account.route) unset.smsRoute = 1;
  if (!account.rcsAgentId) unset.rcsAgentId = 1;
  const channel = await WaChannel.findOneAndUpdate(
    { tenantId: scope.tenantId, kind: "sms" },
    {
      $set: {
        kind: "sms",
        tenantId: scope.tenantId,
        status: "connected",
        smsProvider: account.provider,
        smsToken: encrypt(token),
        smsWebhookSecret: encrypt(secret),
        displayName: account.provider === "zenvia" ? "SMS (Zenvia)" : "SMS (Comtele)",
        lastError: null,
        ...(account.sender ? { smsSender: account.sender } : {}),
        ...(account.route ? { smsRoute: account.route } : {}),
        ...(account.rcsAgentId ? { rcsAgentId: account.rcsAgentId } : {}),
      },
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
    },
    { upsert: true, new: true },
  );

  const base = siteUrl(req);
  const pathPrefix = `/api/webhooks/sms/${String(channel._id)}/`;
  const webhookUrl = `${base}${smsWebhookPath(String(channel._id), secret)}`;

  // Saiu da Zenvia (ou trocou de conta): as assinaturas antigas deste canal
  // param de apontar para cá.
  if (existing?.smsProvider === "zenvia" && storedToken && (account.provider !== "zenvia" || token !== storedToken)) {
    await zenviaUnsubscribe(storedToken, `${base}${pathPrefix}`);
  }

  // Zenvia: assina o webhook do canal com o token da loja. Em localhost a
  // Zenvia não alcança o endereço — fica para quando salvar em produção.
  const webhook: { registered: string[]; error: string | null; manual: boolean } = {
    registered: [],
    error: null,
    manual: account.provider === "comtele",
  };
  if (account.provider === "zenvia") {
    if (isLocalUrl(base)) {
      webhook.error = "Endereço local: salve de novo em produção para assinar o webhook na Zenvia.";
    } else {
      try {
        webhook.registered = await zenviaSubscribe(token, webhookUrl);
      } catch (err) {
        const why = (err instanceof Error ? err.message : String(err)).slice(0, 200);
        webhook.error = why;
        await WaChannel.updateOne(
          { _id: channel._id },
          { lastError: `Webhook não assinado na Zenvia: ${why}` },
        );
      }
    }
  }

  return NextResponse.json({ ok: true, id: String(channel._id), webhookUrl, webhook });
}
