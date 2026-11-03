import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { recursosDoUsuario } from '@/lib/services/recursosConta';

export const dynamic = 'force-dynamic';

/**
 * GET /api/user/recursos -> { recursos } — o que o CNV liberou para a conta de
 * quem está logado (lib/recursos.ts). O painel esconde as abas desligadas;
 * quem barra de verdade são as rotas de cada funcionalidade.
 * `recursos: null` = equipe do CNV, sem restrição.
 */
export async function GET() {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const perfis = session.user.profile ? [session.user.profile] : [];
    const r = await recursosDoUsuario(email, perfis);
    return NextResponse.json({ recursos: r?.recursos ?? null, tipo: r?.conta.tipo ?? null });
}
