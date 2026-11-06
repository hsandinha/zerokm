// Período dos Resultados (hoje, 7 dias, 30 dias, este mês, mês passado ou
// datas escolhidas), no dia de Brasília: a Vercel roda em UTC e "hoje" para a
// loja é o dia de São Paulo (fixo em UTC-3, como em wa/lib/horario.ts).
// Puro, sem banco: roda na tela e no servidor.

export type PeriodoId = "hoje" | "7d" | "30d" | "mes" | "mes_passado" | "datas";

export const PERIODOS: Array<{ id: PeriodoId; rotulo: string }> = [
  { id: "hoje", rotulo: "Hoje" },
  { id: "7d", rotulo: "7 dias" },
  { id: "30d", rotulo: "30 dias" },
  { id: "mes", rotulo: "Este mês" },
  { id: "mes_passado", rotulo: "Mês passado" },
  { id: "datas", rotulo: "Escolher datas" },
];

export function isPeriodo(v: unknown): v is PeriodoId {
  return PERIODOS.some((p) => p.id === v);
}

const OFFSET_MS = -3 * 3600_000;
const DIA_MS = 86400_000;
/** Teto das datas escolhidas: um ano de mensagens já pesa no banco. */
export const MAX_DIAS_PERIODO = 366;

/** Meia-noite (Brasília) do dia de `t`, como instante UTC. */
export function inicioDoDia(t: Date): Date {
  const local = new Date(t.getTime() + OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - OFFSET_MS);
}

/** Primeiro dia do mês (Brasília) de `t`, deslocado `meses`. */
export function inicioDoMes(t: Date, meses = 0): Date {
  const local = new Date(t.getTime() + OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + meses, 1) - OFFSET_MS);
}

/** "2026-11-06" (dia de Brasília) para meia-noite daquele dia. */
function dataLocal(valor: string | null | undefined): Date | null {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const t = Date.parse(`${valor}T00:00:00Z`);
  return Number.isNaN(t) ? null : new Date(t - OFFSET_MS);
}

export type Intervalo = { id: PeriodoId; de: Date; ate: Date; rotulo: string };

function rotuloDoDia(d: Date): string {
  const local = new Date(d.getTime() + OFFSET_MS);
  return `${String(local.getUTCDate()).padStart(2, "0")}/${String(local.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Intervalo [de, ate) do período. `ate` nunca passa de agora. */
export function intervaloDoPeriodo(
  id: PeriodoId,
  datas: { de?: string | null; ate?: string | null } = {},
  agora: Date = new Date(),
): Intervalo {
  const hoje = inicioDoDia(agora);
  switch (id) {
    case "hoje":
      return { id, de: hoje, ate: agora, rotulo: "Hoje" };
    case "7d":
      return { id, de: new Date(hoje.getTime() - 6 * DIA_MS), ate: agora, rotulo: "Últimos 7 dias" };
    case "30d":
      return { id, de: new Date(hoje.getTime() - 29 * DIA_MS), ate: agora, rotulo: "Últimos 30 dias" };
    case "mes":
      return { id, de: inicioDoMes(agora), ate: agora, rotulo: "Este mês" };
    case "mes_passado":
      return { id, de: inicioDoMes(agora, -1), ate: inicioDoMes(agora), rotulo: "Mês passado" };
    case "datas": {
      const de = dataLocal(datas.de) ?? hoje;
      const fimDia = dataLocal(datas.ate);
      let ate = fimDia ? new Date(fimDia.getTime() + DIA_MS) : new Date(hoje.getTime() + DIA_MS);
      if (ate.getTime() > agora.getTime()) ate = agora;
      const inicio = de.getTime() >= ate.getTime() ? inicioDoDia(ate) : de;
      const limitado =
        ate.getTime() - inicio.getTime() > MAX_DIAS_PERIODO * DIA_MS
          ? new Date(ate.getTime() - MAX_DIAS_PERIODO * DIA_MS)
          : inicio;
      return { id, de: limitado, ate, rotulo: `${rotuloDoDia(limitado)} a ${rotuloDoDia(new Date(ate.getTime() - 1))}` };
    }
  }
}

export function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

export function media(valores: number[]): number | null {
  if (!valores.length) return null;
  return valores.reduce((s, x) => s + x, 0) / valores.length;
}
