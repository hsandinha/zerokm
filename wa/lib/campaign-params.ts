// Resolução das variáveis {{n}} de um template. Compartilhado entre o
// assistente de campanha (prévia + validação) e a API de criação, para que os
// dois concordem sobre o texto que a Meta vai receber.

export type ParamType =
  | "first_name" // primeiro nome de quem atende
  | "full_name"
  | "company" // empresa (razão social do CNPJá, ou a coluna do CSV)
  | "city"
  | "state"
  | "phone"
  | "fixed"
  // Colunas extras do CSV ("Variável extra 1-3" no mapeamento do arquivo).
  | "var1"
  | "var2"
  | "var3";

export type ParamMapItem = {
  type: ParamType;
  /** Só para `fixed`: o texto literal. */
  value?: string;
};

export type RecipientRow = {
  phone: string;
  contactName?: string | null;
  company?: string | null;
  city?: string | null;
  state?: string | null;
  var1?: string | null;
  var2?: string | null;
  var3?: string | null;
};

export const PARAM_LABEL: Record<ParamType, string> = {
  first_name: "Primeiro nome do contato",
  full_name: "Nome completo do contato",
  company: "Empresa",
  city: "Cidade",
  state: "UF",
  phone: "Telefone",
  fixed: "Texto fixo",
  var1: "Variável extra 1 (CSV)",
  var2: "Variável extra 2 (CSV)",
  var3: "Variável extra 3 (CSV)",
};

/** Contato sem nome vira "tudo bem" genérico, mas envia. */
export const NAME_FALLBACK = "tudo bem";
/** Só na prospecção do CNV, que fala com lojas. O cliente final de uma loja
 *  não tem "loja": lá, empresa vazia é variável vazia (e o destinatário fica
 *  de fora), em vez de "Olá, sua loja". */
export const COMPANY_FALLBACK = "sua loja";

export type ResolveOpts = {
  /** undefined = padrão do CNV ("sua loja"); null = sem substituto. */
  companyFallback?: string | null;
};

/** Substitutos de quem dispara: a loja nunca usa o "sua loja" do CNV. */
export function fallbacksDe(tenantId: string | null | undefined): ResolveOpts {
  return { companyFallback: tenantId ? null : COMPANY_FALLBACK };
}

export function resolveParam(p: ParamMapItem, row: RecipientRow, opts: ResolveOpts = {}): string {
  switch (p.type) {
    case "first_name": {
      const first = row.contactName?.trim().split(/\s+/)[0];
      if (!first) return NAME_FALLBACK;
      return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
    }
    case "full_name":
      return row.contactName?.trim() || NAME_FALLBACK;
    case "company":
      return row.company?.trim() || (opts.companyFallback === undefined ? COMPANY_FALLBACK : (opts.companyFallback ?? ""));
    case "city":
      return row.city?.trim() || "";
    case "state":
      return row.state?.trim() || "";
    case "phone":
      return row.phone;
    case "fixed":
      return p.value?.trim() ?? "";
    case "var1":
      return row.var1?.trim() || "";
    case "var2":
      return row.var2?.trim() || "";
    case "var3":
      return row.var3?.trim() || "";
    default:
      // Tipo desconhecido (payload antigo ou adulterado): vazio, e o
      // destinatário fica de fora em vez de receber "undefined".
      return "";
  }
}

export function resolveParams(map: ParamMapItem[], row: RecipientRow, opts: ResolveOpts = {}): string[] {
  return map.map((p) => resolveParam(p, row, opts));
}

export const PARAM_TYPES: ParamType[] = [
  "first_name",
  "full_name",
  "company",
  "city",
  "state",
  "phone",
  "fixed",
  "var1",
  "var2",
  "var3",
];

export function isParamType(v: unknown): v is ParamType {
  return typeof v === "string" && (PARAM_TYPES as string[]).includes(v);
}

/** Mapeamento vindo do cliente, saneado: tipo desconhecido vira texto fixo vazio. */
export function sanitizeParamMap(map: unknown, n: number): ParamMapItem[] {
  const lista = Array.isArray(map) ? map : [];
  const out: ParamMapItem[] = lista.slice(0, n).map((p): ParamMapItem => {
    const item = (p ?? {}) as { type?: unknown; value?: unknown };
    return isParamType(item.type)
      ? { type: item.type, value: typeof item.value === "string" ? item.value : "" }
      : { type: "fixed" as const, value: "" };
  });
  const padrao = defaultParamMap(n);
  while (out.length < n) out.push(padrao[out.length]);
  return out;
}

/**
 * Índices (base 1) das variáveis que ficariam vazias. A Meta rejeita parâmetro
 * em branco com `(#131008) Required parameter is missing`, então nada com
 * índice aqui pode ser enviado.
 */
export function emptyParamPositions(params: string[]): number[] {
  return params.flatMap((p, i) => (p.trim() ? [] : [i + 1]));
}

/** Substitui {{n}} pelo valor resolvido — usado na prévia do assistente. */
export function renderTemplateBody(body: string, params: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (match, n) => {
    const value = params[Number(n) - 1];
    return value?.trim() ? value : match;
  });
}

/** Quantidade de variáveis distintas no corpo do template. */
export function countBodyVars(body: string): number {
  return new Set([...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]))).size;
}

/** Palpite para o mapeamento inicial: nome, empresa, cidade. */
export function defaultParamMap(count: number): ParamMapItem[] {
  const order: ParamType[] = ["first_name", "company", "city"];
  return Array.from({ length: count }, (_, i) => ({ type: order[i] ?? "fixed", value: "" }));
}
