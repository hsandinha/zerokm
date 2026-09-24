// Detecção automática de colunas do CSV. A lista chega com os nomes de coluna
// que a origem já usa (CNPJá, planilha do vendedor, exportação de CRM) — em
// vez de exigir um layout fixo, tentamos adivinhar e deixamos quem opera
// corrigir na tela de importação.

import type { AudienceField, AudienceRow, ColumnMapping } from "./types";

/** Aliases por campo, em minúsculas e sem acento. A ordem importa: o primeiro
 *  alias que casar vence. */
const ALIASES: Array<[AudienceField, string[]]> = [
  ["phone", ["telefone", "celular", "whatsapp", "fone", "phone", "telefone 1"]],
  ["contactName", ["nome contato", "contato", "primeiro nome", "responsavel", "nome"]],
  ["cnpj", ["cnpj", "documento", "cnpj empresa"]],
  ["company", ["razao social", "empresa", "nome fantasia", "loja", "revenda", "organizacao"]],
  ["city", ["cidade", "municipio"]],
  ["state", ["uf", "estado"]],
  ["cnae", ["cnae", "atividade"]],
  ["email", ["email", "e-mail"]],
  ["partnerName", ["socio", "nome do socio", "socio nome"]],
  ["partnerTaxId", ["cpf socio", "cpf do socio", "cpf"]],
  ["var1", ["variavel 1", "var1", "campo 1"]],
  ["var2", ["variavel 2", "var2", "campo 2"]],
  ["var3", ["variavel 3", "var3", "campo 3"]],
];

function normalizeHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // tira acento
    .toLowerCase()
    .replace(/[_\-./]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Palpite de mapeamento a partir dos cabeçalhos do arquivo. Um campo só é
 *  atribuído uma vez — se duas colunas casarem, a primeira fica. */
export function autoDetectMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const taken = new Set<AudienceField>();

  for (const header of headers) {
    const norm = normalizeHeader(header);
    let match: AudienceField | "" = "";

    for (const [field, aliases] of ALIASES) {
      if (taken.has(field)) continue;
      if (aliases.some((a) => norm === a)) {
        match = field;
        break;
      }
    }
    // Segunda passada, mais frouxa: aceita "contém" quando não houve casamento
    // exato (ex.: "CNPJ da empresa (matriz)").
    if (!match) {
      for (const [field, aliases] of ALIASES) {
        if (taken.has(field)) continue;
        if (aliases.some((a) => norm.includes(a))) {
          match = field;
          break;
        }
      }
    }

    if (match) taken.add(match);
    mapping[header] = match;
  }

  return mapping;
}

/** Aplica o mapeamento a uma linha bruta. */
export function applyMapping(raw: Record<string, unknown>, mapping: ColumnMapping): AudienceRow {
  const row: AudienceRow = {};
  for (const [column, field] of Object.entries(mapping)) {
    if (!field) continue;
    const value = raw[column];
    if (value == null || String(value).trim() === "") continue;
    (row as Record<string, unknown>)[field] = String(value).trim();
  }
  return row;
}
