// Recortes de tempo no fuso de Brasília. A Vercel roda em UTC e "hoje" para a
// operação é o dia de São Paulo — contar por UTC desloca as métricas em 3h.

const TZ = "America/Sao_Paulo";

/** Meia-noite local de hoje (ou de N dias atrás), em ISO. */
export function startOfDayIso(timeZone: string = TZ, daysBack = 0): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "01";
  // Meia-noite local convertida com o deslocamento atual — aproximação boa o
  // bastante para contar o dia (o Brasil não tem mais horário de verão).
  const local = new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00`);
  const offsetMs = now.getTime() - new Date(now.toLocaleString("en-US", { timeZone })).getTime();
  return new Date(local.getTime() + offsetMs - daysBack * 86_400_000).toISOString();
}

/** Primeiro dia do mês corrente, meia-noite local. */
export function startOfMonthIso(timeZone: string = TZ): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "01";
  const local = new Date(`${get("year")}-${get("month")}-01T00:00:00`);
  const offsetMs = now.getTime() - new Date(now.toLocaleString("en-US", { timeZone })).getTime();
  return new Date(local.getTime() + offsetMs).toISOString();
}

export function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export function minutesAgoIso(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

/** Rótulo curto do dia da semana de um ISO, no fuso local. */
export function weekdayLabel(iso: string, timeZone: string = TZ): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone, weekday: "short" })
    .format(new Date(iso))
    .replace(".", "");
}

/** Chave yyyy-mm-dd de um instante, no fuso local — para agrupar por dia. */
export function dayKey(iso: string, timeZone: string = TZ): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}
