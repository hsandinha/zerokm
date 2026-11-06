// Worker da fila de IA — consumido pelo cron da Vercel (1/min) e acordado
// pelo webhook logo após um inbound. Claim atômico via findOneAndUpdate.

import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { WaAiJob, WaConversation, WaContact } from "@wa/models/wa";
import { runAiForConversation } from "@wa/lib/ai";
import { runStoreAiForConversation } from "@wa/lib/ai-loja";
import { sendAndLogText } from "@wa/lib/send";
import { LlmAuthError, LlmTransientError } from "@wa/lib/llm";
import { FALA_UM_INSTANTE, aposTurnoDaIa, transferenciaForaDoHorario } from "@wa/lib/fila";

export const maxDuration = 120;

const MAX_TRANSIENT_ATTEMPTS = 8;
const MAX_UNKNOWN_ATTEMPTS = 3;
const JOBS_PER_RUN = 10;
const SPACING_MS = 1500;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function failToHuman(conversationId: string, note: string) {
  await WaConversation.updateOne(
    { _id: conversationId },
    { status: "waiting_human", transferReason: "falha_ia", waitingSince: new Date() },
  );
  const conv = await WaConversation.findById(conversationId);
  const contact = conv ? await WaContact.findById(conv.contactId) : null;
  // Loja fechada: o "um instante" prometeria alguém agora. No lugar dele vai
  // o aviso de quando a equipe volta (wa/lib/fila.ts).
  const fechada = await transferenciaForaDoHorario(conversationId).catch((err) => {
    console.error("[worker/ai] aviso fora do horário falhou", err);
    return false;
  });
  if (contact && !fechada) {
    await sendAndLogText({
      conversationId,
      to: contact.phone,
      text: FALA_UM_INSTANTE,
      sender: "system",
    }).catch(() => {});
  }
  console.error(`[worker/ai] conversa ${conversationId} → humano (${note})`);
  // Fila da equipe: distribui, avisa e, fora do horário, diz quando volta.
  await aposTurnoDaIa(conversationId, "ai_active").catch(() => {});
}

async function processJobs(): Promise<{ processed: number }> {
  await dbConnect();
  let processed = 0;

  for (let i = 0; i < JOBS_PER_RUN; i++) {
    const job = await WaAiJob.findOneAndUpdate(
      { status: "pending", runAfter: { $lte: new Date() } },
      { status: "processing", $inc: { attempts: 1 } },
      { new: true, sort: { runAfter: 1 } },
    );
    if (!job) break;

    try {
      // Conversa de loja tem o cérebro de venda de carro; sem loja, é a Vera.
      const own = await WaConversation.findById(job.conversationId).select("tenantId status").lean();
      if (own?.tenantId) await runStoreAiForConversation(job.conversationId.toString());
      else await runAiForConversation(job.conversationId.toString());
      // O turno passou a conversa para a equipe? Distribui, avisa e, fora do
      // horário da loja, diz ao cliente quando a equipe volta (wa/lib/fila.ts).
      await aposTurnoDaIa(job.conversationId.toString(), own?.status).catch((err) => {
        console.error("[worker/ai] fila da equipe falhou", err);
      });
      job.status = "done";
      await job.save();
      processed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      job.lastError = message.slice(0, 500);

      if (err instanceof LlmTransientError) {
        if (job.attempts >= MAX_TRANSIENT_ATTEMPTS) {
          job.status = "failed";
          await job.save();
          await failToHuman(job.conversationId.toString(), `transient esgotado: ${message}`);
        } else {
          const backoff = err.retryAfterMs ?? Math.min(2 ** job.attempts * 5000, 300_000);
          job.status = "pending";
          job.runAfter = new Date(Date.now() + backoff);
          await job.save();
        }
      } else if (err instanceof LlmAuthError) {
        job.status = "failed";
        await job.save();
        await failToHuman(job.conversationId.toString(), `auth: ${message}`);
      } else {
        if (job.attempts >= MAX_UNKNOWN_ATTEMPTS) {
          job.status = "failed";
          await job.save();
          await failToHuman(job.conversationId.toString(), `erro: ${message}`);
        } else {
          job.status = "pending";
          job.runAfter = new Date(Date.now() + 15_000);
          await job.save();
        }
      }
    }

    if (i < JOBS_PER_RUN - 1) await new Promise((r) => setTimeout(r, SPACING_MS));
  }

  return { processed };
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await processJobs());
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await processJobs());
}
