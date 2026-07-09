/**
 * Filtros temporais do CRM.
 *
 * Os limites são calculados no fuso de São Paulo, não no do servidor: em produção o
 * processo roda em UTC, e um lead criado às 21h de terça já seria contado como
 * quarta-feira se usássemos a data do servidor.
 */
export const CRM_TIMEZONE = 'America/Sao_Paulo';

export const PERIOD_PRESETS = [
    { value: 'day', label: 'Hoje' },
    { value: 'week', label: 'Esta semana' },
    { value: 'month', label: 'Este mês' },
    { value: 'all', label: 'Todo o período' },
    { value: 'custom', label: 'Personalizado' },
] as const;

export type PeriodPreset = (typeof PERIOD_PRESETS)[number]['value'];

export interface Period {
    preset: PeriodPreset;
    /** Início inclusivo. `null` = sem limite inferior. */
    from: Date | null;
    /** Fim exclusivo. `null` = sem limite superior. */
    to: Date | null;
}

/** Deslocamento do fuso, em ms, no instante dado (localMs - utcMs). */
function tzOffsetMs(instant: Date): number {
    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: CRM_TIMEZONE,
        hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const p: Record<string, string> = {};
    for (const part of dtf.formatToParts(instant)) p[part.type] = part.value;

    const asIfUtc = Date.UTC(
        Number(p.year), Number(p.month) - 1, Number(p.day),
        Number(p.hour) % 24, Number(p.minute), Number(p.second),
    );
    return asIfUtc - instant.getTime();
}

/** Data local (no fuso do CRM) do instante dado. */
function zonedYmd(instant: Date): { year: number; month: number; day: number; weekday: number } {
    const local = new Date(instant.getTime() + tzOffsetMs(instant));
    return {
        year: local.getUTCFullYear(),
        month: local.getUTCMonth(),
        day: local.getUTCDate(),
        weekday: local.getUTCDay(),
    };
}

/** Instante UTC correspondente à meia-noite local de (year, month, day). */
function localMidnight(year: number, month: number, day: number): Date {
    const guess = Date.UTC(year, month, day);
    // Uma refinada basta: o offset só muda em transições de fuso, longe da meia-noite.
    const offset = tzOffsetMs(new Date(guess - tzOffsetMs(new Date(guess))));
    return new Date(guess - offset);
}

function addDays(date: Date, days: number): Date {
    const { year, month, day } = zonedYmd(date);
    return localMidnight(year, month, day + days);
}

/** Aceita 'YYYY-MM-DD' (interpretado no fuso do CRM) e devolve a meia-noite local. */
function parseLocalDate(value: string): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (!match) return null;
    const [, y, m, d] = match;
    return localMidnight(Number(y), Number(m) - 1, Number(d));
}

export function resolvePeriod(
    preset: string | null | undefined,
    from?: string | null,
    to?: string | null,
    now: Date = new Date(),
): Period {
    const { year, month, day, weekday } = zonedYmd(now);

    switch (preset) {
        case 'day': {
            const start = localMidnight(year, month, day);
            return { preset: 'day', from: start, to: addDays(start, 1) };
        }
        case 'week': {
            // Semana começa na segunda-feira.
            const daysSinceMonday = (weekday + 6) % 7;
            const start = localMidnight(year, month, day - daysSinceMonday);
            return { preset: 'week', from: start, to: addDays(start, 7) };
        }
        case 'month': {
            const start = localMidnight(year, month, 1);
            return { preset: 'month', from: start, to: localMidnight(year, month + 1, 1) };
        }
        case 'custom': {
            const start = from ? parseLocalDate(from) : null;
            const endDay = to ? parseLocalDate(to) : null;
            // `to` é um dia inclusivo para quem escolhe no calendário; vira limite exclusivo.
            const end = endDay ? addDays(endDay, 1) : null;
            if (!start && !end) return { preset: 'all', from: null, to: null };
            return { preset: 'custom', from: start, to: end };
        }
        default:
            return { preset: 'all', from: null, to: null };
    }
}

/** Filtro Mongo para um campo de data. `{}` quando o período é "todo o período". */
export function periodFilter(period: Period, field = 'createdAt'): Record<string, any> {
    if (!period.from && !period.to) return {};

    const range: Record<string, Date> = {};
    if (period.from) range.$gte = period.from;
    if (period.to) range.$lt = period.to;
    return { [field]: range };
}

export function resolvePeriodFromRequest(url: URL): Period {
    return resolvePeriod(
        url.searchParams.get('preset'),
        url.searchParams.get('from'),
        url.searchParams.get('to'),
    );
}
