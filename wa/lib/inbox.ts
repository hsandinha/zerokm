// Contadores da caixa de entrada — uma ida ao banco em vez de sete.
//
// A Central pesquisa isto a cada poucos segundos e a barra lateral a cada 30s;
// contar em uma agregação só é o que mantém esse polling barato.

import dbConnect from "@/lib/mongodb";
import { WaConversation } from "@wa/models/wa";
import { SLA_MINUTES } from "@wa/lib/stages";

export type InboxCounts = {
  total: number;
  waiting: number;
  ai: number;
  human: number;
  closed: number;
  mine: number;
  sla: number;
  stages: Record<string, number>;
};

export async function conversationCounts(
  email?: string | null,
  slaMinutes = SLA_MINUTES,
): Promise<InboxCounts> {
  await dbConnect();
  const slaCutoff = new Date(Date.now() - slaMinutes * 60_000);

  const [byStatus, byStage, mine, sla] = await Promise.all([
    WaConversation.aggregate<{ _id: string; n: number }>([
      { $group: { _id: "$status", n: { $sum: 1 } } },
    ]),
    WaConversation.aggregate<{ _id: string; n: number }>([
      { $group: { _id: "$stage", n: { $sum: 1 } } },
    ]),
    email
      ? WaConversation.countDocuments({ assignedTo: email, status: { $ne: "closed" } })
      : Promise.resolve(0),
    WaConversation.countDocuments({
      status: "waiting_human",
      waitingSince: { $lt: slaCutoff },
    }),
  ]);

  const status: Record<string, number> = {};
  for (const g of byStatus) status[String(g._id)] = g.n;
  const stages: Record<string, number> = {};
  for (const g of byStage) stages[String(g._id)] = g.n;

  return {
    total: Object.values(status).reduce((a, b) => a + b, 0),
    waiting: status.waiting_human ?? 0,
    ai: status.ai_active ?? 0,
    human: status.human_active ?? 0,
    closed: status.closed ?? 0,
    mine,
    sla,
    stages,
  };
}
