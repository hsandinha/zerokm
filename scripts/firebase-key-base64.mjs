// Prepara a FIREBASE_PRIVATE_KEY para colar na Vercel, em base64.
//
//   node scripts/firebase-key-base64.mjs              → copia para a área de transferência
//   node scripts/firebase-key-base64.mjs --verificar  → confere no Firebase antes de copiar
//   node scripts/firebase-key-base64.mjs --mostrar    → imprime no terminal (evite)
//
// Por que base64: o valor vira uma linha só de [A-Za-z0-9+/=], que nenhum
// shell, painel ou copiar-e-colar consegue estragar. Foi assim que a chave de
// produção virou 27 caracteres (só o cabeçalho "-----BEGIN PRIVATE KEY-----")
// e o cadastro da IA parou de funcionar.
//
// A chave NÃO é impressa por padrão: vai direto para a área de transferência.
// Sem dependências — Node 18+.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const verificar = args.includes("--verificar");
const mostrar = args.includes("--mostrar");

function lerEnvLocal(nome) {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const linha of raw.split("\n")) {
    if (!linha.startsWith(`${nome}=`)) continue;
    let v = linha.slice(nome.length + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    return v;
  }
  return "";
}

// Mesmas regras de lib/firebase-admin.ts.
function rewrapPem(flat) {
  const m = flat.match(/-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END \1-----/);
  if (!m) return flat;
  const linhas = m[2].replace(/\s+/g, "").match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${m[1]}-----\n${linhas.join("\n")}\n-----END ${m[1]}-----\n`;
}

function normalizar(raw) {
  if (!raw) return "";
  let key = raw.trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }
  if (!key.includes("BEGIN")) {
    try {
      const d = Buffer.from(key, "base64").toString("utf8");
      if (d.includes("BEGIN")) key = d.trim();
    } catch {
      /* não era base64 */
    }
  }
  key = key
    .replace(/\\\\n/g, "\\n")
    .replace(/\\r\\n|\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\\\n/g, "\n");
  if (!key.includes("\n")) key = rewrapPem(key);
  return key;
}

const pem = normalizar(lerEnvLocal("FIREBASE_PRIVATE_KEY"));
const cabecalhoOk = pem.startsWith("-----BEGIN PRIVATE KEY-----");
const rodapeOk = pem.trim().endsWith("-----END PRIVATE KEY-----");

console.log(`chave no .env.local: ${pem.length} caracteres, ${pem.trim().split("\n").length} linhas`);
console.log(`cabeçalho: ${cabecalhoOk ? "ok" : "FALTANDO"} · rodapé: ${rodapeOk ? "ok" : "FALTANDO"}`);

// Uma chave real tem ~1700 caracteres. Publicar um valor curto foi o que
// quebrou a produção da última vez — melhor abortar do que repetir.
if (!cabecalhoOk || !rodapeOk || pem.length < 1000) {
  console.error("\nABORTADO: o .env.local não tem uma chave válida.");
  console.error("Gere outra em console.firebase.google.com → zerokm-25594 → Contas de serviço.");
  process.exit(1);
}

if (verificar) {
  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getAuth } = await import("firebase-admin/auth");
  try {
    const app = initializeApp({
      credential: cert({
        projectId: lerEnvLocal("FIREBASE_PROJECT_ID"),
        clientEmail: lerEnvLocal("FIREBASE_CLIENT_EMAIL"),
        privateKey: pem,
      }),
    });
    // Leitura pura: nenhuma conta é criada nem alterada.
    await getAuth(app).listUsers(1);
    console.log("verificação: AUTENTICOU no Firebase ✓");
  } catch (err) {
    console.error("verificação: FALHOU —", err?.errorInfo?.code ?? err?.message);
    process.exit(1);
  }
}

const base64 = Buffer.from(pem, "utf8").toString("base64");

if (mostrar) {
  console.log("\n" + base64);
} else {
  try {
    execFileSync("pbcopy", { input: base64 });
    console.log(`\n✓ ${base64.length} caracteres copiados para a área de transferência.`);
  } catch {
    console.log("\n(não achei o pbcopy — rode com --mostrar para imprimir)");
    process.exit(1);
  }
}

console.log(`
Agora, no painel da Vercel (Settings → Environment Variables) do projeto
whatsappcnv:

  1. Add New → nome: FIREBASE_PRIVATE_KEY_BASE64
  2. Cole o valor (já está na área de transferência)
  3. Marque Production, Preview e Development → Save
  4. Redeploy

Não precisa mexer na FIREBASE_PRIVATE_KEY quebrada: a variável em base64 tem
precedência. E ninguém precisa rodar 'vercel env rm' — só adicionar.`);
