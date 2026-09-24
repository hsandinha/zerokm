// Estado do enriquecimento — só leitura do que já foi consultado (sem custo).
//   GET /api/wa/enrichment            → recentes + situação das credenciais
//   GET /api/wa/enrichment?cnpj=…     → sócios, contatos e empresa daquele CNPJ
//   GET /api/wa/enrichment?pending=1  → empresas da base sem telefone (a fila)

import { NextRequest, NextResponse } from "next/server";
import { requirePanelUser } from "@wa/lib/auth";
import dbConnect from "@/lib/mongodb";
import { WaLookup, WaPartner, WaTarget } from "@wa/models/base";
import { isValidCnpj, onlyDigits } from "@wa/lib/documento";
import { normalizePerson, normalizeQsa, procobCredentials, procobProxyUrl } from "@wa/lib/procob";
import { cachedCnpjState } from "@wa/lib/enrichment";

export const dynamic = "force-dynamic";

// Só o host: a URL do proxy carrega usuário e senha.
function proxyHost(): string | null {
  const url = procobProxyUrl();
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return "configurado";
  }
}

export async function GET(req: NextRequest) {
  try {
    await requirePanelUser();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  await dbConnect();

  // Empresas da base ainda sem telefone — a fila natural do enriquecimento.
  if (req.nextUrl.searchParams.get("pending")) {
    const [targets, total] = await Promise.all([
      WaTarget.find({ phone: null, status: { $in: ["new", "ready"] } })
        .sort({ priority: -1 })
        .limit(1000)
        .lean(),
      WaTarget.countDocuments({ phone: null, status: { $in: ["new", "ready"] } }),
    ]);
    const partnerIds = targets
      .map((t) => t.partnerId)
      .filter((id): id is NonNullable<typeof id> => Boolean(id));
    const partners = await WaPartner.find({ _id: { $in: partnerIds } })
      .select("name taxId")
      .lean();
    const partnerById = new Map(partners.map((p) => [String(p._id), p]));

    return NextResponse.json({
      total,
      targets: targets.map((t) => {
        const partner = t.partnerId ? partnerById.get(String(t.partnerId)) : null;
        return {
          cnpj: t.cnpj,
          name: t.legalName ?? null,
          ownerName: partner?.name ?? t.contactName ?? null,
          ownerCpf: partner?.taxId ?? null,
        };
      }),
    });
  }

  const cnpj = onlyDigits(req.nextUrl.searchParams.get("cnpj"));
  if (cnpj) {
    if (!isValidCnpj(cnpj)) return NextResponse.json({ error: "CNPJ inválido" }, { status: 400 });
    return NextResponse.json({ state: await cachedCnpjState(cnpj) });
  }

  const [empresas, pessoas] = await Promise.all([
    WaLookup.find({ product: "L0006" }).sort({ refreshedAt: -1 }).limit(40).lean(),
    WaLookup.find({ product: "L0001" }).sort({ refreshedAt: -1 }).limit(40).lean(),
  ]);

  const recent = empresas
    .filter((r) => r.document.length === 14)
    .map((r) => {
      const qsa = r.code === "000" ? normalizeQsa(r.content) : null;
      return {
        cnpj: r.document,
        name: qsa?.subject?.name ?? r.subjectName ?? null,
        // Conta só quem dá para abordar — falecido tem lista própria.
        partners: qsa?.partners.filter((x) => !x.deceased).length ?? 0,
        found: r.code === "000",
        sandbox: Boolean(r.sandbox),
        refreshedAt: r.refreshedAt,
        requestedBy: r.requestedBy ?? null,
      };
    });

  // Pessoas já consultadas (modo "por CPF"): reabrir sai do cache, sem custo.
  const recentPeople = pessoas
    .filter((r) => r.document.length === 11)
    .map((r) => {
      const person = r.code === "000" ? normalizePerson(r.content) : null;
      const phones =
        person?.phones.filter((t) => t.e164 && /^\+55\d{2}9\d{8}$/.test(t.e164)).length ?? 0;
      return {
        cpf: r.document,
        name: person?.name ?? r.subjectName ?? null,
        phones,
        emails: person?.emails.length ?? 0,
        found: r.code === "000",
        sandbox: Boolean(r.sandbox),
        refreshedAt: r.refreshedAt,
      };
    });

  const creds = procobCredentials();
  return NextResponse.json({
    recent,
    recentPeople,
    credentials: {
      sandbox: creds.sandbox,
      user: creds.sandbox ? null : creds.user.replace(/^(.{2}).+(@.+)$/, "$1…$2"),
      proxy: proxyHost(),
    },
  });
}
