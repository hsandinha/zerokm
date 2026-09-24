// Conecta o número da CNV na Cloud API: valida o token, identifica o app,
// configura o webhook do app, inscreve o app no WABA e registra o número.
//
//   node scripts/meta-connect.mjs                        → diagnóstico (não altera nada)
//   node scripts/meta-connect.mjs --webhook=https://…/api/webhooks/meta
//   node scripts/meta-connect.mjs --subscribe            → inscreve o app no WABA
//   node scripts/meta-connect.mjs --register --pin=123456
//
// Lê as credenciais do .env.local (META_TOKEN, META_PHONE_NUMBER_ID,
// META_WABA_ID, META_APP_SECRET, META_BUSINESS_ID). Sem dependências — Node 18+.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const GRAPH = "https://graph.facebook.com/v21.0";

function loadEnv() {
  const env = {};
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].trim();
    }
  } catch {
    /* sem .env.local — cai no process.env */
  }
  return { ...env, ...process.env };
}

// Chamada autenticada por Bearer (token do System User).
async function graph(token, path, init) {
  const res = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = body?.error ?? {};
    throw new Error(`${res.status} ${e.message ?? "erro"} (code ${e.code ?? "?"})`);
  }
  return body;
}

// Chamada com app access token (`{app_id}|{app_secret}`) — exigido pelo
// endpoint /subscriptions, que o token do System User não acessa.
async function graphAsApp(appId, appSecret, path, init) {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${GRAPH}${path}${sep}access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`;
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = body?.error ?? {};
    throw new Error(`${res.status} ${e.message ?? "erro"} (code ${e.code ?? "?"})`);
  }
  return body;
}

const ok = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => console.log(`  ✗ ${m}`);
const warn = (m) => console.log(`  ! ${m}`);
const step = (m) => console.log(`\n▸ ${m}`);

async function main() {
  const env = loadEnv();
  const args = process.argv.slice(2);
  const wantSubscribe = args.includes("--subscribe");
  const wantRegister = args.includes("--register");
  const pin = args.find((a) => a.startsWith("--pin="))?.slice("--pin=".length);
  const webhookUrl = args.find((a) => a.startsWith("--webhook="))?.slice("--webhook=".length);

  const token = env.META_TOKEN;
  const phoneNumberId = env.META_PHONE_NUMBER_ID;
  const appSecret = env.META_APP_SECRET;
  const verifyToken = env.META_VERIFY_TOKEN;
  const businessId = env.META_BUSINESS_ID;
  let wabaId = env.META_WABA_ID;

  if (!token) {
    fail("META_TOKEN vazio no .env.local — gere o token do System User primeiro.");
    process.exit(1);
  }
  if (!phoneNumberId) {
    fail("META_PHONE_NUMBER_ID vazio no .env.local.");
    process.exit(1);
  }

  // 1. Quem é o token: app, tipo, validade e escopos.
  step("Token");
  const dbg = await graph(token, `/debug_token?input_token=${encodeURIComponent(token)}`);
  const info = dbg.data ?? {};
  const appId = String(info.app_id ?? "");
  ok(`app "${info.application}" (id ${appId}) · tipo ${info.type}`);
  ok(`expira: ${info.expires_at === 0 ? "NUNCA (permanente)" : new Date(info.expires_at * 1000).toISOString()}`);
  ok(`escopos: ${(info.scopes ?? []).join(", ")}`);
  if (!info.is_valid) {
    fail("token inválido.");
    process.exit(1);
  }
  if (wabaId && wabaId === appId) {
    warn(`META_WABA_ID (${wabaId}) é igual ao APP ID — isso é o app, não o WABA.`);
    warn("Pegue o WABA ID em WhatsApp Manager → Configurações da conta.");
    wabaId = "";
  }

  // 2. O número existe e o token enxerga ele?
  step("Número de telefone");
  const phone = await graph(
    token,
    `/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,code_verification_status,platform_type`,
  );
  ok(`${phone.display_phone_number} — ${phone.verified_name}`);
  ok(`qualidade: ${phone.quality_rating ?? "n/d"} · verificação: ${phone.code_verification_status ?? "n/d"}`);
  ok(`plataforma: ${phone.platform_type ?? "n/d"}`);

  // 3. Webhook do app (precisa do app secret — o token do SU não serve aqui).
  if (appSecret) {
    step("Webhook do app");
    const subs = await graphAsApp(appId, appSecret, `/${appId}/subscriptions`);
    const current = (subs.data ?? []).find((s) => s.object === "whatsapp_business_account");
    if (current) {
      ok(`callback: ${current.callback_url}`);
      ok(`campos: ${(current.fields ?? []).map((f) => f.name).join(", ")}`);
    } else {
      fail("nenhuma inscrição em whatsapp_business_account.");
    }
    if (webhookUrl) {
      if (!verifyToken) {
        fail("META_VERIFY_TOKEN vazio — necessário para a Meta validar o callback.");
        process.exit(1);
      }
      const params = new URLSearchParams({
        object: "whatsapp_business_account",
        callback_url: webhookUrl,
        verify_token: verifyToken,
        fields: "messages",
      });
      const r = await graphAsApp(appId, appSecret, `/${appId}/subscriptions?${params}`, {
        method: "POST",
      });
      ok(`webhook configurado em ${webhookUrl} → ${JSON.stringify(r)}`);
    } else if (!current) {
      console.log("  → rode com --webhook=https://SEU_DOMINIO/api/webhooks/meta");
    }
  } else {
    step("Webhook do app");
    warn("META_APP_SECRET vazio — não dá para ler nem configurar o webhook.");
  }

  // 4. WABA: do env, senão via business (exige business_management no token).
  step("WhatsApp Business Account");
  if (!wabaId && businessId) {
    const owned = await graph(token, `/${businessId}/owned_whatsapp_business_accounts`).catch((e) => {
      fail(`não deu para listar os WABAs do business: ${e.message}`);
      return null;
    });
    const list = owned?.data ?? [];
    if (list.length === 1) {
      wabaId = list[0].id;
      ok(`descoberto automaticamente: ${wabaId} (${list[0].name ?? "sem nome"})`);
    } else if (list.length > 1) {
      console.log("  Vários WABAs neste business — escolha e coloque em META_WABA_ID:");
      for (const w of list) console.log(`    - ${w.id}  ${w.name ?? ""}`);
    }
  }
  if (!wabaId) {
    fail("META_WABA_ID desconhecido — sem ele o app não fica inscrito no WABA");
    fail("e o webhook NÃO recebe mensagens. Pegue em WhatsApp Manager →");
    fail("Configurações da conta → 'Identificação da conta do WhatsApp Business'.");
    process.exit(1);
  }
  const waba = await graph(token, `/${wabaId}?fields=name`);
  ok(`WABA ${wabaId} — ${waba.name ?? "sem nome"}`);

  // 5. Inscrição do app no WABA (sem isso não chega mensagem nenhuma).
  step("Inscrição do app no WABA");
  const appsOnWaba = await graph(token, `/${wabaId}/subscribed_apps`).catch((e) => {
    fail(`não deu para ler: ${e.message}`);
    return null;
  });
  const apps = appsOnWaba?.data ?? [];
  if (apps.length === 0) {
    fail("nenhum app inscrito neste WABA.");
  }
  for (const a of apps) {
    ok(`inscrito: ${a.whatsapp_business_api_data?.name ?? "?"} (${a.whatsapp_business_api_data?.id ?? "?"})`);
  }
  if (wantSubscribe) {
    const r = await graph(token, `/${wabaId}/subscribed_apps`, { method: "POST" });
    ok(`inscrição solicitada: ${JSON.stringify(r)}`);
  } else if (apps.length === 0) {
    console.log("  → rode com --subscribe");
  }

  // 6. Registro do número na Cloud API (só necessário uma vez).
  if (wantRegister) {
    step("Registro do número na Cloud API");
    if (!pin || !/^\d{6}$/.test(pin)) {
      fail("informe o PIN de 6 dígitos: --pin=123456");
      process.exit(1);
    }
    const r = await graph(token, `/${phoneNumberId}/register`, {
      method: "POST",
      body: JSON.stringify({ messaging_product: "whatsapp", pin }),
    });
    ok(`registrado: ${JSON.stringify(r)}`);
  }

  step("Resumo para o .env.local / Vercel");
  console.log(`  META_PHONE_NUMBER_ID=${phoneNumberId}`);
  console.log(`  META_WABA_ID=${wabaId}`);
  console.log(`  META_APP_SECRET=${appSecret ? "(preenchido)" : "(VAZIO)"}`);
  console.log(`  META_VERIFY_TOKEN=${verifyToken ?? "(vazio)"}`);
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});
