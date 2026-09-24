// Entrada por CSV: a lista que o vendedor já tem na mão.
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

/** Analisa o texto do CSV. O delimitador é detectado sozinho — exportação
 *  brasileira costuma vir com ";" e o Excel ainda mete BOM na frente. */
export function parseCsv(text: string): ParsedCsv {
  const clean = text.replace(/^\uFEFF/, "");

  // Cabeçalho repetido faria uma coluna
  // sobrescrever a outra silenciosamente — cada repetição ganha sufixo.
  const vistos = new Map<string, number>();
  const result = Papa.parse<Record<string, string>>(clean, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => {
      const nome = h.trim();
      const n = (vistos.get(nome) ?? 0) + 1;
      vistos.set(nome, n);
      return n === 1 ? nome : `${nome} (${n})`;
    },
  });

  const raw = (result.data ?? []).filter((r) =>
    Object.values(r).some((v) => v != null && String(v).trim() !== ""),
  );
  const headers = result.meta?.fields?.map((f) => f.trim()) ?? Object.keys(raw[0] ?? {});
  const suggestedMapping = autoDetectMapping(headers);

  return {
    headers,
    raw,
    suggestedMapping,
    preview: raw.slice(0, 10).map((r) => applyMapping(r, suggestedMapping)),
  };
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
