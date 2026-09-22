import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import VehicleVariation from '@/models/VehicleVariation';

export const dynamic = 'force-dynamic';

const escapeRegex = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * GET /api/catalog/modelos?marca=&tipoVeiculo=&q=&limit=
 *
 * Nomes de modelo que já existem no catálogo mestre, para o cadastro de
 * repasse sugerir em vez de aceitar texto livre: "ONIX LT 1.0 TURBO",
 * "onix lt turbo" e "Onix LT" viravam três modelos diferentes na busca e nos
 * filtros da vitrine.
 */
export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        await connectDB();

        const { searchParams } = new URL(request.url);
        const marca = searchParams.get('marca')?.trim() || '';
        const tipoVeiculo = searchParams.get('tipoVeiculo')?.trim() || '';
        const q = searchParams.get('q')?.trim() || '';
        const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));

        const query: any = { ativo: true };
        if (marca) query.marca = { $regex: `^${escapeRegex(marca)}`, $options: 'i' };
        if (tipoVeiculo === 'carro' || tipoVeiculo === 'moto') query.tipoVeiculo = tipoVeiculo;
        if (q) query.modelo = { $regex: escapeRegex(q), $options: 'i' };

        const modelos = (await VehicleVariation.distinct('modelo', query))
            .filter(Boolean)
            .map(String)
            .sort((a, b) => a.localeCompare(b, 'pt-BR'))
            .slice(0, limit);

        return NextResponse.json({ modelos });
    } catch (error: any) {
        console.error('[catalog/modelos] GET', error);
        return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
    }
}
