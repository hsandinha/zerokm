import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import VehicleVariation from '@/models/VehicleVariation';
import DealerVehiclePrice from '@/models/DealerVehiclePrice';
import { filtroDoCatalogo, ORDEM_DO_CATALOGO } from '@/lib/services/catalogoFiltro';
import { PERFIS_CATALOGO } from '@/lib/utils/permissoesCatalogo';
import { CABECALHO_EXPORTACAO, linhaDaExportacao, linhasCsv } from '@/lib/utils/exportarCatalogo';

export const dynamic = 'force-dynamic';

/** Linhas por página. A tela pede página por página e junta tudo num arquivo só. */
const POR_PAGINA = 4000;

/**
 * Exporta o catálogo no mesmo formato da importação (colunas Marca, Modelo,
 * Ano, Combustível, Cor, Câmbio, Opcionais...), com o filtro da tela.
 * Responde em páginas para não esbarrar no limite de tamanho da resposta.
 */
export async function GET(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!PERFIS_CATALOGO.has(session.user?.profile || '')) return NextResponse.json({ error: 'Acesso negado ao catálogo' }, { status: 403 });

    try {
        await connectDB();
        const { searchParams } = new URL(request.url);
        const pagina = Math.max(1, parseInt(searchParams.get('pagina') || '1', 10) || 1);
        const query = await filtroDoCatalogo(searchParams);

        const [variacoes, total] = await Promise.all([
            VehicleVariation.find(query).sort(ORDEM_DO_CATALOGO).skip((pagina - 1) * POR_PAGINA).limit(POR_PAGINA).lean(),
            VehicleVariation.countDocuments(query),
        ]);

        const anuncios = variacoes.length
            ? await DealerVehiclePrice.aggregate([
                { $match: { ativo: true, variationId: { $in: variacoes.map(v => v._id) } } },
                { $group: { _id: '$variationId', total: { $sum: 1 } } },
            ])
            : [];
        const anunciosPorVariacao = new Map(anuncios.map(a => [String(a._id), a.total as number]));

        const linhas = variacoes.map(v => linhaDaExportacao(v, anunciosPorVariacao.get(String(v._id)) || 0));
        const corpo = linhasCsv(pagina === 1 ? [CABECALHO_EXPORTACAO, ...linhas] : linhas);
        const temMais = pagina * POR_PAGINA < total;

        return new NextResponse(corpo, {
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Cache-Control': 'no-store',
                'X-Total': String(total),
                'X-Proxima-Pagina': temMais ? String(pagina + 1) : '',
            },
        });
    } catch (error: any) {
        console.error('Erro ao exportar catálogo:', error);
        return NextResponse.json({ error: error?.message || 'Erro interno' }, { status: 500 });
    }
}
