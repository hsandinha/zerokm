import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import { ErroMarca, excluirMarca, renomearMarca } from '@/lib/services/catalogoMarcas';
import { PERFIS_MARCAS } from '@/lib/utils/permissoesCatalogo';

export const dynamic = 'force-dynamic';

async function acesso() {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!PERFIS_MARCAS.has(session.user?.profile || '')) return NextResponse.json({ error: 'Seu perfil não pode alterar marcas' }, { status: 403 });
    return null;
}

function falha(error: any, contexto: string) {
    if (error instanceof ErroMarca) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(contexto, error);
    return NextResponse.json({ error: error?.message || 'Erro interno' }, { status: 500 });
}

/** Renomeia a marca (e o nome em variações, lojas, repasse e favoritos) ou troca o tipo padrão. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const negado = await acesso();
    if (negado) return negado;
    try {
        await connectDB();
        const { id } = await params;
        const body = await request.json().catch(() => ({}));
        return NextResponse.json(await renomearMarca(id, body));
    } catch (error) {
        return falha(error, 'Erro ao renomear marca:');
    }
}

/** Exclui a marca sem uso. Marca com variação ou loja precisa ser unificada. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const negado = await acesso();
    if (negado) return negado;
    try {
        await connectDB();
        const { id } = await params;
        return NextResponse.json(await excluirMarca(id));
    } catch (error) {
        return falha(error, 'Erro ao excluir marca:');
    }
}
