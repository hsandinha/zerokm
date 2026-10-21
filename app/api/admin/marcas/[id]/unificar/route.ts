import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import { ErroMarca, unificarMarcas } from '@/lib/services/catalogoMarcas';
import { PERFIS_MARCAS } from '@/lib/utils/permissoesCatalogo';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Passa variações, anúncios, lojas e favoritos da marca [id] para `destinoId` e apaga [id]. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!PERFIS_MARCAS.has(session.user?.profile || '')) return NextResponse.json({ error: 'Seu perfil não pode unificar marcas' }, { status: 403 });

    try {
        await connectDB();
        const { id } = await params;
        const body = await request.json().catch(() => ({}));
        const destinoId = typeof body?.destinoId === 'string' ? body.destinoId : '';
        if (!destinoId) return NextResponse.json({ error: 'Escolha a marca que fica.' }, { status: 400 });
        const resultado = await unificarMarcas(id, destinoId);
        console.info(`[marcas] ${session.user?.email} unificou ${resultado.origem} em ${resultado.destino}`, resultado);
        return NextResponse.json(resultado);
    } catch (error: any) {
        if (error instanceof ErroMarca) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Erro ao unificar marcas:', error);
        return NextResponse.json({ error: error?.message || 'Erro interno' }, { status: 500 });
    }
}
