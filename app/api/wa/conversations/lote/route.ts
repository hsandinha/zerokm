// Ações em lote na fila da Central: atribuir, pôr etiqueta, encerrar e
// devolver à IA várias conversas de uma vez. Mesmas regras da conversa
// sozinha (wa/lib/central-regras.ts), só que para a seleção. Tudo filtrado
// pela loja: um id de outra loja na lista é ignorado.

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireScope, scopeError, tenantFilter, type Scope } from "@wa/lib/scope";
import dbConnect from "@/lib/mongodb";
import { WaAiJob, WaConversation, WaMessage } from "@wa/models/wa";
import { WaEtiqueta } from "@wa/models/central";
import { WaNote } from "@wa/models/atendimento";
import { emitEvent } from "@wa/lib/webhooks";
import { equipeDoEscopo, iaDaConversa, nomeDe } from "@wa/lib/central";
import { idsDoLote, linhaDaAtribuicao, patchDeAtribuicao, tiraDaIa } from "@wa/lib/central-regras";
import { aposAcaoDaEquipe } from "@wa/lib/fila";

export const maxDuration = 60;

type Acao = "atribuir" | "etiqueta" | "encerrar" | "devolver";

export async function POST(req: NextRequest) {
  const inicio = Date.now();
  let user: Scope;
  try {
    user = await requireScope();
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
  const body = (await req.json().catch(() => ({}))) as {
    ids?: unknown;
    acao?: Acao;
    email?: string | null;
    etiquetaId?: string;
    motivo?: string | null;
  };
  const pedidos = idsDoLote(body.ids, (id) => mongoose.isValidObjectId(id));
  if (pedidos.length === 0) return NextResponse.json({ error: "Selecione ao menos uma conversa." }, { status: 400 });

  await dbConnect();
  const convs = await WaConversation.find({ _id: { $in: pedidos }, ...tenantFilter(user) })
    .select("_id status assignedTo")
    .lean();
  if (convs.length === 0) return NextResponse.json({ error: "Nenhuma conversa encontrada." }, { status: 404 });
  const ids = convs.map((c) => c._id);

  switch (body.acao) {
    case "atribuir": {
      const destino = body.email ? String(body.email).toLowerCase().trim() : null;
      const equipe = await equipeDoEscopo(user);
      const membro = destino ? equipe.find((m) => m.email === destino) : null;
      if (destino && !membro) return NextResponse.json({ error: "Essa pessoa não é da equipe." }, { status: 400 });
      const autor = nomeDe(equipe.find((m) => m.email === user.email) ?? { email: user.email, name: user.name });
      const motivo = body.motivo?.trim().slice(0, 500) || null;
      const agora = new Date();
      const saiuDaIa: mongoose.Types.ObjectId[] = [];
      for (const c of convs) {
        const patch = patchDeAtribuicao(c, destino, user.email, agora);
        await WaConversation.updateOne({ _id: c._id, ...tenantFilter(user) }, patch);
        if (tiraDaIa(patch.status)) saiuDaIa.push(c._id);
      }
      await WaMessage.insertMany(
        convs.map((c) => ({
          conversationId: c._id,
          direction: "outbound",
          sender: "system",
          content: linhaDaAtribuicao({
            autor,
            destino,
            quem: user.email,
            anterior: c.assignedTo,
            nomeDoDestino: nomeDe(membro),
            nomeDoAnterior: nomeDe(equipe.find((m) => m.email === c.assignedTo) ?? (c.assignedTo ? { email: c.assignedTo } : null)),
          }),
          mediaType: "evento",
          status: "sent",
        })),
      );
      if (motivo) {
        await WaNote.insertMany(
          convs.map((c) => ({
            conversationId: c._id,
            tenantId: user.tenantId,
            authorEmail: user.email,
            authorName: user.name ?? undefined,
            text: `Motivo da transferência: ${motivo}`,
          })),
        );
      }
      await cancelarIa(saiuDaIa, "cancelado: atribuir em lote");
      if (destino) await avisar("conversa.atribuida", ids, { by: user.email, assignedTo: destino });
      break;
    }
    case "etiqueta": {
      const etiquetaId = String(body.etiquetaId ?? "");
      const etiqueta = mongoose.isValidObjectId(etiquetaId)
        ? await WaEtiqueta.findOne({ _id: etiquetaId, ...tenantFilter(user) }).select("_id").lean()
        : null;
      if (!etiqueta) return NextResponse.json({ error: "Etiqueta não encontrada" }, { status: 404 });
      await WaConversation.updateMany(
        { _id: { $in: ids }, ...tenantFilter(user) },
        { $addToSet: { etiquetas: etiqueta._id } },
      );
      break;
    }
    case "encerrar": {
      await WaConversation.updateMany(
        { _id: { $in: ids }, ...tenantFilter(user) },
        { status: "closed", waitingSince: null },
      );
      await cancelarIa(ids, "cancelado: encerrar em lote");
      await avisar("conversa.resolvida", ids, { by: user.email });
      break;
    }
    case "devolver": {
      // Mesma regra do botão da conversa: sem IA que responda, devolver
      // deixaria os clientes falando sozinhos.
      const ia = await iaDaConversa(user);
      if (!ia.disponivel) {
        return NextResponse.json({ error: ia.motivo ?? "A IA não está disponível." }, { status: 409 });
      }
      await WaConversation.updateMany(
        { _id: { $in: ids }, ...tenantFilter(user) },
        { status: "ai_active", transferReason: null, assignedTo: null, waitingSince: null },
      );
      break;
    }
    default:
      return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  }

  // Fila da equipe, como no botão da conversa sozinha: registro do
  // atendimento, rodízio e o aviso para quem recebeu a transferência.
  if (body.acao !== "etiqueta") await depoisDaAcao(ids, user.email, inicio);

  return NextResponse.json({ ok: true, afetadas: convs.length });
}

/** Uma de cada vez: em paralelo, o rodízio disputaria a mesma pessoa e
 *  parte das conversas ficaria sem dono. Perto do limite da função, para: o
 *  que sobrar a varredura de 1 minuto registra (wa/lib/fila.ts varrerFila). */
async function depoisDaAcao(ids: mongoose.Types.ObjectId[], por: string, inicio: number) {
  for (const id of ids) {
    if (Date.now() - inicio > (maxDuration - 15) * 1000) break;
    await aposAcaoDaEquipe(String(id), por).catch((err) => console.error("[lote] fila da equipe:", err));
  }
}

async function cancelarIa(ids: mongoose.Types.ObjectId[], motivo: string) {
  if (ids.length === 0) return;
  await WaAiJob.updateMany({ conversationId: { $in: ids }, status: "pending" }, { status: "done", lastError: motivo });
}

/** Webhooks da loja, um por conversa (o mesmo evento do botão sozinho). */
async function avisar(
  evento: "conversa.atribuida" | "conversa.resolvida",
  ids: mongoose.Types.ObjectId[],
  dados: Record<string, unknown>,
) {
  for (const id of ids) await emitEvent(evento, dados, { conversationId: String(id) });
}
