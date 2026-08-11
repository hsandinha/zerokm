/**
 * Prazo de entrega, em dias. Zero significa "Pronta Entrega".
 *
 * A regra vive aqui porque três lugares precisam concordar sobre ela: a edição
 * no catálogo da concessionária, a edição na consulta de veículos e a
 * importação do CSV. Cada cópia solta seria uma chance de divergir.
 */

/** Aceita "Pronta Entrega", "pronta", "0" e número de dias. */
export function parsePrazo(value: string | undefined | null): number | null {
    const norm = (value ?? '').trim().toLowerCase();
    if (norm === '') return null;
    if (norm === 'pronta entrega' || norm === 'pronta') return 0;

    const dias = parseInt(norm, 10);
    return Number.isFinite(dias) && dias >= 0 ? dias : null;
}

/** Texto exibido na tabela: "Pronta Entrega", "30 dias" ou "-". */
export function formatPrazo(prazo: number | null | undefined): string {
    if (prazo === 0) return 'Pronta Entrega';
    if (typeof prazo === 'number' && prazo > 0) return `${prazo} dias`;
    return '-';
}

/** Valor que vai para o input ao começar a editar. */
export function prazoParaInput(prazo: number | null | undefined): string {
    if (prazo === 0) return 'Pronta Entrega';
    if (typeof prazo === 'number' && prazo > 0) return String(prazo);
    return '';
}
