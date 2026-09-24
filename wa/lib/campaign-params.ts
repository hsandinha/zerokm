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
  | "fixed";

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
};

export const PARAM_LABEL: Record<ParamType, string> = {
  first_name: "Primeiro nome do contato",
  full_name: "Nome completo do contato",
  company: "Empresa",
  city: "Cidade",
  state: "UF",
  phone: "Telefone",
  fixed: "Texto fixo",
};

/** Contato sem nome vira "tudo bem" genérico, mas envia. */
export const NAME_FALLBACK = "tudo bem";
export const COMPANY_FALLBACK = "sua loja";

export function resolveParam(p: ParamMapItem, row: RecipientRow): string {
  switch (p.type) {
    case "first_name": {
      const first = row.contactName?.trim().split(/\s+/)[0];
      if (!first) return NAME_FALLBACK;
      return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
    }
    case "full_name":
      return row.contactName?.trim() || NAME_FALLBACK;
    case "company":
      return row.company?.trim() || COMPANY_FALLBACK;
    case "city":
      return row.city?.trim() || "";
    case "state":
      return row.state?.trim() || "";
    case "phone":
      return row.phone;
    case "fixed":
      return p.value?.trim() ?? "";
  }
}

export function resolveParams(map: ParamMapItem[], row: RecipientRow): string[] {
  return map.map((p) => resolveParam(p, row));
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
