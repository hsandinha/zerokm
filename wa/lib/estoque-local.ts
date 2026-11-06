// Dono do estoque local (o lojista titular da loja de quem está operando) e o
// formato do carro do pátio para a tela. O estoque local mora na
// RepasseVehicle com `lojistaId` (ver o modelo); a ficha do pátio, a situação
// e o painel são de wa/lib/estoque-ficha.ts, e as fotos, de
// wa/lib/foto-estoque.ts.

import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import RepasseVehicle from "@/models/RepasseVehicle";
import { requireScope, requireScopeAdmin, type Scope } from "@wa/lib/scope";
import { getStore } from "@wa/lib/store";
import { linkDaFotoEstoque } from "@wa/lib/foto-estoque";
import { situacaoDe, type SituacaoCarro } from "@wa/lib/estoque-ficha";

export async function lojistaDoEscopo(
  admin: boolean,
): Promise<{ scope: Scope; lojistaId: mongoose.Types.ObjectId; tenantId: string }> {
  const scope = admin ? await requireScopeAdmin("estoque_local") : await requireScope("estoque_local");
  const store = await getStore(scope.tenantId);
  if (!store || store.kind !== "lojista" || !store.ownerUserId || !scope.tenantId) {
    throw Object.assign(new Error("Estoque local é só para lojistas"), { status: 404 });
  }
  return { scope, lojistaId: store.ownerUserId, tenantId: scope.tenantId };
}

/** Carro do pátio deste lojista (ativo). null = não é dele ou não existe. */
export async function carroDoLojista(id: string, lojistaId: mongoose.Types.ObjectId) {
  if (!mongoose.isValidObjectId(id)) return null;
  await dbConnect();
  return RepasseVehicle.findOne({ _id: id, lojistaId, ativo: true });
}

export type CarroLocal = {
  id: string;
  tipoVeiculo: string;
  marca: string;
  modelo: string;
  versao: string;
  ano: string;
  anoFabricacao: number | null;
  anoModelo: number | null;
  km: number;
  cor: string;
  combustivel: string;
  transmissao: string;
  portas: number | null;
  opcionais: string;
  observacoes: string;
  preco: number;
  aceitaTroca: boolean;
  unicoDono: boolean;
  placaInterna: string;
  codigoFipe: string;
  descricaoFipe: string;
  precoFipe: number | null;
  referenciaFipe: string;
  situacao: SituacaoCarro;
  situacaoEm: string | null;
  /** Na ordem de exibição; a primeira é a capa. `url` é relativa e assinada. */
  fotos: Array<{ id: string; url: string }>;
  createdAt: string;
  updatedAt: string;
};

/** Formato do carro do pátio para a tela da equipe (com a placa interna). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializarCarroLocal(doc: any): CarroLocal {
  const o = typeof doc?.toObject === "function" ? doc.toObject() : doc;
  const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : null);
  return {
    id: String(o._id),
    tipoVeiculo: o.tipoVeiculo || "carro",
    marca: o.marca ?? "",
    modelo: o.modelo ?? "",
    versao: o.versao ?? "",
    ano: o.ano ?? (o.anoModelo ? String(o.anoModelo) : ""),
    anoFabricacao: o.anoFabricacao ?? null,
    anoModelo: o.anoModelo ?? null,
    km: o.km ?? 0,
    cor: o.cor ?? "",
    combustivel: o.combustivel ?? "",
    transmissao: o.transmissao ?? "",
    portas: typeof o.portas === "number" ? o.portas : null,
    opcionais: o.opcionais ?? "",
    observacoes: o.observacoes ?? "",
    preco: o.preco ?? 0,
    aceitaTroca: o.aceitaTroca === true,
    unicoDono: o.unicoDono === true,
    placaInterna: o.placaInterna ?? "",
    codigoFipe: o.codigoFipe ?? "",
    descricaoFipe: o.descricaoFipe ?? "",
    precoFipe: typeof o.precoFipe === "number" ? o.precoFipe : null,
    referenciaFipe: o.referenciaFipe ?? "",
    situacao: situacaoDe(o),
    situacaoEm: iso(o.situacaoEm),
    fotos: ((o.fotos ?? []) as unknown[]).map((f) => {
      const id = String(f);
      return { id, url: linkDaFotoEstoque("", id) };
    }),
    createdAt: iso(o.createdAt) ?? new Date().toISOString(),
    updatedAt: iso(o.updatedAt) ?? new Date().toISOString(),
  };
}
