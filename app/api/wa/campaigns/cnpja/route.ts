// Prévia de empresas do CNPJá para montar uma campanha (CNAE/UF/município).

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@wa/lib/auth";
import { searchCompanies } from "@wa/lib/cnpja";

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    cnae?: string;
    uf?: string;
    city?: string;
    limit?: number;
    token?: string;
  };

  const result = await searchCompanies({
    cnae: body.cnae,
    uf: body.uf,
    city: body.city,
    limit: body.limit,
    token: body.token,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({
    companies: result.companies,
    next: result.next,
    count: result.count ?? null,
  });
}
