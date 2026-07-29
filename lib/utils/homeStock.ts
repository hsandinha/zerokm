export interface HomeTopModel {
    name: string;
    estado: string;
    avgPrice: number;
    count: number;
}

export interface HomeStockSummary {
    totalVehicles: number;
    totalValue: number;
    totalStates: number;
    pricedPct: number;
    topModels: HomeTopModel[];
}

export const EMPTY_HOME_STOCK: HomeStockSummary = {
    totalVehicles: 0,
    totalValue: 0,
    totalStates: 0,
    pricedPct: 0,
    topModels: [],
};

/**
 * Estoque real do painel "Ao vivo" da home.
 *
 * Parte de dealervehicleprices e mantém só o que o cliente realmente enxerga em
 * /api/vehicles: preço ativo, variação existente e ativa, concessionária
 * existente. Os $unwind sem preserveNullAndEmptyArrays descartam de propósito os
 * registros órfãos (variação apagada ou concessionária removida) — eles seguem
 * no banco mas não são estoque.
 */
export function buildHomeStockPipeline(): any[] {
    return [
        { $match: { ativo: true, preco: { $gt: 0 } } },
        { $lookup: { from: 'vehiclevariations', localField: 'variationId', foreignField: '_id', as: 'variation' } },
        { $unwind: '$variation' },
        { $match: { 'variation.ativo': true } },
        { $lookup: { from: 'concessionarias', localField: 'concessionariaId', foreignField: '_id', as: 'conc' } },
        { $unwind: '$conc' },
        {
            $facet: {
                totais: [{
                    $group: {
                        _id: null,
                        anuncios: { $sum: 1 },
                        unidades: { $sum: { $ifNull: ['$quantidade', 0] } },
                        valor: { $sum: { $multiply: ['$preco', { $ifNull: ['$quantidade', 0] }] } },
                    },
                }],
                estados: [
                    { $match: { 'conc.uf': { $nin: [null, ''] } } },
                    { $group: { _id: { $toUpper: '$conc.uf' } } },
                    { $count: 'total' },
                ],
                // Variações distintas com preço: a mesma variação pode estar
                // precificada por várias concessionárias, então contar anúncios
                // daria percentual acima de 100%.
                variacoesPrecificadas: [
                    { $group: { _id: '$variationId' } },
                    { $count: 'total' },
                ],
                // Agrupa por modelo+UF para saber em qual estado cada modelo tem
                // mais unidades, e só depois consolida por modelo.
                topModelos: [
                    {
                        $group: {
                            _id: { modelo: '$variation.modelo', uf: { $toUpper: '$conc.uf' } },
                            unidades: { $sum: { $ifNull: ['$quantidade', 0] } },
                            somaPreco: { $sum: '$preco' },
                            anuncios: { $sum: 1 },
                        },
                    },
                    {
                        $group: {
                            _id: '$_id.modelo',
                            unidades: { $sum: '$unidades' },
                            somaPreco: { $sum: '$somaPreco' },
                            anuncios: { $sum: '$anuncios' },
                            porUf: { $push: { uf: '$_id.uf', unidades: '$unidades' } },
                        },
                    },
                    { $sort: { unidades: -1, _id: 1 } },
                    { $limit: 4 },
                ],
            },
        },
    ];
}

/** Converte o resultado do $facet no formato que o painel renderiza. */
export function mapHomeStockSummary(resultado: any[], variacoesAtivas: number): HomeStockSummary {
    const facet = resultado?.[0];
    if (!facet) return { ...EMPTY_HOME_STOCK };

    const totais = facet.totais?.[0];
    const precificadas = facet.variacoesPrecificadas?.[0]?.total ?? 0;

    return {
        totalVehicles: totais?.unidades ?? 0,
        totalValue: totais?.valor ?? 0,
        totalStates: facet.estados?.[0]?.total ?? 0,
        pricedPct: variacoesAtivas > 0
            ? Math.min(100, Math.round((precificadas / variacoesAtivas) * 100))
            : 0,
        topModels: (facet.topModelos ?? []).map((m: any) => {
            const ufTop = (m.porUf ?? []).reduce(
                (maior: any, atual: any) => (atual.unidades > (maior?.unidades ?? -1) ? atual : maior),
                null
            );
            return {
                name: m._id as string,
                estado: (ufTop?.uf ?? '').toString().slice(0, 2),
                avgPrice: m.anuncios > 0 ? m.somaPreco / m.anuncios : 0,
                count: m.unidades as number,
            };
        }),
    };
}
