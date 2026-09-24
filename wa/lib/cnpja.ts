// Cliente da API comercial do CNPJá (https://cnpja.com) — busca empresas por
// CNAE/UF/município para alimentar campanhas. Requer CNPJA_API_KEY no env.
// Referência dos parâmetros: https://cnpja.com/api/reference (GET /office).

const CNPJA_BASE = "https://api.cnpja.com";

export type CnpjaCompany = {
  taxId: string;
  name: string;
  phone: string | null; // dígitos DDD+número (sem DDI)
  email: string | null;
  city: string | null;
  state: string | null;
  cnae: string | null;
};

type CnpjaRecord = {
  taxId?: string;
  alias?: string | null;
  company?: { name?: string };
  phones?: Array<{ area?: string; number?: string }>;
  emails?: Array<{ address?: string }>;
  address?: { city?: string; state?: string };
  mainActivity?: { id?: number | string; text?: string };
};

export async function searchCompanies(params: {
  cnae?: string; // código CNAE (só dígitos, ex: 4511101)
  uf?: string;
  city?: string;
  limit?: number; // por página (máx. 100)
  token?: string; // cursor de paginação devolvido em `next`
}): Promise<{
  ok: boolean;
  error?: string;
  companies: CnpjaCompany[];
  next?: string | null;
  count?: number;
}> {
  const apiKey = process.env.CNPJA_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "CNPJA_API_KEY não configurada no ambiente", companies: [] };
  }

  const qs = new URLSearchParams();
  // Só empresas ATIVAS na Receita, e só as que têm telefone declarado.
  qs.set("status.id.in", "2");
  qs.set("phones.ex", "true");
  if (params.cnae) qs.set("mainActivity.in", params.cnae.replace(/\D/g, ""));
  if (params.uf) qs.set("address.state.in", params.uf.toUpperCase());
  if (params.city) qs.set("address.city.in", params.city);
  qs.set("limit", String(Math.min(params.limit ?? 30, 100)));
  if (params.token) qs.set("token", params.token);

  const res = await fetch(`${CNPJA_BASE}/office?${qs.toString()}`, {
    headers: { Authorization: apiKey },
  });
  const body = (await res.json().catch(() => ({}))) as {
    message?: string;
    next?: string | null;
    count?: number;
    records?: CnpjaRecord[];
  };

  if (!res.ok) {
    return {
      ok: false,
      error: body?.message || `CNPJá respondeu ${res.status}`,
      companies: [],
    };
  }

  const companies: CnpjaCompany[] = (body.records ?? []).map((r) => {
    const phone = r.phones?.find((p) => p.area && p.number);
    return {
      taxId: r.taxId ?? "",
      name: r.alias || r.company?.name || "",
      phone: phone ? `${phone.area}${phone.number}`.replace(/\D/g, "") : null,
      email: r.emails?.[0]?.address ?? null,
      city: r.address?.city ?? null,
      state: r.address?.state ?? null,
      cnae: r.mainActivity?.id != null ? String(r.mainActivity.id) : null,
    };
  });

  return { ok: true, companies, next: body.next ?? null, count: body.count };
}
