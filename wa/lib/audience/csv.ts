// Entrada por CSV (ou .xlsx, lido em xlsx.ts): a lista que o vendedor já tem na mão.
//
// Não exigimos layout fixo — o arquivo vem com os nomes de coluna que a
// origem já usa, a gente adivinha o mapeamento (mapping.ts) e quem opera
// confirma na tela antes de gravar.

import Papa from "papaparse";
import { applyMapping, autoDetectMapping } from "./mapping";
import type { AudienceRow, ColumnMapping } from "./types";

export type ParsedCsv = {
  headers: string[];
  /** Linhas cruas, chaveadas pelo cabeçalho original. */
  raw: Array<Record<string, string>>;
  /** Palpite de mapeamento para o operador revisar. */
  suggestedMapping: ColumnMapping;
  /** Primeiras linhas já mapeadas, para pré-visualização. */
  preview: AudienceRow[];
};

/** Cabeçalho repetido faria uma coluna sobrescrever a outra silenciosamente:
 *  cada repetição ganha sufixo. Vale para o CSV e para o .xlsx. */
function nomeadorDeColunas(): (h: string) => string {
  const vistos = new Map<string, number>();
  return (h) => {
    const nome = h.trim();
    const n = (vistos.get(nome) ?? 0) + 1;
    vistos.set(nome, n);
    return n === 1 ? nome : `${nome} (${n})`;
  };
}

function montar(headers: string[], linhas: Array<Record<string, string>>): ParsedCsv {
  const raw = linhas.filter((r) => Object.values(r).some((v) => v != null && String(v).trim() !== ""));
  const suggestedMapping = autoDetectMapping(headers);
  return {
    headers,
    raw,
    suggestedMapping,
    preview: raw.slice(0, 10).map((r) => applyMapping(r, suggestedMapping)),
  };
}

/** Analisa o texto do CSV. O delimitador é detectado sozinho — exportação
 *  brasileira costuma vir com ";" e o Excel ainda mete BOM na frente. */
export function parseCsv(text: string): ParsedCsv {
  const clean = text.replace(/^\uFEFF/, "");
  const result = Papa.parse<Record<string, string>>(clean, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: nomeadorDeColunas(),
  });
  const dados = result.data ?? [];
  const headers = result.meta?.fields?.map((f) => f.trim()) ?? Object.keys(dados[0] ?? {});
  return montar(headers, dados);
}

/** Linhas já lidas de uma planilha (.xlsx): a primeira com conteúdo é o
 *  cabeçalho. Coluna sem título e com dados ganha o nome da letra. */
export function parseLinhas(linhas: string[][]): ParsedCsv {
  const [titulos = [], ...dados] = linhas;
  // Laço, não Math.max(...): planilha com centenas de milhares de linhas
  // estoura a pilha com o spread.
  let largura = titulos.length;
  for (const l of dados) if (l.length > largura) largura = l.length;
  const nomear = nomeadorDeColunas();
  const headers: string[] = [];
  const indices: number[] = [];
  for (let i = 0; i < largura; i++) {
    const titulo = (titulos[i] ?? "").trim();
    const temDado = dados.some((l) => (l[i] ?? "").trim() !== "");
    if (!titulo && !temDado) continue;
    headers.push(nomear(titulo || `Coluna ${letraDaColuna(i)}`));
    indices.push(i);
  }
  const registros = dados.map((l) => {
    const r: Record<string, string> = {};
    headers.forEach((h, k) => (r[h] = (l[indices[k]] ?? "").trim()));
    return r;
  });
  return montar(headers, registros);
}

/** 0 → A, 25 → Z, 26 → AA. */
function letraDaColuna(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Converte as linhas cruas usando o mapeamento confirmado pelo operador. */
export function rowsFromCsv(
  raw: Array<Record<string, string>>,
  mapping: ColumnMapping,
): Array<{ line: number; raw: Record<string, unknown>; row: AudienceRow }> {
  return raw.map((r, i) => ({
    line: i + 2, // +1 do cabeçalho, +1 porque planilha conta do 1
    raw: r,
    row: applyMapping(r, mapping),
  }));
}
