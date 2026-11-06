// Público de campanha montado pela loja: contatos dela, uma coluna do funil,
// uma lista colada e um CSV, somados. Arquivo puro: a tela usa para mostrar a
// lista (com a origem de cada pessoa) e a API usa para montar a campanha. Os
// dois precisam concordar sobre quem entra, senão a contagem da revisão mente.
//
// Contatos e coluna são resolvidos no servidor pelo tenantId (nunca a partir
// de uma lista mandada pela tela); lista colada e CSV vêm da tela por natureza.

import { parsePhoneBr } from "@wa/lib/phone";

export type OrigemDoPublico = "csv" | "colar" | "coluna" | "contatos";

export const ORIGEM_LABEL: Record<OrigemDoPublico, string> = {
  csv: "CSV",
  colar: "lista colada",
  coluna: "funil",
  contatos: "contatos",
};

/** Quem traz mais dado vence no dedupe: o CSV tem as colunas extras, a lista
 *  colada foi digitada para esta campanha, o funil e os contatos vêm do banco. */
const PRIORIDADE: Record<OrigemDoPublico, number> = { csv: 4, colar: 3, coluna: 2, contatos: 1 };

export type PessoaDoPublico = {
  /** +55... (canônico). */
  phone: string;
  name?: string | null;
  company?: string | null;
  city?: string | null;
  state?: string | null;
  var1?: string | null;
  var2?: string | null;
  var3?: string | null;
  origem: OrigemDoPublico;
};

/** Teto de pessoas numa campanha da loja (a criação roda em uma requisição). */
export const MAX_PUBLICO = 10_000;

/**
 * Soma as listas, sem repetir telefone, e tira quem foi desmarcado. Na
 * repetição fica a origem de maior prioridade, completando nome e campos que
 * só a outra tinha.
 */
export function juntarPublico(
  listas: PessoaDoPublico[][],
  excluir: Iterable<string> = [],
): { pessoas: PessoaDoPublico[]; duplicados: number; excluidos: number } {
  const fora = new Set(excluir);
  const porFone = new Map<string, PessoaDoPublico>();
  let duplicados = 0;
  for (const lista of listas) {
    for (const p of lista) {
      const atual = porFone.get(p.phone);
      if (!atual) {
        porFone.set(p.phone, { ...p });
        continue;
      }
      duplicados++;
      const [vence, perde] = PRIORIDADE[p.origem] > PRIORIDADE[atual.origem] ? [{ ...p }, atual] : [atual, p];
      for (const k of ["name", "company", "city", "state", "var1", "var2", "var3"] as const) {
        if (!vence[k]?.trim() && perde[k]?.trim()) vence[k] = perde[k];
      }
      porFone.set(p.phone, vence);
    }
  }
  const pessoas: PessoaDoPublico[] = [];
  let excluidos = 0;
  for (const p of porFone.values()) {
    if (fora.has(p.phone)) excluidos++;
    else pessoas.push(p);
  }
  return { pessoas, duplicados, excluidos };
}

/**
 * Lista colada: um número por linha, com o nome opcional antes ou depois
 * ("Ana; 31 99999-0000", "31999990000 Ana", "(31) 99999-0000"). Linha sem
 * celular válido volta em `invalidas` para a tela mostrar.
 */
export function lerListaColada(texto: string): { pessoas: PessoaDoPublico[]; invalidas: string[] } {
  const pessoas: PessoaDoPublico[] = [];
  const invalidas: string[] = [];
  for (const bruta of texto.split(/\r?\n/)) {
    const linha = bruta.trim();
    if (!linha) continue;
    // O telefone é o trecho com dígitos, parênteses, traço, espaço e +; o resto é o nome.
    const trecho = linha.match(/\+?\(?\d[\d\s().-]{7,}\d/)?.[0] ?? "";
    const parsed = parsePhoneBr(trecho);
    // Fixo não tem WhatsApp.
    if (!parsed.valid || !parsed.e164 || parsed.kind === "fixo") {
      invalidas.push(linha);
      continue;
    }
    const nome = linha
      .replace(trecho, " ")
      .replace(/[;,\t|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    pessoas.push({ phone: parsed.e164, name: nome || null, origem: "colar" });
  }
  return { pessoas, invalidas };
}
