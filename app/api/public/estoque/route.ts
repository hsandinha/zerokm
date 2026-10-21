import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import DealerVehiclePrice from '@/models/DealerVehiclePrice';
import VehicleVariation from '@/models/VehicleVariation';
import { buildHomeStockPipeline, mapHomeStockSummary } from '@/lib/utils/homeStock';

export const dynamic = 'force-dynamic';

/**
 * Contagem do estoque para o número "ao vivo" da landing. Pública e sem dado
 * de loja: só os totais. A CDN guarda um minuto, então a home pode consultar
 * sem pesar no banco.
 */
export async function GET() {
    try {
        await connectDB();
        const [resumo, variacoesAtivas] = await Promise.all([
            DealerVehiclePrice.aggregate(buildHomeStockPipeline()),
            VehicleVariation.countDocuments({ ativo: true }),
        ]);
        const estoque = mapHomeStockSummary(resumo, variacoesAtivas);
        return NextResponse.json(
            { totalVehicles: estoque.totalVehicles, totalStates: estoque.totalStates, atualizadoEm: new Date().toISOString() },
            { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
        );
    } catch {
        return NextResponse.json({ error: 'Estoque indisponível' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
}
