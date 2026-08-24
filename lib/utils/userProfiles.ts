import type { UserProfile } from '@/lib/types/auth';

/**
 * Regras de composição de perfis, num lugar só.
 *
 * Estavam duplicadas dentro da tela Usuários (uma cópia no criar, outra no
 * editar) e a seção de Acessos do CRM seria a terceira. Grupos mutuamente
 * exclusivos: uma pessoa tem no máximo um perfil diretivo, um operacional e um
 * de cliente.
 */
export const DIRETIVO_PROFILES: UserProfile[] = ['administrador', 'gerente', 'marketing'] as UserProfile[];
export const OPERACIONAL_PROFILES: UserProfile[] = ['operador', 'vendedor', 'administrativo'] as UserProfile[];
export const CLIENT_PROFILES: UserProfile[] = ['cliente', 'gratis'] as UserProfile[];

/** Aplica o clique num perfil respeitando a exclusividade dos grupos. */
export function toggleProfileSelection(current: UserProfile[], profile: UserProfile): UserProfile[] {
    let next = [...current];

    const grupo = DIRETIVO_PROFILES.includes(profile) ? DIRETIVO_PROFILES
        : OPERACIONAL_PROFILES.includes(profile) ? OPERACIONAL_PROFILES
        : CLIENT_PROFILES.includes(profile) ? CLIENT_PROFILES
        : null;

    if (grupo) {
        next = next.filter(p => !grupo.includes(p));
        if (!current.includes(profile)) next.push(profile);
    } else if (current.includes(profile)) {
        next = next.filter(p => p !== profile);
    } else {
        next.push(profile);
    }

    return next;
}

/**
 * Cliente puro: só perfis de cliente (cliente/gratis), nenhum de equipe.
 * É quem sai da tela Equipe e passa a ser gerido exclusivamente pelo CRM.
 */
export function isClientOnly(profiles: string[] | undefined | null): boolean {
    if (!profiles || profiles.length === 0) return false;
    return profiles.every(p => (CLIENT_PROFILES as string[]).includes(p));
}
