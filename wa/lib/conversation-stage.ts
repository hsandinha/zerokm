// Etapa do pipeline — lado do servidor.
//
// `advance` só anda para a frente e nunca sai de `ganho` (assinante que fechou,
// fechou). `set` é o movimento manual do kanban: vai para onde a pessoa
// arrastou. Os dois emitem `negocio.etapa_alterada` quando a etapa muda de fato.

import dbConnect from "@/lib/mongodb";
import { WaConversation } from "@wa/models/wa";
import { stageRank, type Stage } from "@wa/lib/stages";
import { emitEvent } from "@wa/lib/webhooks";

export async function advanceConversationStage(
  conversationId: string,
  stage: Stage,
): Promise<void> {
  try {
    await dbConnect();
    const before = await WaConversation.findById(conversationId).select("stage").lean();
    if (!before) return;
    if (before.stage === "ganho" || stageRank(before.stage) >= stageRank(stage)) return;

    await WaConversation.updateOne(
      { _id: conversationId, stage: before.stage },
      { stage, stageChangedAt: new Date() },
    );
    await emitEvent(
      "negocio.etapa_alterada",
      { from: before.stage, to: stage, by: "auto" },
      { conversationId },
    );
  } catch (err) {
    // A etapa é informação de acompanhamento; nunca derruba o atendimento.
    console.error(
      `[stage] falha ao avançar ${conversationId} → ${stage}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

export async function setConversationStage(
  conversationId: string,
  stage: Stage,
  by = "manual",
): Promise<void> {
  await dbConnect();
  const before = await WaConversation.findById(conversationId).select("stage").lean();
  if (!before) throw Object.assign(new Error("Conversa não encontrada"), { status: 404 });
  if (before.stage === stage) return;

  await WaConversation.updateOne({ _id: conversationId }, { stage, stageChangedAt: new Date() });
  await emitEvent(
    "negocio.etapa_alterada",
    { from: before.stage, to: stage, by },
    { conversationId },
  );
}
