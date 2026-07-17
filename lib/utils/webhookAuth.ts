import Concessionaria from '@/models/Concessionaria';
import User from '@/models/User';
import { GLOBAL_PROFILES } from '@/lib/utils/crmScope';

export type WebhookAccount =
    /** `null` = pipeline global (admin/marketing). Ver lib/utils/crmScope.ts sobre por que não usar `undefined`. */
    | { ok: true; concessionariaId: string | null }
    | { ok: false };

/**
 * Autentica integrações externas pelo `webhookSecret` (token via query `?token=`
 * ou header `Authorization: Bearer`). O token pode pertencer a uma concessionária
 * ou a um usuário de perfil global.
 */
export async function resolveWebhookAccount(req: Request): Promise<WebhookAccount> {
    const authHeader = req.headers.get('authorization');
    const url = new URL(req.url);

    let token = url.searchParams.get('token');
    if (!token && authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
    }
    if (!token) return { ok: false };

    const concessionaria = await Concessionaria.findOne({ webhookSecret: token });
    if (concessionaria) {
        return { ok: true, concessionariaId: concessionaria._id.toString() };
    }

    const user: any = await User.findOne({ webhookSecret: token });
    // `profile` só existe no token da sessão; no banco o campo é `allowedProfiles`.
    const profiles: string[] = user?.allowedProfiles ?? [];
    if (user && profiles.some(p => GLOBAL_PROFILES.includes(p))) {
        return { ok: true, concessionariaId: null };
    }

    return { ok: false };
}
