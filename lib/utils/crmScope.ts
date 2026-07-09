import type { Session } from 'next-auth';
import User from '@/models/User';

/**
 * Escopo de acesso ao CRM. `concessionariaId: null` é o pipeline global (admin/marketing).
 *
 * Use `null`, nunca `undefined`. Hoje os dois filtram igual, porque o driver serializa
 * `undefined` como o tipo BSON `undefined` (depreciado) e o servidor o equipara a null.
 * Mas se a conexão passar a usar `ignoreUndefined: true`, a chave some do filtro: a
 * consulta vira `{ ativo: true }` e devolve os leads de todas as concessionárias.
 */
export type CrmScope =
    | { ok: true; concessionariaId: string | null }
    | { ok: false; error: string; status: number };

export const GLOBAL_PROFILES = ['admin', 'administrador', 'marketing'];
const DEALERSHIP_PROFILES = ['concessionaria', 'dealership'];

export async function resolveCrmScope(session: Session | null): Promise<CrmScope> {
    if (!session?.user) {
        return { ok: false, error: 'Unauthorized', status: 401 };
    }

    const profile = (session.user as any).profile;

    if (GLOBAL_PROFILES.includes(profile)) {
        return { ok: true, concessionariaId: null };
    }

    if (DEALERSHIP_PROFILES.includes(profile)) {
        const user = await User.findOne({ email: session.user.email });
        if (!user?.dealershipId) {
            return { ok: false, error: 'Concessionária não vinculada', status: 400 };
        }
        return { ok: true, concessionariaId: user.dealershipId };
    }

    return { ok: false, error: 'Acesso negado ao CRM', status: 403 };
}
