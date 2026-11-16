import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { ehPerfilDaLoja, lojaQueGerencia } from '@/lib/utils/atendentesLoja';

/**
 * Quem está chamando as rotas de atendentes e de qual concessionária:
 * o titular (sempre a dele, lida do banco) ou a equipe do CNV (a de
 * `?concessionariaId=`). Atendente e os demais perfis recebem 403.
 */
export type EscopoAtendentes =
    | { ok: true; concessionariaId: string; comoEquipeCnv: boolean; email: string | null }
    | { ok: false; status: number; error: string };

export async function escopoDosAtendentes(request: Request): Promise<EscopoAtendentes> {
    const session = await getServerSession(authOptions);
    const perfil = (session?.user as any)?.profile as string | undefined;
    const email = session?.user?.email || null;
    if (!session?.user || !email || !perfil) return { ok: false, status: 401, error: 'Não autorizado.' };

    await connectDB();
    const usuario = ehPerfilDaLoja(perfil)
        ? await User.findOne({ email }).select('dealershipId papelLoja atendenteInativo').lean() as any
        : null;
    const loja = lojaQueGerencia({
        perfil,
        usuario,
        concessionariaPedida: new URL(request.url).searchParams.get('concessionariaId'),
    });
    return loja.ok ? { ...loja, email } : loja;
}
