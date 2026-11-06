// Etapa do pipeline — lado do servidor.
//
// `advance` só anda para a frente e nunca sai de `ganho` (assinante que fechou,
// fechou). `set` é o movimento manual do kanban: vai para onde a pessoa
// arrastou. Os dois emitem `negocio.etapa_alterada` quando a etapa muda de fato.
// `moverParaColuna` é o movimento do quadro com colunas da loja: grava a
// coluna e a etapa que ela significa (wa/lib/stages.ts, `etapaAoMover`).
//
// Os três são a porta de entrada das colunas: depois de mudar, conferem se
// a coluna nova manda evento para a Meta (API de Conversões,
// wa/lib/conversoes-meta-servidor.ts). O registro é rápido e o envio sai
// depois da resposta; nada disso derruba a mudança.

import dbConnect from "@/lib/mongodb";
import { WaConversation } from "@wa/models/wa";
import { etapaAoMover, stageRank, type Stage } from "@wa/lib/stages";
import { emitEvent } from "@wa/lib/webhooks";
import { colunaPorId } from "@wa/lib/funil";
import { registrarEventoDaColuna } from "@wa/lib/conversoes-meta-servidor";

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
    await registrarEventoDaColuna({ conversationId, por: "auto" });
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

  // Pela etapa: o cartão vai para a coluna de sistema dela.
  await WaConversation.updateOne(
    { _id: conversationId },
    { stage, stageId: null, stageChangedAt: new Date() },
  );
  await emitEvent(
    "negocio.etapa_alterada",
    { from: before.stage, to: stage, by },
    { conversationId },
  );
  await registrarEventoDaColuna({ conversationId, por: by });
}

/** Põe o cartão numa coluna do funil do dono da conversa. */
export async function moverParaColuna(
  conversationId: string,
  colunaId: string,
  by = "manual",
): Promise<{ stage: Stage }> {
  await dbConnect();
  const before = await WaConversation.findById(conversationId).select("stage stageId tenantId").lean();
  if (!before) throw Object.assign(new Error("Conversa não encontrada"), { status: 404 });
  const coluna = await colunaPorId(before.tenantId ?? null, colunaId);
  const stage = etapaAoMover(coluna, before.stage);
  if (String(before.stageId ?? "") === coluna.id && before.stage === stage) return { stage };

  // Trocar de coluna sem trocar de etapa (de "Vendido" para outra coluna de
  // venda) não reabre a contagem: a venda de outubro não vira venda do mês.
  await WaConversation.updateOne(
    { _id: conversationId },
    before.stage !== stage
      ? { stage, stageId: coluna.id, stageChangedAt: new Date() }
      : { stageId: coluna.id },
  );
  if (before.stage !== stage) {
    await emitEvent(
      "negocio.etapa_alterada",
      { from: before.stage, to: stage, by, coluna: coluna.name },
      { conversationId },
    );
  }
  // Também sem trocar de etapa: a coluna nova (de "Em atendimento" para
  // "Lead quente") pode ter evento próprio.
  await registrarEventoDaColuna({ conversationId, por: by });
  return { stage };
}
