// Simulador de parcela, portado do Chatrun: "quanto fica por mês?" e a conta
// invertida "o que cabe em R$ 3 mil por mês?", com a taxa, a entrada mínima e
// os prazos que a loja configurou (WaStore.financiamento).
//
// A conta é do sistema, nunca do modelo: a IA chama a ferramenta e recebe as
// linhas prontas (modelo de linguagem erra conta de juros com confiança).
// Tabela Price (parcela fixa), que é como loja e banco simulam no balcão.
// Puro, sem banco.

export type ConfigDoSimulador = {
  ligado: boolean;
  /** Juros ao mês, em %. Ex.: 1,79. */
  taxaMensal: number;
  /** Entrada mínima, em % do valor. Ex.: 20. */
  entradaMinima: number;
  /** Prazos oferecidos, em meses. Ex.: [24, 36, 48, 60]. */
  prazos: number[];
  /** O que vai junto de toda simulação ("Sujeito à aprovação de crédito"). */
  observacao: string | null;
};

export const SIMULADOR_PADRAO: ConfigDoSimulador = {
  ligado: false,
  taxaMensal: 1.79,
  entradaMinima: 20,
  prazos: [24, 36, 48, 60],
  observacao: "Simulação sujeita à aprovação de crédito.",
};

/** Configuração da loja → simulador. Ausente ou inválido = desligado. */
export function lerSimulador(bruto: unknown): ConfigDoSimulador {
  const o = bruto && typeof bruto === "object" ? (bruto as Record<string, unknown>) : {};
  const num = (v: unknown, padrao: number, min: number, max: number) => {
    const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
    return Number.isFinite(n) && n >= min && n <= max ? n : padrao;
  };
  const prazos = (Array.isArray(o.prazos) ? o.prazos : SIMULADOR_PADRAO.prazos)
    .map((p) => Math.round(Number(p)))
    .filter((p) => Number.isFinite(p) && p >= 1 && p <= 420);
  return {
    ligado: o.ligado === true,
    taxaMensal: num(o.taxaMensal, SIMULADOR_PADRAO.taxaMensal, 0, 15),
    entradaMinima: num(o.entradaMinima, SIMULADOR_PADRAO.entradaMinima, 0, 95),
    prazos: [...new Set(prazos)].sort((a, b) => a - b).slice(0, 8),
    observacao: typeof o.observacao === "string" && o.observacao.trim() ? o.observacao.trim().slice(0, 200) : null,
  };
}

/** Parcela fixa (Price). Taxa zero = valor dividido pelo prazo. */
export function parcelaPrice(financiado: number, taxaMensalPct: number, meses: number): number {
  if (financiado <= 0 || meses <= 0) return 0;
  const i = taxaMensalPct / 100;
  if (i === 0) return financiado / meses;
  return (financiado * i) / (1 - Math.pow(1 + i, -meses));
}

/** Quanto dá para financiar com uma parcela (a conta invertida). */
export function financiavelComParcela(parcela: number, taxaMensalPct: number, meses: number): number {
  if (parcela <= 0 || meses <= 0) return 0;
  const i = taxaMensalPct / 100;
  if (i === 0) return parcela * meses;
  return (parcela * (1 - Math.pow(1 + i, -meses))) / i;
}

const reais = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const reaisInteiros = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });

export type PedidoDeSimulacao = {
  /** Preço do bem. Sem ele, só a conta invertida é possível. */
  valor?: number | null;
  /** Entrada em reais que a pessoa disse ter. */
  entrada?: number | null;
  /** Prazo que a pessoa pediu; sem ele, os prazos da unidade. */
  prazo?: number | null;
  /** "Cabe R$ 2.000 por mês": a conta invertida. */
  parcelaDesejada?: number | null;
};

export type ResultadoDaSimulacao = {
  linhas: string[];
  /** Algo impediu a conta (sem valor e sem parcela, entrada maior que o valor...). */
  aviso: string | null;
};

/** As linhas que a IA repete para a cliente. Cada uma já diz entrada,
 *  prazo e parcela; a última sempre traz a taxa e a observação. */
export function simular(config: ConfigDoSimulador, pedido: PedidoDeSimulacao): ResultadoDaSimulacao {
  const positivo = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
  const valor = positivo(pedido.valor);
  const entradaDita = positivo(pedido.entrada);
  const parcelaDesejada = positivo(pedido.parcelaDesejada);
  const prazoPedido = positivo(pedido.prazo);
  const prazos = prazoPedido ? [Math.min(420, Math.round(prazoPedido))] : config.prazos;
  const linhas: string[] = [];
  let aviso: string | null = null;

  if (valor) {
    const minima = (valor * config.entradaMinima) / 100;
    const entrada = Math.max(entradaDita ?? 0, minima);
    if (entrada >= valor) {
      aviso = "A entrada cobre o valor inteiro: não há o que financiar.";
    } else {
      const financiado = valor - entrada;
      const base =
        entradaDita && entradaDita < minima
          ? `A entrada mínima é ${config.entradaMinima}% (${reaisInteiros(minima)}); a conta usa esse valor.`
          : null;
      if (base) linhas.push(base);
      for (const n of prazos) {
        linhas.push(
          `${n}x de ${reais(parcelaPrice(financiado, config.taxaMensal, n))} (valor ${reaisInteiros(valor)}, entrada ${reaisInteiros(entrada)}, financiando ${reaisInteiros(financiado)})`,
        );
      }
    }
  }

  if (parcelaDesejada) {
    for (const n of prazos) {
      const financiavel = financiavelComParcela(parcelaDesejada, config.taxaMensal, n);
      // Com a entrada que a pessoa tem, ou com a entrada mínima da unidade.
      const precoMaximo = entradaDita
        ? financiavel + entradaDita
        : config.entradaMinima < 100
          ? financiavel / (1 - config.entradaMinima / 100)
          : financiavel;
      const entrada = precoMaximo - financiavel;
      linhas.push(
        `Com parcela de ${reaisInteiros(parcelaDesejada)} em ${n}x: até ${reaisInteiros(precoMaximo)} (entrada ${reaisInteiros(entrada)}, financiando ${reaisInteiros(financiavel)})`,
      );
    }
  }

  if (!valor && !parcelaDesejada) aviso = "Falta o valor do bem ou a parcela que a pessoa quer pagar.";
  if (linhas.length) {
    linhas.push(
      `Taxa usada: ${config.taxaMensal.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% ao mês (tabela Price).${config.observacao ? ` ${config.observacao}` : ""}`,
    );
  }
  return { linhas, aviso };
}

/** Valores em reais escritos de jeito brasileiro ("2 mil", "R$ 2.500,00",
 *  "2500"): a ferramenta recebe número, mas o modelo às vezes manda texto. */
export function numeroDeReais(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : null;
  const s = String(v ?? "").toLowerCase().replace(/r\$|\s/g, "");
  if (!s) return null;
  const mil = /mil$/.test(s);
  const limpo = s.replace(/mil$/, "");
  // "2.500,00" → 2500.00 ; "2,5" → 2.5 ; "2500.50" → 2500.5
  const normal = /,\d{1,2}$/.test(limpo) ? limpo.replace(/\./g, "").replace(",", ".") : limpo.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(normal);
  if (!Number.isFinite(n) || n <= 0) return null;
  return mil ? n * 1000 : n;
}

/** Adaptador do formato salvo na loja (WaStore.financiamento). */
export function simuladorDaLoja(f: {
  ativo?: boolean;
  taxaMensal?: number;
  entradaMinimaPct?: number;
  prazos?: number[];
  observacao?: string;
} | null | undefined): ConfigDoSimulador {
  return lerSimulador({
    ligado: f?.ativo === true,
    taxaMensal: f?.taxaMensal,
    entradaMinima: f?.entradaMinimaPct,
    prazos: f?.prazos,
    observacao: f?.observacao ?? SIMULADOR_PADRAO.observacao,
  });
}
