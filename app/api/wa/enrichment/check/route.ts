// "Isto já foi pesquisado?" — a guarda contra consulta repetida.
//
// Toda entrada de documento (colado, CSV, empresas da base) passa por aqui
// ANTES de qualquer chamada paga: devolve, para cada documento, se já existe
// resposta guardada, de quando e o que ela trouxe. O que já foi pesquisado sai
// do cache; só o que é novo vai à Procob.

import { NextRequest, NextResponse } from "next/server";
import { requirePanelUser } from "@wa/lib/auth";
import dbConnect from "@/lib/mongodb";
import { WaLookup } from "@wa/models/base";
import { isValidCnpj, isValidCpf, onlyDigits } from "@wa/lib/documento";
import type { ProcobProduct } from "@wa/lib/procob";

export const maxDuration = 30;

export type CheckRow = {
  document: string;
  kind: "cnpj" | "cpf";
  /** Já pesquisado antes (em qualquer caminho)? */
  known: boolean;
  code: string | null;
  found: boolean;
  name: string | null;
  summary: Record<string, unknown> | null;
  refreshedAt: string | null;
  requestedBy: string | null;
  sandbox: boolean;
};

export async function POST(req: NextRequest) {
  try {
    await requirePanelUser();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { documents?: string[]; product?: string };
  const product: ProcobProduct = body.product === "L0001" ? "L0001" : "L0006";

  const documents = [...new Set((body.documents ?? []).map((d) => onlyDigits(d)))]
    .filter((d) => isValidCnpj(d) || isValidCpf(d))
    .slice(0, 2000);
  if (documents.length === 0) return NextResponse.json({ rows: [], known: 0, novos: 0 });

  await dbConnect();
  const guardadas = await WaLookup.find({ product, document: { $in: documents } }).lean();
  const found = new Map(guardadas.map((r) => [r.document, r]));

  const rows: CheckRow[] = documents.map((document) => {
    const r = found.get(document);
    return {
      document,
      kind: document.length === 14 ? "cnpj" : "cpf",
      known: Boolean(r),
      code: r?.code ?? null,
      found: r?.code === "000" || r?.code === "023" || r?.code === "025",
      name: r?.subjectName ?? null,
      summary: (r?.summary as Record<string, unknown> | undefined) ?? null,
      refreshedAt: r ? new Date(r.refreshedAt).toISOString() : null,
      requestedBy: r?.requestedBy ?? null,
      sandbox: Boolean(r?.sandbox),
    };
  });

  return NextResponse.json({
    rows,
    known: rows.filter((r) => r.known).length,
    novos: rows.filter((r) => !r.known).length,
  });
}
