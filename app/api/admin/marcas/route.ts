import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import { resumoDasMarcas } from '@/lib/services/catalogoMarcas';
import { PERFIS_CATALOGO, PERFIS_MARCAS } from '@/lib/utils/permissoesCatalogo';

export const dynamic = 'force-dynamic';

/** Marcas do catálogo com uso (variações, anúncios, lojas) e suspeitas de duplicidade. */
export async function GET() {
    const session = await getServerSession(authOptions);
    const perfil = session?.user?.profile;
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!perfil || !PERFIS_CATALOGO.has(perfil)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

    try {
        await connectDB();
        const marcas = await resumoDasMarcas();
        return NextResponse.json({ marcas, podeEditar: PERFIS_MARCAS.has(perfil) });
    } catch (error: any) {
        console.error('Erro ao listar marcas do catálogo:', error);
        return NextResponse.json({ error: error?.message || 'Erro interno' }, { status: 500 });
    }
}
