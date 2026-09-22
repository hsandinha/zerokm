import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import Plan from '@/models/Plan';
import { resolveDealershipScope } from '@/lib/services/dealershipScope';
import { serializePlanoRepasse } from '@/lib/utils/planoRepasse';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dealership/plano-repasse?concessionariaId=
 * Situação do plano de repasse da loja e os planos de concessionária à venda.
 */
export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        await connectDB();

        const scope = await resolveDealershipScope(session, request);
        if (scope.kind === 'none') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
        if (!scope.concessionaria) return NextResponse.json({ error: 'Concessionária não encontrada' }, { status: 404 });

        const planos = await Plan.find({ publico: 'concessionaria', active: true }).sort({ price: 1 }).lean();

        return NextResponse.json({
            plano: serializePlanoRepasse(scope.concessionaria.planoRepasse),
            planos: planos.map((p: any) => ({
                id: p._id.toString(),
                name: p.name,
                description: p.description || '',
                price: p.price,
                annualPrice: typeof p.annualPrice === 'number' && p.annualPrice > 0 ? p.annualPrice : null,
                features: p.features || [],
            })),
        });
    } catch (error: any) {
        console.error('[plano-repasse] GET', error);
        return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
    }
}
