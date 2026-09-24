// Audiência disponível para o assistente de campanha: quantas empresas da base
// estão prontas, uma amostra delas e as pessoas (sócios) com celular achado na
// Procob.
//
// Tudo aqui é leitura de banco — montar a audiência não gasta consulta.

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@wa/lib/auth";
import dbConnect from "@/lib/mongodb";
import { WaContact } from "@wa/models/wa";
import { WaPartner, WaPartnerContact, WaTarget } from "@wa/models/base";

export const dynamic = "force-dynamic";

const AMOSTRA = 50;

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
  }

  await dbConnect();
  const fonte = req.nextUrl.searchParams.get("source") ?? "targets";

  // ── Por pessoa: sócios com celular guardado ────────────────
  if (fonte === "pessoa") {
    const busca = (req.nextUrl.searchParams.get("q") ?? "").trim();
    const query: Record<string, unknown> = { deceased: false };
    if (busca) {
      query.name = new RegExp(busca.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    }
    const partners = await WaPartner.find(query).sort({ enrichedAt: -1 }).limit(200).lean();
    const contatos = await WaPartnerContact.find({
      partnerId: { $in: partners.map((p) => p._id) },
      kind: { $in: ["celular", "comercial"] },
      e164: { $ne: null },
    }).lean();

    const porSocio = new Map<string, typeof contatos>();
    for (const c of contatos) {
      const list = porSocio.get(String(c.partnerId)) ?? [];
      list.push(c);
      porSocio.set(String(c.partnerId), list);
    }

    const optOut = new Set(
      (
        await WaContact.find({
          phone: { $in: contatos.map((c) => c.e164).filter(Boolean) as string[] },
          optOut: true,
        })
          .select("phone")
          .lean()
      ).map((c) => c.phone),
    );

    const people = partners
      .map((p) => {
        const fones = (porSocio.get(String(p._id)) ?? [])
          .filter((c) => c.e164 && !optOut.has(c.e164))
          .sort(
            (a, b) => Number(b.preferred) - Number(a.preferred) || (b.score ?? -99) - (a.score ?? -99),
          );
        return {
          partnerId: String(p._id),
          name: p.name,
          document: p.taxId ?? null,
          enrichedAt: p.enrichedAt ?? null,
          phones: fones.map((c) => ({
            phone: c.e164 as string,
            score: c.score ?? null,
            operator: c.operator ?? null,
            preferred: c.preferred,
          })),
        };
      })
      .filter((p) => p.phones.length > 0);

    return NextResponse.json({ source: "pessoa", people, total: people.length });
  }

  // ── Da base: empresas com telefone prontas para disparo ────
  const [ready, semTelefone, amostra] = await Promise.all([
    WaTarget.countDocuments({ status: "ready", phone: { $ne: null } }),
    WaTarget.countDocuments({ status: "new" }),
    WaTarget.find({ status: "ready", phone: { $ne: null } })
      .sort({ priority: -1 })
      .limit(AMOSTRA)
      .lean(),
  ]);

  return NextResponse.json({
    source: "targets",
    total: ready,
    pending: semTelefone,
    sample: amostra.map((t) => ({
      id: String(t._id),
      cnpj: t.cnpj,
      company: t.legalName ?? t.tradeName ?? null,
      contactName: t.contactName ?? null,
      phone: t.phone ?? null,
      city: t.city ?? null,
      state: t.state ?? null,
    })),
  });
}
