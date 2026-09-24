// Submete e inspeciona templates de mensagem do WABA.
//
//   node scripts/meta-template.mjs                       → lista os templates e o status de cada um
//   node scripts/meta-template.mjs --show=<nome>         → mostra o rascunho que seria enviado
//   node scripts/meta-template.mjs --submit=<nome>       → envia para aprovação da Meta
//   node scripts/meta-template.mjs --delete=<nome>       → remove o template
//
// Os rascunhos ficam em DRAFTS, abaixo. Lê as credenciais do .env.local
// (META_TOKEN, META_WABA_ID). Sem dependências — Node 18+.

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

// ── Rascunhos ────────────────────────────────────────────────
// Os números do estoque são variáveis de propósito: mudam todo dia, e template
// aprovado com número fixo no corpo teria que passar por nova revisão a cada
// atualização. O disparo preenche {{2}}, {{3}} e {{4}} com o dado do momento.
const DRAFTS = {
  cnv_prospeccao_lojista_v1: {
    name: "cnv_prospeccao_lojista_v1",
    language: "pt_BR",
    category: "MARKETING",
    components: [
      {
        type: "BODY",
        text:
          "Bom dia, {{1}}! 👋\n\n" +
          "Aqui é a Vera, da CNV — Comércio Nacional de Veículos 0km.\n\n" +
          "Sua loja pode negociar 0km direto com a concessionária, sem mesa e sem comissão de intermediário. 🤝\n\n" +
          "Hoje são {{2}} veículos 0km disponíveis, de {{3}} concessionárias parceiras em {{4}} estados. " +
          "Você consulta preço, prazo e disponibilidade em tempo real e fecha direto com quem tem o carro.\n\n" +
          "Quer entender como funciona na prática? Posso liberar seu acesso de teste agora mesmo. 💰",
        example: { body_text: [["Bruno", "8.000", "400", "14"]] },
      },
      {
        type: "BUTTONS",
        buttons: [
          { type: "QUICK_REPLY", text: "Quero conhecer" },
          { type: "QUICK_REPLY", text: "Parar promoções" },
        ],
      },
    ],
  },

  cnv_prospeccao_lojista_curto_v1: {
    name: "cnv_prospeccao_lojista_curto_v1",
    language: "pt_BR",
    category: "MARKETING",
    components: [
      {
        type: "BODY",
        text:
          "Olá, {{1}}! Aqui é a Vera, da CNV. 👋\n\n" +
          "Sua loja compra 0km direto da concessionária, sem intermediário e sem comissão. " +
          "São {{2}} veículos de {{3}} concessionárias, com preço e prazo em tempo real.\n\n" +
          "Posso te mostrar como funciona?",
        example: { body_text: [["Bruno", "8.000", "400"]] },
      },
      {
        type: "BUTTONS",
        buttons: [
          { type: "QUICK_REPLY", text: "Quero conhecer" },
          { type: "QUICK_REPLY", text: "Parar promoções" },
        ],
      },
    ],
  },
};

// A Meta rejeita variável na abertura ou no fechamento do corpo, e exige um
// exemplo por variável. Barrar aqui evita queimar ciclo de revisão.
function validar(draft) {
  const body = draft.components.find((c) => c.type === "BODY");
  if (!body) throw new Error("rascunho sem componente BODY");

  const vars = [...new Set(body.text.match(/\{\{(\d+)\}\}/g) ?? [])];
  const exemplos = body.example?.body_text?.[0] ?? [];
  if (vars.length !== exemplos.length) {
    throw new Error(`${vars.length} variáveis no corpo e ${exemplos.length} exemplos — precisam bater`);
  }
  if (/^\s*\{\{\d+\}\}/.test(body.text)) throw new Error("o corpo não pode começar com variável");
  if (/\{\{\d+\}\}\s*$/.test(body.text)) throw new Error("o corpo não pode terminar com variável");
  if (body.text.length > 1024) throw new Error(`corpo com ${body.text.length} caracteres (máx. 1024)`);
  return { vars: vars.length, chars: body.text.length };
}

function preview(draft) {
  const body = draft.components.find((c) => c.type === "BODY");
  const botoes = draft.components.find((c) => c.type === "BUTTONS");
  console.log(`\n── ${draft.name} (${draft.language}, ${draft.category}) ──\n`);
  console.log(body.text);
  if (botoes) console.log(`\n[ ${botoes.buttons.map((b) => b.text).join(" ] [ ")} ]`);
  const info = validar(draft);
  console.log(`\n${info.chars} caracteres, ${info.vars} variáveis. Exemplos: ${body.example.body_text[0].join(" | ")}`);
}

// ── Main ─────────────────────────────────────────────────────
const env = loadEnv();
const token = env.META_TOKEN;
const wabaId = env.META_WABA_ID;
if (!token || !wabaId) {
  console.error("Faltam META_TOKEN e/ou META_WABA_ID no .env.local");
  process.exit(1);
}

const arg = (nome) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.split("=")[1];
const mostrar = arg("show");
const submeter = arg("submit");
const remover = arg("delete");

if (mostrar) {
  const draft = DRAFTS[mostrar];
  if (!draft) { console.error(`Rascunho "${mostrar}" não existe. Disponíveis: ${Object.keys(DRAFTS).join(", ")}`); process.exit(1); }
  preview(draft);
} else if (submeter) {
  const draft = DRAFTS[submeter];
  if (!draft) { console.error(`Rascunho "${submeter}" não existe. Disponíveis: ${Object.keys(DRAFTS).join(", ")}`); process.exit(1); }
  preview(draft);
  console.log("\nEnviando para aprovação…");
  const r = await graph(token, `/${wabaId}/message_templates`, {
    method: "POST",
    body: JSON.stringify(draft),
  });
  console.log(`\n✅ Enviado. id=${r.id} status=${r.status} categoria=${r.category ?? draft.category}`);
  console.log("A revisão é assíncrona; use este script sem argumentos para acompanhar o status.");
} else if (remover) {
  await graph(token, `/${wabaId}/message_templates?name=${encodeURIComponent(remover)}`, { method: "DELETE" });
  console.log(`Template "${remover}" removido.`);
} else {
  const r = await graph(token, `/${wabaId}/message_templates?fields=name,status,language,category,quality_score,rejected_reason&limit=100`);
  if (!r.data?.length) {
    console.log("\nNenhum template no WABA.");
  } else {
    console.log(`\nTemplates no WABA: ${r.data.length}\n`);
    for (const t of r.data) {
      const motivo = t.rejected_reason && t.rejected_reason !== "NONE" ? ` — motivo: ${t.rejected_reason}` : "";
      console.log(`  [${t.status}] ${t.name} (${t.language}, ${t.category})${motivo}`);
    }
  }
  console.log(`\nRascunhos locais: ${Object.keys(DRAFTS).join(", ")}`);
}
