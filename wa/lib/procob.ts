// Cliente da API da Procob + normalização das respostas.
//
// O essencial:
//   - HTTP Basic, tudo GET, documento na URL, sempre HTTP 200;
//   - `code` "000" ok / "001" sem registro / "999" erro;
//   - cada consulta é paga → toda resposta vai para `wa_lookups` e a próxima
//     leitura do mesmo documento sai do cache, não da API.
//
// Sem credenciais no ambiente o cliente usa o sandbox público da Procob, que
// devolve dados fictícios com a estrutura real — bom para desenvolver, e a
// tela avisa que é ficção.

import { ProxyAgent } from "undici";
import dbConnect from "@/lib/mongodb";
import { WaLookup, WaProcobBalance } from "@wa/models/base";
import { onlyDigits } from "@wa/lib/documento";
import { parsePhoneBr } from "@wa/lib/phone";

const BASE_URL = "https://api.procob.com/consultas/";

// A Procob libera a conta por IP e não abre mão disso. A Vercel não tem IP
// fixo, então as chamadas saem por um proxy com IP fixo. A integração do Fixie
// no Marketplace da Vercel injeta FIXIE_URL sozinha; PROCOB_PROXY_URL
// (http://usuario:senha@host:porta) tem precedência para qualquer outro proxy.
export function procobProxyUrl(): string | null {
  return process.env.PROCOB_PROXY_URL?.trim() || process.env.FIXIE_URL?.trim() || null;
}

let proxy: ProxyAgent | null | undefined;
function proxyDispatcher(): ProxyAgent | undefined {
  if (proxy === undefined) {
    const url = procobProxyUrl();
    proxy = url ? new ProxyAgent(url) : null;
  }
  return proxy ?? undefined;
}
const SANDBOX = { user: "sandbox@procob.com", pwd: "sandbox2020" };
const TIMEOUT_MS = 30_000;

export type ProcobProduct = "L0006" | "L0001";

const PATHS: Record<ProcobProduct, (document: string) => string> = {
  L0006: (d) => `v3/L0006/${d}`, // quadro societário / participações
  L0001: (d) => `v2/L0001/${d}`, // localização completa (telefones, e-mails)
};

export const PRODUCT_LABEL: Record<ProcobProduct, string> = {
  L0006: "Quadro societário",
  L0001: "Telefones e e-mails",
};

/**
 * Como reagir a cada código do envelope (tabela oficial em docs/procob-api.md):
 *   ok        — tem conteúdo (000; 023/025 com ressalva na mensagem)
 *   empty     — resposta definitiva "não há dados" para o documento
 *   blocked   — LGPD: menor de idade; também definitivo
 *   credit    — sem saldo; parar a fila
 *   auth      — usuário/senha/IP/pendência; parar a fila
 *   transient — fornecedor/produto em manutenção, consulta em andamento; tentar depois
 *   config    — erro nosso (documento/parâmetro/versão); parar a fila e corrigir
 *   error     — desconhecido
 */
export type ProcobCodeKind = "ok" | "empty" | "blocked" | "credit" | "auth" | "transient" | "config" | "error";

export const PROCOB_CODES: Record<string, { kind: ProcobCodeKind; label: string }> = {
  "000": { kind: "ok", label: "Registro efetuado com sucesso" },
  "009": { kind: "ok", label: "Operação realizada com sucesso" },
  "023": { kind: "ok", label: "Pesquisa realizada, mas pode estar incompleta (sócios PJ com múltiplos níveis)" },
  "025": { kind: "ok", label: "Pesquisa concluída com dados do cache da Procob (fornecedor instável)" },
  "001": { kind: "empty", label: "Não encontramos registros para a pesquisa" },
  "004": { kind: "empty", label: "Sem informações disponíveis" },
  "021": { kind: "empty", label: "Sem resultados encontrados para o documento" },
  "404": { kind: "empty", label: "Não existe CPF com o número informado" },
  "422": { kind: "blocked", label: "Dados de menor de idade bloqueados (LGPD)" },
  "451": { kind: "blocked", label: "Dados de menor de 16 anos bloqueados (LGPD)" },
  "002": { kind: "credit", label: "Seus créditos são inferiores ao valor da consulta" },
  "008": { kind: "auth", label: "Usuário ou senha inválidos" },
  "010": { kind: "auth", label: "Usuário não cadastrado" },
  "015": { kind: "auth", label: "Usuário sem acesso a partir deste IP" },
  "017": { kind: "auth", label: "Usuário sem acesso a partir deste IP — liberação solicitada ao gestor da conta" },
  "777": { kind: "auth", label: "Acesso com pendências administrativas na Procob" },
  "888": { kind: "auth", label: "Autenticação de dois fatores exigida — falar com o suporte Procob" },
  "006": { kind: "transient", label: "Fornecedor da consulta em manutenção — tente em alguns minutos" },
  "007": { kind: "transient", label: "Produto em manutenção — tente em alguns minutos" },
  "561": { kind: "transient", label: "Já existe uma consulta em andamento para este documento — aguarde alguns segundos" },
  "020": { kind: "transient", label: "Erro ao realizar a consulta" },
  "900": { kind: "transient", label: "Erro de execução na Procob — se persistir, acionar o suporte" },
  "003": { kind: "config", label: "Tipo de documento inválido para esta consulta" },
  "005": { kind: "config", label: "É necessário passar parâmetros via GET" },
  "012": { kind: "config", label: "Data de nascimento obrigatória para o documento informado" },
  "013": { kind: "config", label: "Versão incompatível — falar com o comercial da Procob" },
  "019": { kind: "config", label: "Número máximo de features excedido" },
  "022": { kind: "config", label: "Corpo da requisição excedeu 3 MB" },
  "700": { kind: "config", label: "Versão do produto descontinuada — atualizar a versão na URL" },
  "999": { kind: "error", label: "Não foi possível concluir a operação" },
};

export function classifyCode(code: string, message?: string | null): { kind: ProcobCodeKind; label: string } {
  const known = PROCOB_CODES[code];
  if (known && known.kind !== "error") return known;
  // 999 (e código desconhecido) vem com a mensagem real — "rota não existe",
  // "usuário ou senha inválidos", "sem acesso através deste ip"…: o texto é
  // que diz se adianta insistir.
  const m = (message ?? "").toLowerCase();
  if (/\bip\b|senha|usu[aá]rio|autentica/.test(m)) return { kind: "auth", label: message ?? "Acesso negado" };
  if (/saldo|cr[ée]dito/.test(m)) return { kind: "credit", label: message ?? "Sem saldo" };
  if (/rota|vers[aã]o|par[aâ]metro/.test(m)) return { kind: "config", label: message ?? "Requisição inválida" };
  if (/manuten|instab|aguarde/.test(m)) return { kind: "transient", label: message ?? "Indisponível no momento" };
  return { kind: "error", label: message || `Código ${code} não documentado` };
}

export class ProcobError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly kind: ProcobCodeKind = "error",
  ) {
    super(message);
    this.name = "ProcobError";
  }

  /** HTTP que a nossa API devolve para a tela. */
  get httpStatus(): number {
    switch (this.kind) {
      case "auth":
        return 403;
      case "credit":
        return 402;
      case "transient":
        return 503;
      case "config":
        return 400;
      default:
        return 502;
    }
  }
}

export function procobCredentials(): { user: string; pwd: string; sandbox: boolean } {
  const user = process.env.PROCOB_API_USER?.trim();
  const pwd = process.env.PROCOB_API_PWD?.trim();
  if (user && pwd) return { user, pwd, sandbox: false };
  return { ...SANDBOX, sandbox: true };
}

// A Procob devolve mensagens com entidades HTML ("N&atilde;o encontramos…").
const ENTITIES: Record<string, string> = {
  atilde: "ã", aacute: "á", agrave: "à", acirc: "â", eacute: "é", ecirc: "ê",
  iacute: "í", oacute: "ó", otilde: "õ", ocirc: "ô", uacute: "ú", ccedil: "ç",
  Atilde: "Ã", Aacute: "Á", Eacute: "É", Oacute: "Ó", Ccedil: "Ç", amp: "&", quot: '"',
};
function decodeEntities(s: string): string {
  return s.replace(/&([A-Za-z]+);/g, (m, name: string) => ENTITIES[name] ?? m);
}

export type ProcobEnvelope = {
  code: string;
  message: string;
  content: unknown;
  saldo: string | null;
  sandbox: boolean;
};

export async function procobGet(path: string): Promise<ProcobEnvelope> {
  const creds = procobCredentials();
  const auth = Buffer.from(`${creds.user}:${creds.pwd}`).toString("base64");

  let res: Response;
  try {
    const dispatcher = proxyDispatcher();
    res = await fetch(BASE_URL + path, {
      headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
      ...(dispatcher ? { dispatcher } : {}),
    } as RequestInit);
  } catch (err) {
    const timeout = err instanceof Error && err.name === "TimeoutError";
    throw new ProcobError(timeout ? "A Procob demorou demais para responder" : "Não foi possível falar com a Procob");
  }
  if (!res.ok) throw new ProcobError(`A Procob respondeu HTTP ${res.status}`);

  const body = (await res.json().catch(() => null)) as {
    code?: string | number;
    message?: string;
    content?: unknown;
    saldo?: string | number | null;
  } | null;
  if (!body || typeof body !== "object") throw new ProcobError("Resposta inválida da Procob");

  const message = decodeEntities(String(body.message ?? ""));
  return {
    code: String(body.code ?? "").padStart(3, "0"),
    message,
    content: body.content ?? null,
    saldo: body.saldo == null ? null : String(body.saldo),
    sandbox: creds.sandbox || /fict[ií]cios/i.test(message),
  };
}

// ── Saldo ────────────────────────────────────────────────────
//
// A Procob não tem rota de recarga — só de consulta. O saldo, esse vem de
// graça: está no envelope de TODA resposta, e `/consultas/teste` devolve o
// envelope sem debitar. É o que alimenta o indicador do header.
//
// **Mas "sem debitar" não é "sem custo".** As chamadas saem pelo proxy de IP
// fixo (Fixie), que tem 500 requisições/mês — o mesmo orçamento das consultas
// pagas. Um poll automático de 10 em 10 minutos gastaria ~4.300/mês e comeria
// a cota inteira só para olhar um número.
//
// Por isso o header NÃO pesquisa a Procob. Ele mostra o último saldo que ela
// informou — e ela informa em toda consulta paga, de graça, via
// `rememberBalance`. Ir à Procob só acontece no clique explícito do usuário
// (`refresh`), que custa 1 requisição do proxy.

/** Acima disto o valor guardado é velho o bastante para o tooltip avisar. */
export const BALANCE_TTL_MS = 60 * 60_000;

export type ProcobBalance = {
  /** Como a Procob devolveu — string, não necessariamente número. */
  saldo: string | null;
  /** Em reais, quando o texto vira número. É o que decide o alerta. */
  amount: number | null;
  code: string | null;
  kind: ProcobCodeKind | null;
  /** Por que a última leitura não valeu (IP, senha, Procob fora do ar). */
  message: string | null;
  /** O número é o último conhecido e a releitura falhou. */
  stale: boolean;
  sandbox: boolean;
  checkedAt: string | null;
};

/** "1.234,56", "6,00", "1234.56", "R$ 1.234,56" → número. Fora disso, null. */
export function parseSaldo(saldo: string | null): number | null {
  if (!saldo) return null;
  const raw = saldo.replace(/[^\d,.-]/g, "");
  if (!raw) return null;
  // Com vírgula, ela é o decimal e o ponto é milhar (pt-BR) — é o formato que
  // a Procob usa ("6,00", "21,80").
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function balanceFrom(row: {
  saldo?: string | null;
  code?: string | null;
  message?: string | null;
  sandbox?: boolean | null;
  checkedAt?: Date | string | null;
}): ProcobBalance {
  const saldo = row.saldo ?? null;
  const code = row.code ?? null;
  const cls = code ? classifyCode(code, row.message ?? null) : null;
  return {
    saldo,
    amount: parseSaldo(saldo),
    code,
    kind: cls?.kind ?? null,
    message: cls && cls.kind !== "ok" ? row.message || cls.label : null,
    stale: false,
    sandbox: Boolean(row.sandbox),
    checkedAt: row.checkedAt ? new Date(row.checkedAt).toISOString() : null,
  };
}

/**
 * Grava o saldo que veio de carona numa resposta. Chamado em toda consulta
 * paga — é assim que o header fica certo sem nenhuma requisição extra.
 */
export async function rememberBalance(
  env: Pick<ProcobEnvelope, "saldo" | "code" | "message" | "sandbox">,
) {
  if (env.saldo == null && env.code === "000") return; // resposta boa sem saldo não diz nada
  await dbConnect();
  await WaProcobBalance.updateOne(
    {},
    {
      saldo: env.saldo,
      code: env.code,
      message: env.message,
      sandbox: env.sandbox,
      checkedAt: new Date(),
    },
    { upsert: true },
  );
}

/**
 * Último saldo que a Procob informou em qualquer resposta — a linha de saldo,
 * ou, se ela ainda não tem número, o que veio na última consulta paga
 * (`wa_lookups.saldo` é um histórico dele). Só banco, sem rede.
 */
export async function lastKnownBalance(): Promise<ProcobBalance | null> {
  await dbConnect();
  const row = await WaProcobBalance.findOne().lean();
  if (row?.saldo) return balanceFrom(row);

  const lk = await WaLookup.findOne({ saldo: { $ne: null } })
    .sort({ refreshedAt: -1 })
    .select("saldo sandbox refreshedAt")
    .lean();
  if (lk?.saldo) {
    return balanceFrom({
      saldo: lk.saldo,
      code: "000",
      sandbox: lk.sandbox,
      checkedAt: lk.refreshedAt,
    });
  }
  // Sem número nenhum: sobra o que a última tentativa disse (código do erro).
  return row ? balanceFrom(row) : null;
}
export async function getBalance(opts: { refresh?: boolean } = {}): Promise<ProcobBalance | null> {
  const known = await lastKnownBalance();
  if (!opts.refresh) return known;

  const stale = (message: string | null): ProcobBalance =>
    known?.saldo
      ? { ...known, stale: true, message }
      : {
          saldo: null,
          amount: null,
          code: known?.code ?? null,
          kind: known?.kind ?? "error",
          message: message ?? known?.message ?? null,
          stale: true,
          sandbox: false,
          checkedAt: known?.checkedAt ?? null,
        };

  let env: ProcobEnvelope;
  try {
    env = await procobGet("teste");
  } catch (err) {
    return stale(err instanceof ProcobError ? err.message : "Não foi possível falar com a Procob");
  }
  await rememberBalance(env).catch(() => {});

  const fresh = balanceFrom({ saldo: env.saldo, code: env.code, message: env.message, sandbox: env.sandbox, checkedAt: new Date() });
  // Respondeu, mas sem número (999 de IP/senha): mantém o último conhecido e
  // diz por quê — sumir com o número seria esconder o que já sabemos.
  return fresh.saldo ? fresh : stale(fresh.message);
}

// ── Índice do histórico ──────────────────────────────────────
//
// O que a tela de Pesquisas filtra (nome, telefone, e-mail) sai do JSON uma
// vez e vira coluna. Sem isso, buscar "sandinha" leria todos os `content`.

export type LookupIndex = {
  subject_name: string | null;
  phones: string[];
  emails: string[];
  summary: Record<string, number | string | null>;
};

export function buildLookupIndex(product: ProcobProduct, code: string, content: unknown): LookupIndex {
  const empty: LookupIndex = { subject_name: null, phones: [], emails: [], summary: {} };
  if (code !== "000" && code !== "023" && code !== "025" && code !== "009") return empty;

  if (product === "L0001") {
    const p = normalizePerson(content);
    return {
      subject_name: p.name,
      phones: [...new Set(p.phones.map((t) => t.value).filter(Boolean))],
      emails: [...new Set(p.emails.map((e) => e.email).filter(Boolean))],
      summary: {
        tipo: p.kind,
        celulares: p.phones.filter((t) => t.kind === "celular").length,
        telefones: p.phones.length,
        emails: p.emails.length,
        participacoes: p.participations,
        uf: p.uf,
        idade: p.age,
      },
    };
  }

  const q = normalizeQsa(content);
  return {
    subject_name: q.subject?.name ?? null,
    phones: [],
    emails: [],
    summary: {
      tipo: q.subject && q.subject.document.length === 11 ? "PF" : "PJ",
      socios: q.partners.length,
      falecidos: q.partners.filter((p) => p.deceased).length,
      participacoes: q.participations.length,
      situacao: q.subject?.status ?? null,
    },
  };
}

// ── Cache ────────────────────────────────────────────────────

export type Lookup = {
  id: string;
  product: ProcobProduct;
  document: string;
  code: string;
  kind: ProcobCodeKind;
  message: string | null;
  content: unknown;
  saldo: string | null;
  sandbox: boolean;
  /** Veio do banco (sem custo) ou da API (consulta paga)? */
  cached: boolean;
  refreshedAt: string;
};

export async function getCachedLookup(
  product: ProcobProduct,
  document: string,
): Promise<Lookup | null> {
  await dbConnect();
  const data = await WaLookup.findOne({ product, document }).lean();
  if (!data) return null;
  return {
    id: String(data._id),
    product,
    document,
    code: data.code,
    kind: classifyCode(data.code, data.message).kind,
    message: data.message ?? null,
    content: data.content,
    saldo: data.saldo ?? null,
    sandbox: data.sandbox,
    cached: true,
    refreshedAt: new Date(data.refreshedAt).toISOString(),
  };
}

/** Reconsultar uma resposta mais nova que isto exige `force` — protege contra
 *  duplo-clique e contra reprocessar a mesma planilha sem querer. */
export const REFRESH_GUARD_HOURS = 24;

export class ProcobRepeatError extends ProcobError {
  constructor(
    message: string,
    readonly refreshedAt: string,
  ) {
    super(message, "repetida", "config");
    this.name = "ProcobRepeatError";
  }
}

/**
 * Consulta com cache. Só bate na API se não houver resposta guardada (ou se
 * pedirem `refresh`). Erro de acesso/saldo não é gravado — não é resposta
 * sobre o documento.
 */
export async function lookup(
  product: ProcobProduct,
  rawDocument: string,
  opts: { refresh?: boolean; force?: boolean; requestedBy?: string } = {},
): Promise<Lookup> {
  const document = onlyDigits(rawDocument);
  const cached = await getCachedLookup(product, document);
  // Regra que vale para TODO caminho (manual, CSV, base, API): o que já foi
  // pesquisado não é pesquisado de novo. Só um pedido explícito de reconsulta
  // — e, se a resposta for recente, com `force` — passa direto.
  if (!opts.refresh && cached) return cached;
  if (opts.refresh && cached && !opts.force) {
    const age = Date.now() - new Date(cached.refreshedAt).getTime();
    if (age < REFRESH_GUARD_HOURS * 3600_000) {
      throw new ProcobRepeatError(
        `Este documento foi consultado há menos de ${REFRESH_GUARD_HOURS}h. Confirme para gastar uma nova consulta.`,
        cached.refreshedAt,
      );
    }
  }

  const env = await procobGet(PATHS[product](document));
  const cls = classifyCode(env.code, env.message);
  // O saldo vem de carona na resposta da consulta paga: aproveita para
  // atualizar o header sem nenhuma chamada extra. Vale também no erro "sem
  // créditos" — é exatamente quando o número importa.
  await rememberBalance(env).catch(() => {});
  // Só respostas SOBRE o documento entram no cache (ok, vazio, bloqueado por
  // LGPD). Falha de acesso, saldo ou manutenção não é resposta — e gravar
  // faria a tela acreditar que o documento não existe.
  if (cls.kind !== "ok" && cls.kind !== "empty" && cls.kind !== "blocked") {
    throw new ProcobError(env.message || cls.label, env.code, cls.kind);
  }

  await dbConnect();
  const index = buildLookupIndex(product, env.code, env.content);
  const now = new Date();
  const saved = await WaLookup.findOneAndUpdate(
    { product, document },
    {
      code: env.code,
      message: env.message,
      content: env.content,
      saldo: env.saldo,
      sandbox: env.sandbox,
      requestedBy: opts.requestedBy,
      refreshedAt: now,
      subjectName: index.subject_name ?? undefined,
      phones: index.phones,
      emails: index.emails,
      summary: index.summary,
      indexedAt: now,
    },
    { new: true, upsert: true },
  );

  return {
    id: String(saved._id),
    product,
    document,
    code: env.code,
    kind: cls.kind,
    message: env.message,
    content: env.content,
    saldo: env.saldo,
    sandbox: env.sandbox,
    cached: false,
    refreshedAt: now.toISOString(),
  };
}


// ── Normalização: L0006 (QSA / participações) ────────────────

type Raw = Record<string, unknown>;
const asRecord = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const asArray = (v: unknown): Raw[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") as Raw[] : []);
const str = (v: unknown): string => (v == null ? "" : String(v)).trim();
const strOrNull = (v: unknown): string | null => str(v) || null;

/**
 * Sócio morto: a Receita inabilita o CPF e o QSA já devolve isso em
 * `situacao_receita` ("TITULAR FALECIDO", "CANCELADA POR ÓBITO"). Dá para
 * saber antes de gastar a L0001 — e antes de mandar WhatsApp para o falecido.
 */
export function isDeceasedStatus(status: string | null | undefined): boolean {
  return /falecid|[oó]bito/i.test(status ?? "");
}

export type QsaPartner = {
  /** CPF (11) ou CNPJ (14) do sócio, em dígitos. */
  document: string;
  kind: "PF" | "PJ";
  name: string;
  condition: string | null;
  since: string | null;
  active: boolean;
  status: string | null;
  /** `situacao_receita` acusa óbito — não consultar contatos nem abordar. */
  deceased: boolean;
  representatives: Array<{ document: string; name: string; role: string | null }>;
};

export type Participation = {
  cnpj: string;
  name: string;
  condition: string | null;
  since: string | null;
  active: boolean;
  status: string | null;
};

export type QsaResult = {
  subject: { document: string; name: string | null; status: string | null } | null;
  partners: QsaPartner[];
  participations: Participation[];
};

function partnerFrom(raw: Raw, active: boolean): QsaPartner | null {
  const document = onlyDigits(str(raw.documento_socio));
  if (document.length !== 11 && document.length !== 14) return null;
  return {
    document,
    kind: document.length === 11 ? "PF" : "PJ",
    name: str(raw.nome) || "(sem nome)",
    condition: strOrNull(raw.condicao),
    since: strOrNull(raw.data_entrada),
    active,
    status: strOrNull(raw.situacao_receita),
    deceased: isDeceasedStatus(str(raw.situacao_receita)),
    representatives: asArray(raw.representante_legal).map((r) => ({
      document: onlyDigits(str(r.documento)),
      name: str(r.nome),
      role: strOrNull(r.funcao),
    })),
  };
}

function participationFrom(raw: Raw, active: boolean): Participation | null {
  const cnpj = onlyDigits(str(raw.documento ?? raw.cnpj));
  if (cnpj.length !== 14) return null;
  return {
    cnpj,
    name: str(raw.nome ?? raw.nome_empresa) || "(sem nome)",
    condition: strOrNull(raw.condicao ?? raw.funcao_socio),
    since: strOrNull(raw.data_entrada),
    active,
    status: strOrNull(raw.situacao_receita),
  };
}

export function normalizeQsa(content: unknown): QsaResult {
  const c = asRecord(content);
  const nome = asRecord(c.nome);
  const subjectDoc = onlyDigits(str(nome.documento));

  const qsa = asRecord(c.qsa);
  const partners: QsaPartner[] = [
    ...asArray(qsa.ativos).map((r) => partnerFrom(r, true)),
    ...asArray(qsa.inativos).map((r) => partnerFrom(r, false)),
    // Formato antigo (v1): { socios: [], historico: [] }
    ...asArray(c.socios).map((r) => partnerFrom(r, true)),
  ].filter((p): p is QsaPartner => p !== null);

  const part = asRecord(c.participacoes);
  const participations: Participation[] = [
    ...asArray(part.ativos).map((r) => participationFrom(r, true)),
    ...asArray(part.inativos).map((r) => participationFrom(r, false)),
  ].filter((p): p is Participation => p !== null);

  // Mesma pessoa em dois registros (ativo + inativo) fica uma vez, ativa —
  // mas o óbito de qualquer um dos registros gruda: perder isso custaria uma
  // consulta paga e uma mensagem para quem morreu.
  const byDoc = new Map<string, QsaPartner>();
  for (const p of partners) {
    const cur = byDoc.get(p.document);
    if (!cur) byDoc.set(p.document, p);
    else if (!cur.active && p.active) byDoc.set(p.document, { ...p, deceased: p.deceased || cur.deceased });
    else if (p.deceased) cur.deceased = true;
  }
  const byCnpj = new Map<string, Participation>();
  for (const p of participations) {
    const cur = byCnpj.get(p.cnpj);
    if (!cur || (!cur.active && p.active)) byCnpj.set(p.cnpj, p);
  }

  return {
    subject: subjectDoc
      ? { document: subjectDoc, name: strOrNull(nome.nome), status: strOrNull(nome.situacao_receita) }
      : null,
    partners: [...byDoc.values()].sort((a, b) => Number(b.active) - Number(a.active)),
    participations: [...byCnpj.values()].sort((a, b) => Number(b.active) - Number(a.active)),
  };
}

// ── Normalização: L0001 (telefones, e-mails) ─────────────────

export type PhoneKind = "celular" | "fixo" | "comercial" | "outros";

export type PersonPhone = {
  kind: PhoneKind;
  ddd: string;
  number: string;
  /** Dígitos ddd+número — chave de dedupe. */
  value: string;
  e164: string | null;
  operator: string | null;
  score: number | null;
  infoAge: string | null;
  preferred: boolean;
};

export type PersonEmail = {
  email: string;
  score: number | null;
  infoAge: string | null;
  preferred: boolean;
};

export type PersonResult = {
  document: string;
  kind: "PF" | "PJ" | null;
  name: string | null;
  birthDate: string | null;
  age: string | null;
  deceased: boolean | null;
  uf: string | null;
  status: string | null;
  phones: PersonPhone[];
  emails: PersonEmail[];
  /** Quantidade de participações societárias apontada pela Procob. */
  participations: number | null;
};

function scoreOf(v: unknown): number | null {
  const n = Number(str(v));
  return Number.isFinite(n) && str(v) !== "" ? n : null;
}

function phoneFrom(raw: Raw, kind: PhoneKind, preferred = false): PersonPhone | null {
  const ddd = onlyDigits(str(raw.ddd));
  const number = onlyDigits(str(raw.telefone));
  if (ddd.length !== 2 || number.length < 8) return null;
  const parsed = parsePhoneBr(ddd + number);
  return {
    kind,
    ddd,
    number,
    value: ddd + number,
    e164: parsed.valid ? parsed.e164 : null,
    operator: strOrNull(raw.operadora),
    score: scoreOf(raw.pontuacao),
    infoAge: strOrNull(raw.idade_informacao),
    preferred,
  };
}

export function normalizePerson(content: unknown): PersonResult {
  const c = asRecord(content);

  // v2 devolve objeto; v1 devolvia array.
  const nomeRaw = asRecord(c.nome).conteudo;
  const nome = Array.isArray(nomeRaw) ? asRecord(nomeRaw[0]) : asRecord(nomeRaw);

  const tel = asRecord(asRecord(c.pesquisa_telefones).conteudo);
  const phones: PersonPhone[] = [];
  for (const kind of ["celular", "fixo", "comercial", "outros"] as PhoneKind[]) {
    for (const raw of asArray(tel[kind])) {
      const p = phoneFrom(raw, kind);
      if (p) phones.push(p);
    }
  }

  const pref = asRecord(asRecord(c.contato_preferencial).conteudo);
  const preferredPhones = [
    phoneFrom(asRecord(pref.telefone_celular), "celular", true),
    phoneFrom(asRecord(pref.telefone_fixo), "fixo", true),
    phoneFrom(asRecord(pref.telefone_outros), "outros", true),
  ].filter((p): p is PersonPhone => p !== null);

  const byValue = new Map<string, PersonPhone>();
  for (const p of phones) byValue.set(p.value, p);
  for (const p of preferredPhones) {
    const cur = byValue.get(p.value);
    if (cur) cur.preferred = true;
    else byValue.set(p.value, p);
  }

  const emails: PersonEmail[] = asArray(asRecord(c.emails).conteudo)
    .map((r) => ({
      email: str(r.email).toLowerCase(),
      score: scoreOf(r.pontuacao),
      infoAge: strOrNull(r.idade_informacao),
      preferred: false,
    }))
    .filter((e) => e.email.includes("@"));
  const prefEmail = str(asRecord(pref.email).email).toLowerCase();
  if (prefEmail.includes("@")) {
    const cur = emails.find((e) => e.email === prefEmail);
    if (cur) cur.preferred = true;
    else emails.unshift({ email: prefEmail, score: scoreOf(asRecord(pref.email).pontuacao), infoAge: null, preferred: true });
  }

  const KIND_ORDER: Record<PhoneKind, number> = { celular: 0, comercial: 1, fixo: 2, outros: 3 };
  const rank = (p: PersonPhone) =>
    KIND_ORDER[p.kind] * 100 + (p.preferred ? 0 : 10) + (p.e164 ? 0 : 5) - Math.min(9, p.score ?? 0) / 10;

  const participations = scoreOf(asRecord(asRecord(c.alerta_participacoes).conteudo).quantidade);
  const document = onlyDigits(str(nome.documento));
  const tipo = str(nome.tipo_documento).toUpperCase();

  return {
    document,
    kind: tipo === "PF" || tipo === "PJ" ? tipo : document.length === 11 ? "PF" : document.length === 14 ? "PJ" : null,
    name: strOrNull(nome.nome),
    birthDate: strOrNull(nome.data_nascimento),
    age: strOrNull(nome.idade),
    // `obito` é o campo oficial; quando vem vazio, a situação na Receita
    // ("TITULAR FALECIDO") ainda entrega o óbito.
    deceased: isDeceasedStatus(str(nome.situacao_receita))
      ? true
      : str(nome.obito)
        ? str(nome.obito).toUpperCase() === "SIM"
        : null,
    uf: strOrNull(nome.uf)?.replace(/,+$/, "") ?? null,
    status: strOrNull(nome.situacao_receita),
    phones: [...byValue.values()].sort((a, b) => rank(a) - rank(b)),
    emails: emails.sort((a, b) => Number(b.preferred) - Number(a.preferred) || (b.score ?? -99) - (a.score ?? -99)),
    participations,
  };
}
