// Histórico de pesquisas: tudo que já foi consultado na Procob, filtrável por
// nome, telefone, e-mail ou documento. Não custa nada — lê só o que está
// guardado.
//
// As linhas antigas (gravadas antes do índice existir) são indexadas em lote
// aqui mesmo, algumas por chamada, até acabar.

import { NextRequest, NextResponse } from "next/server";
import { requirePanelUser } from "@wa/lib/auth";
import dbConnect from "@/lib/mongodb";
import { WaLookup, WaPartner, WaTarget } from "@wa/models/base";
import { onlyDigits } from "@wa/lib/documento";
import { buildLookupIndex, type ProcobProduct } from "@wa/lib/procob";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const INDEX_BATCH = 300;

/** Preenche nome/telefones/e-mails das consultas gravadas antes do índice. */
async function indexPending(): Promise<number> {
  const pendentes = await WaLookup.find({ indexedAt: null }).limit(INDEX_BATCH);
  if (pendentes.length === 0) return 0;
  const now = new Date();
  for (const row of pendentes) {
    const index = buildLookupIndex(row.product as ProcobProduct, row.code, row.content);
    row.subjectName = index.subject_name ?? undefined;
    row.phones = index.phones;
    row.emails = index.emails;
    row.summary = index.summary;
    row.indexedAt = now;
    await row.save();
  }
  return pendentes.length;
}

export async function GET(req: NextRequest) {
  try {
    await requirePanelUser();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  await dbConnect();
  const indexed = await indexPending();

  const sp = req.nextUrl.searchParams;
  const asked = sp.get("kind");
  const kind = asked === "cpf" ? "cpf" : asked === "obito" ? "obito" : "cnpj";
  const q = (sp.get("q") ?? "").trim();
  const limit = Math.min(Number(sp.get("limit") ?? 100), 500);

  const counts = async () => {
    const [cnpj, cpf, obito] = await Promise.all([
      WaLookup.countDocuments({ product: "L0006" }),
      WaLookup.countDocuments({ product: "L0001" }),
      WaPartner.countDocuments({ deceased: true }),
    ]);
    return { cnpj, cpf, obito };
  };

  // ── Titulares falecidos ────────────────────────────────────
  //
  // Não é histórico de consulta: é a lista de quem o quadro societário (ou a
  // localização) acusou como falecido. Some da lista de sócios e da campanha;
  // fica aqui para ninguém achar que o sócio simplesmente sumiu.
  if (kind === "obito") {
    const query: Record<string, unknown> = { deceased: true };
    if (q) {
      const digits = onlyDigits(q);
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      query.$or = digits.length >= 3 ? [{ name: rx }, { taxId: new RegExp(digits) }] : [{ name: rx }];
    }
    const [people, total] = await Promise.all([
      WaPartner.find(query).sort({ name: 1 }).limit(limit).lean(),
      WaPartner.countDocuments(query),
    ]);

    const ids = people.map((p) => p._id);
    const empresas = ids.length
      ? await WaTarget.find({ "partners.partnerId": { $in: ids } })
          .select("cnpj legalName partners")
          .lean()
      : [];
    const byPartner = new Map<
      string,
      Array<{ cnpj: string; legalName: string | null; role: string | null; active: boolean }>
    >();
    for (const t of empresas) {
      for (const p of t.partners ?? []) {
        const key = String(p.partnerId);
        const list = byPartner.get(key) ?? [];
        list.push({
          cnpj: t.cnpj,
          legalName: t.legalName ?? null,
          role: p.role ?? null,
          active: p.active,
        });
        byPartner.set(key, list);
      }
    }

    return NextResponse.json({
      kind,
      total,
      counts: await counts(),
      indexed,
      rows: people.map((r) => ({
        id: String(r._id),
        document: r.taxId ?? "",
        name: r.name,
        enrichedAt: r.enrichedAt ?? null,
        companies: byPartner.get(String(r._id)) ?? [],
      })),
    });
  }

  // CNPJ → quadro societário; CPF → localização (telefones/e-mails).
  const product: ProcobProduct = kind === "cpf" ? "L0001" : "L0006";
  const docLength = kind === "cpf" ? 11 : 14;

  const query: Record<string, unknown> = { product };
  if (q) {
    const digits = onlyDigits(q);
    const clean = q.replace(/[,()]/g, " ").trim();
    const rx = new RegExp(clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const or: Record<string, unknown>[] = [{ subjectName: rx }];
    // Telefone: compara pelos dígitos, com e sem o DDD.
    if (digits.length >= 4) {
      or.push({ document: new RegExp(digits) });
      or.push({ phones: new RegExp(digits) });
    }
    if (clean.includes("@")) or.push({ emails: new RegExp(clean.toLowerCase()) });
    query.$or = or;
  }

  const [rows, total] = await Promise.all([
    WaLookup.find(query).sort({ refreshedAt: -1 }).limit(limit).lean(),
    WaLookup.countDocuments(query),
  ]);

  return NextResponse.json({
    kind,
    total,
    counts: await counts(),
    indexed,
    rows: rows
      .filter((r) => r.document.length === docLength)
      .map((r) => ({
        id: String(r._id),
        document: r.document,
        code: r.code,
        found: r.code === "000" || r.code === "023" || r.code === "025",
        message: r.message ?? null,
        name: r.subjectName ?? null,
        phones: r.phones ?? [],
        emails: r.emails ?? [],
        summary: (r.summary as Record<string, unknown> | undefined) ?? null,
        sandbox: Boolean(r.sandbox),
        refreshedAt: r.refreshedAt,
        requestedBy: r.requestedBy ?? null,
      })),
  });
}
