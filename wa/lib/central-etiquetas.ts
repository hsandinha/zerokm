// Etiquetas da loja com a contagem de conversas: a barra lateral da Central e
// o seletor da conversa usam a mesma lista. Uma agregação só, pelo índice
// { tenantId, etiquetas }.

import { WaEtiqueta } from "@wa/models/central";
import { WaConversation } from "@wa/models/wa";
import type { Etiqueta } from "@wa/lib/etiquetas";

export async function etiquetasComContagem(tenantId: string | null): Promise<Etiqueta[]> {
  const lista = await WaEtiqueta.find({ tenantId }).sort({ nome: 1 }).select("nome cor").lean();
  if (lista.length === 0) return [];
  const contagem = await WaConversation.aggregate<{ _id: unknown; n: number }>([
    { $match: { tenantId, etiquetas: { $in: lista.map((e) => e._id) } } },
    { $unwind: "$etiquetas" },
    { $group: { _id: "$etiquetas", n: { $sum: 1 } } },
  ]);
  const porId = new Map(contagem.map((c) => [String(c._id), c.n]));
  return lista.map((e) => ({
    id: String(e._id),
    nome: e.nome,
    cor: e.cor,
    conversas: porId.get(String(e._id)) ?? 0,
  }));
}
