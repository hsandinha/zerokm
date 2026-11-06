// Ficha do contato: os campos que a equipe preenche à mão ou que vêm da
// planilha, a conferência de cada um, o mapeamento das colunas do CSV e o
// filtro da lista. Arquivo puro: usado pela tela (a planilha é lida no
// navegador) e pelas rotas de /api/wa/contacts.

import { autoDetectMapping } from "@wa/lib/audience/mapping";
import type { AudienceField } from "@wa/lib/audience/types";
import { isValidCnpj, isValidCpf, onlyDigits } from "@wa/lib/documento";
import { parsePhoneBr } from "@wa/lib/phone";

export const TIPOS_DE_CONTATO = ["cliente", "fornecedor", "parceiro", "outros"] as const;
export type TipoDeContato = (typeof TIPOS_DE_CONTATO)[number];

export const ROTULO_DO_TIPO: Record<TipoDeContato, string> = {
  cliente: "Cliente",
  fornecedor: "Fornecedor",
  parceiro: "Parceiro",
  outros: "Outros",
};

export function tipoDeContato(v: unknown): TipoDeContato | null {
  const t = typeof v === "string" ? deburr(v).trim() : "";
  if ((TIPOS_DE_CONTATO as readonly string[]).includes(t)) return t as TipoDeContato;
  // Planilha costuma vir no plural ou com outro nome.
  if (/^client/.test(t)) return "cliente";
  if (/^fornec/.test(t)) return "fornecedor";
  if (/^parcei/.test(t)) return "parceiro";
  if (/^outr/.test(t)) return "outros";
  return null;
}

export const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function deburr(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * "12/03/1990", "12-03-90", "1990-03-12" e a data ISO com hora viram
 * "1990-03-12". O que não for data reconhecível volta null: melhor sem
 * aniversário do que 12 de março virando 3 de dezembro.
 */
export function dataDeAniversario(raw: unknown, agora = new Date()): string | null {
  const valor = typeof raw === "string" ? raw.trim() : "";
  if (!valor) return null;
  let ano: number, mes: number, dia: number;
  const iso = valor.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(T.*)?$/);
  const br = valor.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (iso) {
    [ano, mes, dia] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (br) {
    [dia, mes] = [Number(br[1]), Number(br[2])];
    ano = Number(br[3]);
    // Ano com dois dígitos: o que passaria do ano atual é do século passado.
    if (br[3].length === 2) ano += ano + 2000 > agora.getFullYear() ? 1900 : 2000;
  } else {
    return null;
  }
  if (ano < 1900 || ano > agora.getFullYear() || mes < 1 || mes > 12 || dia < 1) return null;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** "1990-03-12" → 12/03/1990 (para a tela e para o CSV). */
export function formatarAniversario(iso: string | null | undefined, comAno = true): string {
  const m = (iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return comAno ? `${m[3]}/${m[2]}/${m[1]}` : `${m[3]}/${m[2]}`;
}

export type Endereco = { zip?: string; street?: string; number?: string; complement?: string; district?: string };

export type CampoDaFicha =
  | "name"
  | "email"
  | "document"
  | "company"
  | "tipo"
  | "birthDate"
  | "zip"
  | "street"
  | "number"
  | "complement"
  | "district"
  | "city"
  | "state"
  | "notes";

const CAMPOS_DE_ENDERECO = ["zip", "street", "number", "complement", "district"] as const;

const LIMITE: Record<CampoDaFicha, number> = {
  name: 120,
  email: 160,
  document: 20,
  company: 120,
  tipo: 20,
  birthDate: 30,
  zip: 12,
  street: 160,
  number: 20,
  complement: 80,
  district: 80,
  city: 80,
  state: 30,
  notes: 2000,
};

/** O que gravar no contato. `unset` = campos que a pessoa esvaziou. */
export type FichaNormalizada = {
  set: Record<string, unknown>;
  unset: string[];
  erro: string | null;
};

/**
 * Confere a ficha que chegou da tela ou da planilha. Só mexe nos campos que
 * vieram (PATCH parcial); string vazia = apagar o campo. CPF/CNPJ e e-mail
 * inválidos param o cadastro com o motivo; na planilha, `tolerante` descarta
 * só o campo ruim e segue com o resto da linha.
 */
export function normalizarFicha(
  body: Record<string, unknown>,
  opts: { tolerante?: boolean } = {},
): FichaNormalizada {
  const set: Record<string, unknown> = {};
  const unset: string[] = [];
  let erro: string | null = null;
  const falha = (msg: string) => {
    if (!opts.tolerante && !erro) erro = msg;
  };
  const end = (body.address && typeof body.address === "object" ? body.address : body) as Record<string, unknown>;

  const campo = (k: CampoDaFicha, valor: unknown, gravar: (v: string) => void, alvo = k as string) => {
    if (valor === undefined || valor === null) return;
    const v = String(valor).trim().slice(0, LIMITE[k]);
    if (!v) {
      unset.push(alvo);
      return;
    }
    gravar(v);
  };

  campo("name", body.name, (v) => (set.name = v.replace(/\s+/g, " ")));
  campo("company", body.company, (v) => (set.company = v));
  campo("city", body.city, (v) => (set.city = v));
  campo("notes", body.notes, (v) => (set.notes = v));
  campo("email", body.email, (v) => {
    const e = v.toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) set.email = e;
    else falha("E-mail inválido.");
  });
  campo("document", body.document, (v) => {
    const d = onlyDigits(v);
    if ((d.length === 11 && isValidCpf(d)) || (d.length === 14 && isValidCnpj(d))) set.document = d;
    else falha("CPF ou CNPJ inválido.");
  });
  campo("state", body.state, (v) => {
    const uf = v.toUpperCase();
    if (/^[A-Z]{2}$/.test(uf)) set.state = uf;
    else falha("UF com duas letras (ex.: MG).");
  });
  campo("tipo", body.tipo, (v) => {
    const t = tipoDeContato(v);
    if (t) set.tipo = t;
    else falha("Tipo inválido.");
  });
  if (body.birthDate !== undefined && body.birthDate !== null) {
    const bruto = String(body.birthDate).trim();
    if (!bruto) {
      unset.push("birthDate", "birthMonth", "birthDay");
    } else {
      const iso = dataDeAniversario(bruto);
      if (iso) {
        set.birthDate = iso;
        set.birthMonth = Number(iso.slice(5, 7));
        set.birthDay = Number(iso.slice(8, 10));
      } else {
        falha("Data de aniversário inválida.");
      }
    }
  }
  for (const k of CAMPOS_DE_ENDERECO) {
    campo(
      k,
      end[k],
      (v) => {
        if (k === "zip") {
          const cep = onlyDigits(v);
          if (cep.length === 8) set["address.zip"] = cep;
          else falha("CEP com 8 dígitos.");
        } else {
          set[`address.${k}`] = v;
        }
      },
      `address.${k}`,
    );
  }
  return { set, unset, erro };
}

// ── Importação por CSV ───────────────────────────────────────

export type CampoDoCsv = "phone" | CampoDaFicha;

export const CAMPOS_DO_CSV: Array<{ campo: CampoDoCsv; rotulo: string }> = [
  { campo: "phone", rotulo: "Telefone" },
  { campo: "name", rotulo: "Nome" },
  { campo: "email", rotulo: "E-mail" },
  { campo: "document", rotulo: "CPF/CNPJ" },
  { campo: "company", rotulo: "Empresa" },
  { campo: "tipo", rotulo: "Tipo" },
  { campo: "birthDate", rotulo: "Aniversário" },
  { campo: "zip", rotulo: "CEP" },
  { campo: "street", rotulo: "Rua" },
  { campo: "number", rotulo: "Número" },
  { campo: "complement", rotulo: "Complemento" },
  { campo: "district", rotulo: "Bairro" },
  { campo: "city", rotulo: "Cidade" },
  { campo: "state", rotulo: "UF" },
  { campo: "notes", rotulo: "Observações" },
];

/** O mapeamento da importação de público (wa/lib/audience) já reconhece
 *  telefone, nome, e-mail, documento, empresa, cidade e UF: vale o mesmo. */
const DO_PUBLICO: Partial<Record<AudienceField, CampoDoCsv>> = {
  phone: "phone",
  contactName: "name",
  email: "email",
  cnpj: "document",
  partnerTaxId: "document",
  company: "company",
  city: "city",
  state: "state",
};

/** O que a importação de público não conhece: os campos da ficha (e o
 *  "E-mail" com hífen, que lá vira "e mail" e escapa). */
const APELIDOS_DA_FICHA: Array<[CampoDoCsv, string[]]> = [
  ["email", ["email", "e mail"]],
  ["birthDate", ["aniversario", "nascimento", "data de nascimento", "data nascimento", "nasc", "birthday"]],
  ["tipo", ["tipo", "categoria", "tipo de contato"]],
  ["zip", ["cep"]],
  ["street", ["rua", "logradouro", "endereco", "avenida"]],
  ["number", ["numero", "num", "nº", "n°"]],
  ["complement", ["complemento", "compl"]],
  ["district", ["bairro"]],
  ["notes", ["observacoes", "observacao", "obs", "notas", "nota", "comentarios"]],
];

function normalizarCabecalho(h: string): string {
  return deburr(h)
    .replace(/[_\-./]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Palpite de qual coluna do arquivo vem cada campo (quem importa confere). */
export function detectarColunas(headers: string[]): Partial<Record<CampoDoCsv, string>> {
  const out: Partial<Record<CampoDoCsv, string>> = {};
  for (const [coluna, campo] of Object.entries(autoDetectMapping(headers))) {
    const nosso = campo ? DO_PUBLICO[campo] : undefined;
    if (nosso && !out[nosso]) out[nosso] = coluna;
  }
  const livres = () => headers.filter((h) => !Object.values(out).includes(h));
  for (const exato of [true, false]) {
    for (const [campo, apelidos] of APELIDOS_DA_FICHA) {
      if (out[campo]) continue;
      const hit = livres().find((h) => {
        const n = normalizarCabecalho(h);
        return apelidos.some((a) => (exato ? n === a : n.includes(a)));
      });
      if (hit) out[campo] = hit;
    }
  }
  return out;
}

export type LinhaImportada = Partial<Record<CampoDoCsv, string>>;

/** Linhas cruas do arquivo nos campos da ficha, pelo mapeamento confirmado. */
export function linhasDoCsv(
  raw: Array<Record<string, string>>,
  mapa: Partial<Record<CampoDoCsv, string>>,
): LinhaImportada[] {
  return raw.map((r) => {
    const out: LinhaImportada = {};
    for (const { campo } of CAMPOS_DO_CSV) {
      const coluna = mapa[campo];
      if (!coluna) continue;
      const v = String(r[coluna] ?? "").trim();
      if (v) out[campo] = v;
    }
    return out;
  });
}

/**
 * Junta as linhas por telefone (canônico): a mesma pessoa duas vezes na
 * planilha vira um contato, a linha de baixo completa a de cima sem apagar
 * o que ela tinha. Sem telefone válido, a linha é ignorada.
 */
export function juntarPorTelefone(linhas: LinhaImportada[]): {
  porTelefone: Map<string, FichaNormalizada["set"]>;
  ignoradas: number;
  repetidas: number;
} {
  const porTelefone = new Map<string, Record<string, unknown>>();
  let ignoradas = 0;
  let repetidas = 0;
  for (const linha of linhas) {
    const tel = parsePhoneBr(linha.phone);
    if (!tel.valid || !tel.e164) {
      ignoradas++;
      continue;
    }
    const { set } = normalizarFicha(linha as Record<string, unknown>, { tolerante: true });
    const antes = porTelefone.get(tel.e164);
    if (antes) repetidas++;
    porTelefone.set(tel.e164, { ...(antes ?? {}), ...set });
  }
  return { porTelefone, ignoradas, repetidas };
}

/** Só o que o contato ainda não tem: a planilha completa a ficha, nunca
 *  sobrescreve ("Maria" no banco não vira "MARIA S." da planilha). */
export function camposQueFaltam(
  atual: Record<string, unknown>,
  novo: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const valorAtual = (k: string) =>
    k.startsWith("address.")
      ? (atual.address as Record<string, unknown> | undefined)?.[k.slice(8)]
      : atual[k];
  for (const [k, v] of Object.entries(novo)) {
    const a = valorAtual(k);
    if (a === undefined || a === null || a === "") out[k] = v;
  }
  // Mês e dia do aniversário andam com a data.
  if (!("birthDate" in out)) {
    delete out.birthMonth;
    delete out.birthDay;
  }
  return out;
}

// ── Exportação ───────────────────────────────────────────────

/** Célula que o Excel leria como fórmula (=, +, -, @) ganha um apóstrofo. */
export function celulaSegura(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

/** Telefone do Brasil no formato que a planilha mostra e que a importação lê
 *  de volta; de fora, como está. */
export function telefoneParaCsv(phone: string): string {
  if (phone.startsWith("ig:")) return "Instagram";
  if (phone.startsWith("fb:")) return "Messenger";
  const d = phone.replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    const n = d.slice(4);
    return `(${d.slice(2, 4)}) ${n.length === 9 ? `${n.slice(0, 5)}-${n.slice(5)}` : `${n.slice(0, 4)}-${n.slice(4)}`}`;
  }
  return phone;
}

export type ContatoParaCsv = {
  phone: string;
  name?: string | null;
  email?: string | null;
  document?: string | null;
  company?: string | null;
  tipo?: string | null;
  birthDate?: string | null;
  address?: Endereco | null;
  city?: string | null;
  state?: string | null;
  notes?: string | null;
  source?: string | null;
  optOut?: boolean;
  createdAt?: Date | string | null;
};

export const CABECALHO_DO_CSV = [
  "Nome",
  "Telefone",
  "E-mail",
  "CPF/CNPJ",
  "Empresa",
  "Tipo",
  "Aniversário",
  "CEP",
  "Rua",
  "Número",
  "Complemento",
  "Bairro",
  "Cidade",
  "UF",
  "Observações",
  "Origem",
  "Opt-out",
  "Na base desde",
];

export function linhaDoCsv(c: ContatoParaCsv): string[] {
  const tipo = tipoDeContato(c.tipo) ?? "cliente";
  const desde = c.createdAt ? new Date(c.createdAt) : null;
  return [
    c.name ?? "",
    telefoneParaCsv(c.phone),
    c.email ?? "",
    c.document ?? "",
    c.company ?? "",
    ROTULO_DO_TIPO[tipo],
    formatarAniversario(c.birthDate),
    c.address?.zip ?? "",
    c.address?.street ?? "",
    c.address?.number ?? "",
    c.address?.complement ?? "",
    c.address?.district ?? "",
    c.city ?? "",
    c.state ?? "",
    c.notes ?? "",
    c.source ?? "",
    c.optOut ? "sim" : "não",
    desde && !Number.isNaN(desde.getTime()) ? desde.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "",
  ].map(celulaSegura);
}

// ── Filtro da lista (e da exportação) ────────────────────────

export type FiltroDeContatos = {
  q?: string | null;
  /** todos | cadastrados | sem_cadastro | optout | aniversariantes */
  filtro?: string | null;
  tipo?: string | null;
  /** Mês dos aniversariantes (1 a 12). */
  mes?: number | null;
};

/** Consulta do Mongo para a lista de contatos do dono (loja ou CNV). */
export function consultaDeContatos(tenantId: string | null, f: FiltroDeContatos): Record<string, unknown> {
  const query: Record<string, unknown> = { tenantId };
  const busca = (f.q ?? "").trim();
  const and: Record<string, unknown>[] = [];
  if (busca) {
    const digits = onlyDigits(busca);
    const rx = new RegExp(busca.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const or: Record<string, unknown>[] = [{ name: rx }, { email: rx }, { company: rx }];
    if (digits.length >= 3) {
      or.push({ document: new RegExp(digits) });
      or.push({ phone: new RegExp(digits) });
      // Telefone digitado com máscara ou sem DDI ainda tem que achar.
      const parsed = parsePhoneBr(busca);
      if (parsed.valid && parsed.e164) or.push({ phone: parsed.e164 });
    }
    and.push({ $or: or });
  }
  if (f.filtro === "cadastrados") query.userId = { $exists: true, $ne: null };
  else if (f.filtro === "sem_cadastro") query.userId = { $in: [null, undefined] };
  else if (f.filtro === "optout") query.optOut = true;
  else if (f.filtro === "aniversariantes" && f.mes && f.mes >= 1 && f.mes <= 12) query.birthMonth = f.mes;

  const tipo = tipoDeContato(f.tipo);
  // Sem tipo gravado é cliente (todo contato de antes da ficha).
  if (tipo === "cliente") and.push({ tipo: { $in: ["cliente", null] } });
  else if (tipo) query.tipo = tipo;

  if (and.length === 1) Object.assign(query, and[0]);
  else if (and.length > 1) query.$and = and;
  return query;
}
