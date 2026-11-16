import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import { resolveDealershipScope } from '@/lib/services/dealershipScope';
import { confirmarEstoque } from '@/lib/services/estoqueAtualizacao';

export const dynamic = 'force-dynamic';

/**
 * POST /api/dealership/estoque/confirmar
 *
 * A concessionária confirma que preços e quantidades continuam valendo: todos
 * os anúncios ativos dela (0KM e repasse) recebem a data de hoje e voltam a
 * aparecer como atualizados para o lojista. A equipe interna pode confirmar
 * em nome da loja com `?concessionariaId=`.
 */
export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        await connectDB();

        const scope = await resolveDealershipScope(session, request);
        if (scope.kind === 'none') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
        if (!scope.concessionaria) return NextResponse.json({ error: 'Concessionária não encontrada' }, { status: 404 });

        const agora = new Date();
        const { novos, repasse } = await confirmarEstoque(scope.concessionaria._id, agora);
        return NextResponse.json({ ok: true, novos, repasse, total: novos + repasse, atualizadoEm: agora.toISOString() });
    } catch (error: any) {
        console.error('[estoque] confirmar', error);
        return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
    }
}
