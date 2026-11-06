// Ficha do carro do pátio do lojista (estoque local): situação, campos além
// do que o repasse já tem, o cartão que vai para o cliente e o painel do dono.
//
// Arquivo puro (sem banco): a tela monta o formulário e o painel com ele, as
// rotas validam o que chega e a conversa e a IA escrevem o cartão. Os campos
// de base (marca, modelo, ano, km, preço, cor, câmbio, combustível,
// opcionais, FIPE) continuam validados por lib/utils/repasse.ts, a mesma regra
// do repasse da concessionária; aqui só o que é do pátio.

export type SituacaoCarro = "disponivel" | "reservado" | "vendido" | "pausado";

export const SITUACOES: Array<{ chave: SituacaoCarro; rotulo: string; dica: string }> = [
  { chave: "disponivel", rotulo: "Disponível", dica: "A IA oferece e a equipe manda na conversa." },
  { chave: "reservado", rotulo: "Reservado", dica: "Segurado para um cliente: a IA não oferece." },
  { chave: "vendido", rotulo: "Vendido", dica: "Fica na lista para o histórico, fora das ofertas." },
  { chave: "pausado", rotulo: "Pausado", dica: "Fora das ofertas por um tempo (oficina, documentação)." },
];

export const MAX_FOTOS = 15;

/** Passou disto no pátio, o painel aponta como parado. */
export const DIAS_PARADO = 60;

const DIA = 86_400_000;

export function ehSituacao(v: unknown): v is SituacaoCarro {
  return v === "disponivel" || v === "reservado" || v === "vendido" || v === "pausado";
}

/** Carro antigo (cadastrado antes da situação) é disponível. */
export function situacaoDe(c: { situacao?: string | null }): SituacaoCarro {
  return ehSituacao(c.situacao) ? c.situacao : "disponivel";
}

export function rotuloDaSituacao(s: string | null | undefined): string {
  return SITUACOES.find((x) => x.chave === s)?.rotulo ?? "Disponível";
}

/**
 * Filtro do Mongo para "pode ser oferecido". Usa $nin em vez de igualdade
 * para o carro sem o campo (de antes da situação, e todo o repasse da
 * concessionária) continuar valendo como disponível.
 */
export const FILTRO_OFERECIVEL = { situacao: { $nin: ["reservado", "vendido", "pausado"] } } as const;

// ── Validação dos campos do pátio ────────────────────────────

export type FichaLocal = {
  versao?: string;
  portas?: number;
  aceitaTroca?: boolean;
  unicoDono?: boolean;
  placaInterna?: string;
  precoFipe?: number;
  referenciaFipe?: string;
  situacao?: SituacaoCarro;
};

const texto = (v: unknown, max: number) =>
  (typeof v === "string" ? v : typeof v === "number" ? String(v) : "").trim().slice(0, max);

function simNao(v: unknown): boolean | undefined | null {
  if (typeof v === "boolean") return v;
  const s = texto(v, 10).toLowerCase();
  if (!s) return undefined;
  if (/^(sim|s|true|1)$/.test(s)) return true;
  if (/^(nao|não|n|false|0)$/.test(s)) return false;
  return null;
}

/** "R$ 85.900,00", "85900", "85.900" → 85900. Vazio → null. */
export function reais(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? v : null;
  const raw = texto(v, 30).replace(/\s|R\$/gi, "");
  if (!raw) return null;
  const n = Number(raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/\.(?=\d{3}(\D|$))/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Placa brasileira, antiga (ABC1234) ou Mercosul (ABC1D23). */
export function normalizarPlaca(v: unknown): string | null {
  const p = texto(v, 12).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!p) return "";
  return /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(p) ? p : null;
}

/**
 * Valida os campos do pátio. `partial` = edição: só o que veio no corpo.
 * Campo vazio na edição apaga (null no `data`, que vira $unset no save).
 */
export function validarFichaLocal(
  input: Record<string, unknown>,
  partial = false,
): { data: Record<string, unknown>; errors: string[] } {
  const errors: string[] = [];
  const data: Record<string, unknown> = {};
  const has = (k: string) => !partial || Object.prototype.hasOwnProperty.call(input, k);

  if (has("versao")) data.versao = texto(input.versao, 120).toUpperCase() || undefined;

  if (has("portas")) {
    const s = texto(input.portas, 3);
    if (!s) data.portas = undefined;
    else if (/^[2-5]$/.test(s)) data.portas = Number(s);
    else errors.push("Portas: use um número de 2 a 5.");
  }

  for (const k of ["aceitaTroca", "unicoDono"] as const) {
    if (!has(k)) continue;
    const v = simNao(input[k]);
    if (v === null) errors.push(`${k === "aceitaTroca" ? "Aceita troca" : "Único dono"}: responda sim ou não.`);
    else data[k] = v;
  }

  if (has("placaInterna")) {
    const p = normalizarPlaca(input.placaInterna);
    if (p === null) errors.push("Placa inválida. Use ABC1234 ou ABC1D23.");
    else data.placaInterna = p || undefined;
  }

  if (has("precoFipe")) {
    const s = texto(input.precoFipe, 30);
    const n = s ? reais(s) : null;
    if (s && n === null) errors.push("Preço FIPE inválido.");
    else data.precoFipe = n ?? undefined;
  }

  if (has("referenciaFipe")) data.referenciaFipe = texto(input.referenciaFipe, 40) || undefined;

  if (has("situacao")) {
    const s = texto(input.situacao, 20) || "disponivel";
    if (ehSituacao(s)) data.situacao = s;
    else errors.push("Situação inválida.");
  }

  return { data, errors };
}

/** Os dois anos do formulário viram o "ano" que o repasse entende (21/22). */
export function anoDoFormulario(fabricacao: unknown, modelo: unknown): string {
  const f = texto(fabricacao, 4);
  const m = texto(modelo, 4);
  if (f && m && f !== m) return `${f}/${m}`;
  return m || f;
}

// ── Cartão para o cliente ────────────────────────────────────

/** O que o cartão lê. Serve para a oferta do estoque (wa/lib/estoque.ts) e
 *  para o carro da lista do pátio. */
export type DadosDoCartao = {
  origem: "0km" | "usado" | "local";
  titulo: string;
  ano: string;
  km: number | null;
  cores: string[];
  combustivel: string | null;
  cambio: string | null;
  preco: number;
  prazoDias: number | null;
  opcionais?: string | null;
  portas?: number | null;
  unicoDono?: boolean | null;
  aceitaTroca?: boolean | null;
};

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/**
 * Cartão do carro no formato do WhatsApp (*negrito*). Sem a origem nem a
 * concessionária (o cliente final não vê de onde vem o carro) e nunca a placa
 * nem o preço FIPE. O carro do pátio leva a ficha inteira; o 0km e o repasse,
 * o resumo de sempre.
 */
export function cartaoDoCarro(o: DadosDoCartao): string {
  const local = o.origem === "local";
  const linhas = [
    `🚗 *${[o.titulo, o.ano].filter(Boolean).join(" ")}*`,
    [o.origem === "0km" ? "0 km" : o.km != null ? `${o.km.toLocaleString("pt-BR")} km` : null, o.cambio, o.combustivel]
      .filter(Boolean)
      .join(" · "),
    [o.cores.length ? `Cor: ${o.cores.slice(0, 4).join(", ")}` : null, local && o.portas ? `${o.portas} portas` : null]
      .filter(Boolean)
      .join(" · "),
    local ? [o.unicoDono ? "Único dono" : null, o.aceitaTroca ? "Aceita troca" : null].filter(Boolean).join(" · ") : null,
    local && o.opcionais?.trim() ? `Opcionais: ${o.opcionais.trim().slice(0, 300)}` : null,
    `💰 ${BRL.format(o.preco)}`,
    o.origem === "0km" && o.prazoDias ? `Entrega em cerca de ${o.prazoDias} dias` : null,
  ];
  // A legenda de foto no WhatsApp vai até 1024 caracteres.
  return linhas.filter(Boolean).join("\n").slice(0, 1024);
}

// ── Painel do dono ───────────────────────────────────────────

export type CarroDoPainel = {
  id: string;
  titulo: string;
  marca: string;
  preco: number;
  situacao: SituacaoCarro;
  fotos: number;
  /** Quando entrou no pátio (cadastro). */
  createdAt: string | Date;
};

export type LinhaDoPainel = { id: string; titulo: string; dias: number; preco: number };

export type PainelDoEstoque = {
  /** Disponíveis (o que está à venda agora). */
  quantidade: number;
  /** Soma dos preços dos disponíveis: o dinheiro parado no pátio. */
  capital: number;
  porMarca: Array<{ marca: string; quantidade: number; capital: number }>;
  parados: { quantidade: number; capital: number; lista: LinhaDoPainel[] };
  semFoto: { quantidade: number; lista: LinhaDoPainel[] };
  reservados: number;
};

export function diasNoPatio(createdAt: string | Date, agora: Date): number {
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((agora.getTime() - t) / DIA));
}

/** "CHEVROLET", "chevrolet" e "Chevrolet" são a mesma marca. */
export function nomeDaMarca(m: string): string {
  const s = (m ?? "").trim();
  if (!s) return "Sem marca";
  return s.length <= 3 ? s.toUpperCase() : s[0].toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Conta do painel no topo do estoque. Pesa só o disponível: reservado já tem
 * dono, vendido e pausado não estão à venda.
 */
export function painelDoEstoque(carros: CarroDoPainel[], agora: Date = new Date(), maxNaLista = 6): PainelDoEstoque {
  const disponiveis = carros.filter((c) => c.situacao === "disponivel");
  const linha = (c: CarroDoPainel): LinhaDoPainel => ({
    id: c.id,
    titulo: c.titulo,
    dias: diasNoPatio(c.createdAt, agora),
    preco: c.preco || 0,
  });

  const marcas = new Map<string, { quantidade: number; capital: number }>();
  for (const c of disponiveis) {
    const m = nomeDaMarca(c.marca);
    const atual = marcas.get(m) ?? { quantidade: 0, capital: 0 };
    atual.quantidade += 1;
    atual.capital += c.preco || 0;
    marcas.set(m, atual);
  }
  const porMarca = [...marcas.entries()]
    .map(([marca, v]) => ({ marca, ...v }))
    .sort((a, b) => b.quantidade - a.quantidade || b.capital - a.capital || a.marca.localeCompare(b.marca, "pt-BR"));

  const parados = disponiveis
    .map(linha)
    .filter((l) => l.dias > DIAS_PARADO)
    .sort((a, b) => b.dias - a.dias);
  const semFoto = disponiveis
    .filter((c) => c.fotos === 0)
    .map(linha)
    .sort((a, b) => b.preco - a.preco);

  return {
    quantidade: disponiveis.length,
    capital: disponiveis.reduce((s, c) => s + (c.preco || 0), 0),
    porMarca,
    parados: {
      quantidade: parados.length,
      capital: parados.reduce((s, l) => s + l.preco, 0),
      lista: parados.slice(0, maxNaLista),
    },
    semFoto: { quantidade: semFoto.length, lista: semFoto.slice(0, maxNaLista) },
    reservados: carros.filter((c) => c.situacao === "reservado").length,
  };
}
