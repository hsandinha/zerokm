// Abrir o arquivo que a pessoa escolheu, CSV ou Excel (.xlsx), sempre no
// navegador e no mesmo formato (ParsedCsv): as telas de importação não
// precisam saber de onde veio.

import { parseCsv, parseLinhas, type ParsedCsv } from "./csv";
import { lerXlsx, pareceXlsx, PlanilhaError } from "./xlsx";

export { PlanilhaError };

/** Para o `accept` do <input type="file">. */
export const ACEITA_PLANILHA =
  ".csv,.txt,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Texto curto para a tela. */
export const FORMATOS_DE_PLANILHA = "CSV ou Excel (.xlsx)";

const LIMITE_BYTES = 20 * 1024 * 1024;

export async function lerPlanilha(file: File): Promise<ParsedCsv> {
  const nome = file.name.toLowerCase();
  if (file.size > LIMITE_BYTES) throw new PlanilhaError("O arquivo passa de 20 MB. Divida em arquivos menores.");
  if (/\.(xls|xlsb|ods|numbers)$/.test(nome)) {
    throw new PlanilhaError("Esse formato não abre aqui. No Excel: Arquivo, Salvar como, Pasta de Trabalho do Excel (.xlsx) ou CSV.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Pelo conteúdo, não só pelo nome: .xlsx renomeado para .csv também abre.
  if (nome.endsWith(".xlsx") || pareceXlsx(bytes.subarray(0, 4))) {
    return parseLinhas(await lerXlsx(bytes));
  }
  if (!/\.(csv|txt)$/.test(nome) && file.type && !/^text\//.test(file.type)) {
    throw new PlanilhaError(`Mande a planilha em ${FORMATOS_DE_PLANILHA}.`);
  }
  return parseCsv(textoDoCsv(bytes));
}

/** CSV salvo pelo Excel em português costuma vir em Windows-1252, não UTF-8:
 *  lido como UTF-8, "João" vira "Jo�o". Se aparecer o caractere de troca,
 *  tenta de novo em 1252. */
export function textoDoCsv(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  if (!utf8.includes("\uFFFD")) return utf8;
  try {
    return new TextDecoder("windows-1252").decode(bytes);
  } catch {
    return utf8;
  }
}
