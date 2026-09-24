// Preenche a etapa do funil das conversas criadas ANTES do pipeline existir.
//
//   node scripts/backfill-stages.mjs           → só mostra o que faria
//   node scripts/backfill-stages.mjs --aplicar → grava
//
// Sem isto o kanban abre vazio: `stage` tem default no schema, mas default só
// vale para documento novo — as conversas antigas não têm o campo, e por isso
// não caem em coluna nenhuma.
//
// A etapa é deduzida do que já está no banco, na mesma ordem do funil:
//   assinatura ativa            → ganho
//   tem cadastro na zerokm      → cadastro
//   pediu para sair / sem interesse / encerrada sem resposta → perdido
//   já respondeu alguma vez     → conversa
//   só recebeu o disparo        → abordado

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

for (const linha of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  process.env[m[1]] = v;
}

const aplicar = process.argv.includes("--aplicar");
const mongoose = (await import("mongoose")).default;
await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
const db = mongoose.connection.db;

const conversas = db.collection("wa_conversations");
const contatos = db.collection("wa_contacts");
const usuarios = db.collection("users");

const semEtapa = await conversas.find({ stage: { $exists: false } }).toArray();
console.log(`conversas sem etapa: ${semEtapa.length}${aplicar ? "" : " (simulação)"}\n`);

const agora = Date.now();
const contagem = {};
const operacoes = [];

for (const c of semEtapa) {
  const contato = await contatos.findOne({ _id: c.contactId });
  // Mesma busca que a IA faz a cada mensagem (getFunnelStatus): o vínculo pode
  // não estar no contato — quem se cadastrou pelo site depois da conversa só é
  // encontrado pelo telefone ou pelo e-mail.
  const digitos = (contato?.phone ?? "").replace(/\D/g, "");
  const ou = [];
  if (contato?.userId && mongoose.isValidObjectId(contato.userId)) {
    ou.push({ _id: new mongoose.Types.ObjectId(contato.userId) });
  }
  if (contato?.firebaseUid) ou.push({ firebaseUid: contato.firebaseUid });
  if (contato?.email) ou.push({ email: contato.email.toLowerCase() });
  if (digitos) ou.push({ phoneNumber: digitos });
  if (digitos.startsWith("55")) ou.push({ phoneNumber: digitos.slice(2) });
  const usuario = ou.length > 0 ? await usuarios.findOne({ $or: ou }) : null;

  const assinaturaAtiva =
    usuario?.subscription?.status === "active" &&
    (!usuario.subscription.expiresAt || new Date(usuario.subscription.expiresAt).getTime() > agora);

  let stage;
  if (assinaturaAtiva) stage = "ganho";
  else if (usuario) stage = "cadastro";
  else if (contato?.optOut || c.outcome === "opt_out" || c.outcome === "sem_interesse") stage = "perdido";
  else if (c.lastInboundAt) stage = "conversa";
  else stage = "abordado";

  contagem[stage] = (contagem[stage] ?? 0) + 1;
  operacoes.push({
    updateOne: {
      filter: { _id: c._id },
      update: {
        $set: {
          stage,
          // A data em que a conversa parou é a melhor aproximação de quando ela
          // chegou nessa etapa — pôr `now` aqui faria tudo parecer recente.
          stageChangedAt: c.lastMessageAt ?? c.createdAt ?? new Date(),
          // O SLA só conta para quem está mesmo esperando alguém.
          waitingSince: c.status === "waiting_human" ? (c.lastMessageAt ?? c.updatedAt ?? null) : null,
        },
      },
    },
  });
}

for (const [stage, n] of Object.entries(contagem).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${stage.padEnd(12)} ${n}`);
}

if (!aplicar) {
  console.log("\nNada foi gravado. Rode com --aplicar para valer.");
} else if (operacoes.length > 0) {
  const r = await conversas.bulkWrite(operacoes);
  console.log(`\n✓ ${r.modifiedCount} conversa(s) atualizadas.`);
  const restam = await conversas.countDocuments({ stage: { $exists: false } });
  console.log(`conversas ainda sem etapa: ${restam}`);
}

await mongoose.disconnect();
