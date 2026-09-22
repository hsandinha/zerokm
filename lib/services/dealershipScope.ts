import Concessionaria from '@/models/Concessionaria';
import User from '@/models/User';

/**
 * Quem pode mexer no estoque de uma concessionária.
 *
 * Mesma regra da tabela de preços 0KM (app/api/dealership/pricing-catalog):
 * equipe interna escolhe a concessionária por `?concessionariaId=`, e o perfil
 * concessionária só enxerga a dele, resolvida pelo usuário logado — o id da
 * query é ignorado para esse perfil.
 */
export const STAFF_PROFILES = new Set(['admin', 'administrador', 'gerente', 'operador', 'operator', 'administrativo']);
export const DEALERSHIP_PROFILES = new Set(['concessionaria', 'dealership']);

export type DealershipScope =
    | { kind: 'staff'; concessionaria: any | null }
    | { kind: 'dealership'; concessionaria: any | null }
    | { kind: 'none'; concessionaria: null };

export async function resolveDealershipScope(session: any, request: Request): Promise<DealershipScope> {
    const profile = session?.user?.profile;
    const requestedId = new URL(request.url).searchParams.get('concessionariaId')?.trim() || '';

    if (profile && STAFF_PROFILES.has(profile)) {
        const concessionaria = requestedId ? await Concessionaria.findById(requestedId).catch(() => null) : null;
        return { kind: 'staff', concessionaria };
    }

    if (profile && DEALERSHIP_PROFILES.has(profile)) {
        const user = await User.findOne({ email: session.user.email }).select('dealershipId');
        const concessionaria = user?.dealershipId ? await Concessionaria.findById(user.dealershipId) : null;
        return { kind: 'dealership', concessionaria };
    }

    return { kind: 'none', concessionaria: null };
}

/** Pode alterar um registro que pertence a `concessionariaId`? */
export function canTouchDealership(scope: DealershipScope, concessionariaId: unknown): boolean {
    if (scope.kind === 'staff') return true;
    if (scope.kind === 'dealership' && scope.concessionaria) {
        return String(scope.concessionaria._id) === String(concessionariaId);
    }
    return false;
}
