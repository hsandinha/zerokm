// Extrato da carteira Procob: o que já foi gasto e como o saldo andou.
//
// A Procob não tem rota de extrato — o que existe é o campo `saldo` que vem no
// envelope de toda resposta e que `wa_lookups` guarda por consulta. Cada linha
// é uma consulta paga com o saldo QUE SOBROU depois dela; a diferença entre
// duas linhas seguidas é o custo daquela consulta (e, quando a diferença é
// negativa, houve recarga entre as duas).
//
// Nada disto vai à Procob: leitura de banco pura, custo zero.

import { NextRequest, NextResponse } from "next/server";
import { requirePanelUser } from "@wa/lib/auth";
import dbConnect from "@/lib/mongodb";
import { WaLookup } from "@wa/models/base";
import { daysAgoIso } from "@wa/lib/dates";
import { getBalance, parseSaldo, PRODUCT_LABEL, type ProcobProduct } from "@wa/lib/procob";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Quantas consultas o extrato carrega — o suficiente para a curva ter forma. */
const MAX_ROWS = 400;

const FOUND = new Set(["000", "009", "023", "025"]);

export async function GET(req: NextRequest) {
  let user;
  try {
    user = await requirePanelUser();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  // Mesma regra do indicador do header: saldo é dado da conta, só admin vê.
  if (user.role !== "admin") return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? MAX_ROWS), MAX_ROWS);
  await dbConnect();
  const since30 = new Date(daysAgoIso(30));
  const since7 = new Date(daysAgoIso(7));

  const [rows, total, last30, last7, cnpj, cpf] = await Promise.all([
    WaLookup.find().sort({ refreshedAt: -1 }).limit(limit).lean(),
    WaLookup.countDocuments(),
    WaLookup.countDocuments({ refreshedAt: { $gte: since30 } }),
    WaLookup.countDocuments({ refreshedAt: { $gte: since7 } }),
    WaLookup.countDocuments({ product: "L0006" }),
    WaLookup.countDocuments({ product: "L0001" }),
  ]);

  // Do mais antigo para o mais novo: o custo de uma consulta só existe em
  // relação à anterior.
  const asc = [...rows].reverse();

  let previous: number | null = null;
  const entries = asc.map((r) => {
    const amount = parseSaldo(r.saldo ?? null);
    // Saldo caiu → custo da consulta. Subiu → entrou crédito entre as duas
    // (recarga no painel da Procob); a consulta em si nunca soma.
    const delta = previous != null && amount != null ? previous - amount : null;
    if (amount != null) previous = amount;
    return {
      id: String(r._id),
      product: r.product as ProcobProduct,
      productLabel: PRODUCT_LABEL[r.product as ProcobProduct] ?? r.product,
      document: r.document,
      name: r.subjectName ?? null,
      code: r.code,
      found: FOUND.has(r.code),
      sandbox: Boolean(r.sandbox),
      saldo: r.saldo ?? null,
      amount,
      cost: delta != null && delta > 0 ? Number(delta.toFixed(2)) : null,
      credit: delta != null && delta < 0 ? Number((-delta).toFixed(2)) : null,
      at: new Date(r.refreshedAt).toISOString(),
      requestedBy: r.requestedBy ?? null,
    };
  });

  const balance = await getBalance();

  // Curva do saldo: um degrau por consulta (o saldo fica parado entre elas) e,
  // no fim, a leitura de agora, que pode ser mais nova que a última consulta.
  const series = entries
    .filter((e) => e.amount != null)
    .map((e) => ({ at: e.at, amount: e.amount as number, cost: e.cost }));
  const lastPoint = series[series.length - 1];
  if (
    balance?.amount != null &&
    balance.checkedAt &&
    (!lastPoint || new Date(balance.checkedAt) > new Date(lastPoint.at)) &&
    (!lastPoint || balance.amount !== lastPoint.amount)
  ) {
    series.push({ at: balance.checkedAt, amount: balance.amount, cost: null });
  }

  const costs = entries.map((e) => e.cost).filter((c): c is number => c != null);
  const cut30 = since30.getTime();
  const spent30 = entries
    .filter((e) => e.cost != null && new Date(e.at).getTime() >= cut30)
    .reduce((sum, e) => sum + (e.cost as number), 0);
  const avgCost = costs.length
    ? Number((costs.reduce((a, b) => a + b, 0) / costs.length).toFixed(2))
    : null;

  return NextResponse.json({
    balance,
    // Mais novo primeiro — é a ordem em que a tela lista.
    entries: entries.slice().reverse(),
    series,
    stats: {
      total,
      last30,
      last7,
      cnpj,
      cpf,
      spent30: costs.length ? Number(spent30.toFixed(2)) : null,
      avgCost,
      // O extrato não alcança tudo: a tela avisa quando há consulta mais
      // antiga do que a janela carregada.
      truncated: total > rows.length,
    },
  });
}
