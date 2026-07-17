/**
 * Regra de atuação da IA de atendimento (bot externo integrado via webhook).
 *
 * Horário comercial: 08h às 18h (America/Sao_Paulo). Quando um humano atua num
 * lead, a IA pausa e volta a atuar 1 hora depois — se a retomada cair fora do
 * expediente, aguarda até as 09h (08h + 1h) do dia seguinte.
 */

// Brasil não tem horário de verão desde 2019 — offset fixo é seguro.
const TZ_OFFSET_MS = -3 * 60 * 60 * 1000;

export const BUSINESS_START_HOUR = 8;
export const BUSINESS_END_HOUR = 18;
export const IA_PAUSE_MS = 60 * 60 * 1000;

// "Relógio de parede" de São Paulo representado em campos UTC de um Date.
const toLocal = (date: Date) => new Date(date.getTime() + TZ_OFFSET_MS);
const fromLocal = (local: Date) => new Date(local.getTime() - TZ_OFFSET_MS);

export function isBusinessHours(date: Date = new Date()): boolean {
    const hour = toLocal(date).getUTCHours();
    return hour >= BUSINESS_START_HOUR && hour < BUSINESS_END_HOUR;
}

/** Momento em que a IA pode voltar a atuar após uma pausa iniciada em `from`. */
export function computeIaResumeAt(from: Date = new Date()): Date {
    const local = toLocal(from);
    const y = local.getUTCFullYear();
    const m = local.getUTCMonth();
    const d = local.getUTCDate();
    const hour = local.getUTCHours();

    // Antes do expediente: aguarda até 08h + 1h do mesmo dia
    if (hour < BUSINESS_START_HOUR) {
        return fromLocal(new Date(Date.UTC(y, m, d, BUSINESS_START_HOUR + 1)));
    }

    // Dentro do expediente: volta 1h depois, desde que ainda dentro do expediente
    if (hour < BUSINESS_END_HOUR) {
        const resumeLocal = new Date(local.getTime() + IA_PAUSE_MS);
        if (resumeLocal.getTime() <= Date.UTC(y, m, d, BUSINESS_END_HOUR)) {
            return fromLocal(resumeLocal);
        }
    }

    // Após as 18h (ou a 1h estouraria o expediente): 08h + 1h do dia seguinte
    return fromLocal(new Date(Date.UTC(y, m, d + 1, BUSINESS_START_HOUR + 1)));
}

/**
 * A IA pode atuar neste lead agora? Sem pausa registrada ela está livre;
 * pausada, só volta quando `iaResumeAt` passar (o horário comercial já está
 * embutido no cálculo de `iaResumeAt`).
 */
export function canIaAct(iaResumeAt: Date | null | undefined, now: Date = new Date()): boolean {
    if (!iaResumeAt) return true;
    return now.getTime() >= new Date(iaResumeAt).getTime();
}
