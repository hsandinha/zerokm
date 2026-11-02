// Estoque que a IA da loja vende — sempre o da própria zerokm, nunca uma
// tabela paralela (diferença em relação ao Chatrun, que tinha `itens`).
//
//   Concessionária → o 0km dela (DealerVehiclePrice) e o repasse dela;
//   Lojista        → o estoque local dele (RepasseVehicle com lojistaId) e,
//                    com "vende estoque CNV" ligado e assinatura da zerokm em
//                    dia, todo o 0km da rede e o repasse anunciado — com a
//                    MARGEM do lojista já aplicada, como na vitrine.
//
// O cliente final nunca vê de qual concessionária é o carro nem o preço de
// custo: a IA recebe só o que pode dizer.

import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import DealerVehiclePrice from "@/models/DealerVehiclePrice";
import VehicleVariation from "@/models/VehicleVariation";
import RepasseVehicle from "@/models/RepasseVehicle";
import Concessionaria from "@/models/Concessionaria";
import User from "@/models/User";
import { filtroPlanoRepasseAtivo } from "@/lib/utils/planoRepasse";
import { acessoBloqueado } from "@/lib/utils/acessoAssinatura";
import type { IWaStore } from "@wa/models/store";

export type Origem = "0km" | "usado" | "local";

export type Oferta = {
  /** Código curto que a IA usa para se referir ao carro (registrar interesse). */
  ref: string;
  origem: Origem;
  titulo: string;
  ano: string;
  km: number | null;
  cores: string[];
  combustivel: string | null;
  cambio: string | null;
  preco: number;
  /** 0km da rede: prazo de entrega em dias, quando a concessionária informou. */
  prazoDias: number | null;
  opcionais: string | null;
  observacoes: string | null;
};

export type FiltrosEstoque = {
  /** Texto livre: "onix automático", "hilux diesel". */
  termo?: string;
  precoMin?: number;
  precoMax?: number;
  anoMin?: number;
  tipo?: "0km" | "usado" | "todos";
};

type Margem = { mode: "percent" | "fixed"; percentValue: number; fixedValue: number };

function aplicarMargem(preco: number, m: Margem | null): number {
  if (!m) return preco;
  const v = m.mode === "fixed" ? preco + (m.fixedValue || 0) : preco * (1 + (m.percentValue || 0) / 100);
  return Math.round(v);
}

function escapar(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Cada palavra do termo precisa aparecer em algum dos campos. */
function filtroPorTermo(termo: string | undefined, campos: string[]): Record<string, unknown> {
  const palavras = (termo ?? "")
    .toLowerCase()
    .split(/\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2)
    .slice(0, 6);
  if (!palavras.length) return {};
  return {
    $and: palavras.map((p) => ({
      $or: campos.map((c) => ({ [c]: { $regex: escapar(p), $options: "i" } })),
    })),
  };
}

const refDe = (prefixo: string, id: unknown) => `${prefixo}${String(id).slice(-6).toUpperCase()}`;

/** O lojista só revende a rede com a assinatura da zerokm em dia (ou no teste). */
async function lojistaComAcessoARede(ownerUserId: unknown): Promise<{ ok: boolean; margem: Margem | null }> {
  const u = await User.findById(ownerUserId)
    .select("subscription freeTrialExpiresAt marginConfig")
    .lean<{
      subscription?: { status?: string; expiresAt?: Date };
      freeTrialExpiresAt?: Date;
      marginConfig?: Margem;
    }>();
  if (!u) return { ok: false, margem: null };
  const assinante =
    u.subscription?.status === "active" && !acessoBloqueado(u.subscription.expiresAt ?? null);
  const teste = !!u.freeTrialExpiresAt && new Date(u.freeTrialExpiresAt).getTime() > Date.now();
  return { ok: assinante || teste, margem: u.marginConfig ?? null };
}

async function buscar0km(
  filtroLoja: Record<string, unknown>,
  filtros: FiltrosEstoque,
  margem: Margem | null,
  limite: number,
): Promise<Oferta[]> {
  const pipeline: mongoose.PipelineStage[] = [
    { $match: { ativo: true, preco: { $gt: 0 }, ...filtroLoja } },
    {
      $lookup: {
        from: VehicleVariation.collection.name,
        localField: "variationId",
        foreignField: "_id",
        as: "v",
      },
    },
    { $unwind: "$v" },
    { $match: { "v.ativo": { $ne: false }, ...filtroPorTermo(filtros.termo, ["v.marca", "v.modelo", "v.descricaoFipe", "v.transmissao", "v.combustivel", "v.carroceria"]) } },
    ...(filtros.anoMin ? [{ $match: { "v.anoModelo": { $gte: filtros.anoMin } } }] : []),
    { $sort: { preco: 1 } },
    // A mesma versão em várias concessionárias vira uma oferta só (a mais barata).
    { $group: { _id: "$variationId", doc: { $first: "$$ROOT" } } },
    { $replaceRoot: { newRoot: "$doc" } },
    { $sort: { preco: 1 } },
    { $limit: 60 },
  ];
  const docs = await DealerVehiclePrice.aggregate(pipeline);
  return docs
    .map((d) => {
      const v = d.v ?? {};
      return {
        ref: refDe("N", d._id),
        origem: "0km" as const,
        titulo: [v.marca, v.modelo, v.descricaoFipe && v.descricaoFipe !== v.modelo ? v.descricaoFipe : null]
          .filter(Boolean)
          .join(" "),
        ano: v.ano || (v.anoModelo ? String(v.anoModelo) : ""),
        km: 0,
        cores: (d.coresDisponiveis?.length ? d.coresDisponiveis : v.cor ? [v.cor] : []) as string[],
        combustivel: v.combustivel ?? null,
        cambio: v.transmissao ?? null,
        preco: aplicarMargem(Number(d.preco), margem),
        prazoDias: typeof d.prazo === "number" ? d.prazo : null,
        opcionais: v.opcionais ?? null,
        observacoes: null,
      };
    })
    .filter((o) => dentroDoPreco(o.preco, filtros))
    .slice(0, limite);
}

async function buscarUsados(
  filtroLoja: Record<string, unknown>,
  origem: "usado" | "local",
  filtros: FiltrosEstoque,
  margem: Margem | null,
  limite: number,
): Promise<Oferta[]> {
  const docs = await RepasseVehicle.find({
    ativo: true,
    ...filtroLoja,
    ...filtroPorTermo(filtros.termo, ["marca", "modelo", "descricaoFipe", "transmissao", "combustivel", "cor"]),
    ...(filtros.anoMin ? { anoModelo: { $gte: filtros.anoMin } } : {}),
  })
    .sort({ preco: 1 })
    .limit(60)
    .lean();
  return docs
    .map((d) => ({
      ref: refDe(origem === "local" ? "L" : "U", d._id),
      origem,
      titulo: [d.marca, d.modelo].filter(Boolean).join(" "),
      ano: d.ano || String(d.anoModelo ?? ""),
      km: typeof d.km === "number" ? d.km : null,
      cores: d.cor ? [d.cor] : [],
      combustivel: d.combustivel ?? null,
      cambio: d.transmissao ?? null,
      // Margem só no que o lojista revende da rede; o local já tem o preço dele.
      preco: origem === "local" ? Number(d.preco) : aplicarMargem(Number(d.preco), margem),
      prazoDias: null,
      opcionais: d.opcionais ?? null,
      observacoes: origem === "local" ? (d.observacoes ?? null) : null,
    }))
    .filter((o) => dentroDoPreco(o.preco, filtros))
    .slice(0, limite);
}

function dentroDoPreco(preco: number, f: FiltrosEstoque): boolean {
  if (f.precoMin && preco < f.precoMin) return false;
  if (f.precoMax && preco > f.precoMax) return false;
  return true;
}

/** Busca no estoque que ESTA loja pode vender. */
export async function buscarEstoque(
  store: Pick<IWaStore, "kind" | "concessionariaId" | "ownerUserId" | "ai">,
  filtros: FiltrosEstoque,
  limite = 8,
): Promise<{ ofertas: Oferta[]; vendeRede: boolean }> {
  await dbConnect();
  const tipo = filtros.tipo ?? "todos";
  const quer0km = tipo !== "usado";
  const querUsado = tipo !== "0km";
  const listas: Promise<Oferta[]>[] = [];

  if (store.kind === "concessionaria" && store.concessionariaId) {
    const daLoja = { concessionariaId: store.concessionariaId };
    if (quer0km) listas.push(buscar0km(daLoja, filtros, null, limite));
    if (querUsado) listas.push(buscarUsados(daLoja, "usado", filtros, null, limite));
    const ofertas = (await Promise.all(listas)).flat().sort((a, b) => a.preco - b.preco);
    return { ofertas: ofertas.slice(0, limite), vendeRede: false };
  }

  if (store.kind === "lojista" && store.ownerUserId) {
    if (querUsado) {
      listas.push(buscarUsados({ lojistaId: store.ownerUserId }, "local", filtros, null, limite));
    }
    const acesso = store.ai?.vendeEstoqueCnv
      ? await lojistaComAcessoARede(store.ownerUserId)
      : { ok: false, margem: null };
    if (acesso.ok) {
      if (quer0km) listas.push(buscar0km({}, filtros, acesso.margem, limite));
      if (querUsado) {
        // Repasse só de concessionária com o plano de repasse ativo, como na vitrine.
        const comPlano = await Concessionaria.find(filtroPlanoRepasseAtivo()).distinct("_id");
        listas.push(
          buscarUsados({ concessionariaId: { $in: comPlano } }, "usado", filtros, acesso.margem, limite),
        );
      }
    }
    // O estoque local vem primeiro: é o carro que está no pátio da loja.
    const [local = [], ...rede] = await Promise.all(listas);
    const ofertas = [...local, ...rede.flat().sort((a, b) => a.preco - b.preco)];
    return { ofertas: ofertas.slice(0, limite), vendeRede: acesso.ok };
  }

  return { ofertas: [], vendeRede: false };
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Uma linha por oferta, no formato que vai para a IA. */
export function ofertasParaIa(ofertas: Oferta[]): string {
  if (!ofertas.length) return "Nenhum veículo encontrado com esses critérios.";
  return ofertas
    .map((o) => {
      const partes = [
        `[${o.ref}] ${o.titulo} ${o.ano}`.trim(),
        o.origem === "0km" ? "0km" : o.km != null ? `${o.km.toLocaleString("pt-BR")} km` : null,
        o.cambio,
        o.combustivel,
        o.cores.length ? `cores: ${o.cores.slice(0, 4).join(", ")}` : null,
        BRL.format(o.preco),
        o.origem === "0km" && o.prazoDias ? `entrega em ~${o.prazoDias} dias` : null,
        o.origem === "local" ? "no pátio da loja" : null,
        o.observacoes ? `obs: ${o.observacoes.slice(0, 120)}` : null,
      ];
      return `- ${partes.filter(Boolean).join(" · ")}`;
    })
    .join("\n");
}
