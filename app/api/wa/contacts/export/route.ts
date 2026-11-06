// Exportação dos contatos em CSV, com os mesmos filtros da lista (busca,
// tipo, aniversariantes do mês, opt-out). A base inteira numa planilha é
// coisa de gestor: o operador vê o contato na tela, um a um.
//
// Separador ";" e BOM no começo: é o que o Excel em português abre direto,
// com acento e com cada campo na sua coluna.

import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { requireScopeAdmin, scopeError, type Scope } from "@wa/lib/scope";
import dbConnect from "@/lib/mongodb";
import { WaContact } from "@wa/models/wa";
import { CABECALHO_DO_CSV, consultaDeContatos, linhaDoCsv } from "@wa/lib/contatos";
import { agoraEmBrasilia } from "@wa/lib/automacoes";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Teto de uma exportação: base maior que isto, filtre antes. */
const LIMITE = 50_000;

export async function GET(req: NextRequest) {
  let scope: Scope;
  try {
    scope = await requireScopeAdmin();
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }

  const sp = req.nextUrl.searchParams;
  const filtro = sp.get("filtro") ?? "todos";
  const mes = Number(sp.get("mes")) || agoraEmBrasilia().mes;
  await dbConnect();
  const query = consultaDeContatos(scope.tenantId, { q: sp.get("q"), filtro, tipo: sp.get("tipo"), mes });
  const contatos = await WaContact.find(query)
    .select("phone name email document company tipo birthDate address city state notes source optOut createdAt")
    .sort(filtro === "aniversariantes" ? { birthDay: 1, name: 1 } : { name: 1 })
    .limit(LIMITE)
    .lean();

  const csv = Papa.unparse(
    { fields: CABECALHO_DO_CSV, data: contatos.map((c) => linhaDoCsv(c)) },
    { delimiter: ";", newline: "\r\n" },
  );
  const hoje = new Date().toISOString().slice(0, 10);
  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contatos-${hoje}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
