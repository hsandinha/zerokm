import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Vehicle from '@/models/Vehicle';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        await connectDB();

        // Get query parameters for filtering
        const { searchParams } = new URL(request.url);
        const operadorFilter = searchParams.get('operador');
        const concessionariaFilter = searchParams.get('concessionaria');
        const responsavelFilter = searchParams.get('responsavel');
        const diasDesdeFilter = searchParams.get('diasDesde');

        // Build match filter for aggregations
        const matchFilter: any = {};
        if (operadorFilter) matchFilter.operador = operadorFilter;
        if (concessionariaFilter) matchFilter.concessionaria = concessionariaFilter;
        if (responsavelFilter) matchFilter.nomeContato = responsavelFilter;

        // Filter by days since update
        if (diasDesdeFilter) {
            const now = new Date();
            if (diasDesdeFilter === '0-1') {
                const oneDayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
                matchFilter.updatedAt = { $gte: oneDayAgo };
            } else if (diasDesdeFilter === '2-3') {
                const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
                const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
                matchFilter.updatedAt = { $gte: threeDaysAgo, $lt: twoDaysAgo };
            } else if (diasDesdeFilter === '4+') {
                const fourDaysAgo = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);
                matchFilter.updatedAt = { $lt: fourDaysAgo };
            } else if (diasDesdeFilter === '7+') {
                const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                matchFilter.updatedAt = { $lt: sevenDaysAgo };
            } else if (diasDesdeFilter === '15+') {
                const fifteenDaysAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
                matchFilter.updatedAt = { $lt: fifteenDaysAgo };
            }
        }

        // Agregação 1: Veículos por Operador
        const byOperator = await Vehicle.aggregate([
            ...(Object.keys(matchFilter).length > 0 ? [{ $match: matchFilter }] : []),
            {
                $group: {
                    _id: '$operador',
                    total: { $sum: 1 }
                }
            },
            {
                $match: {
                    _id: { $nin: [null, ''] }
                }
            },
            {
                $sort: { total: -1 }
            },
            {
                $limit: 10
            },
            {
                $project: {
                    _id: 0,
                    nome: '$_id',
                    total: 1
                }
            }
        ]);

        // Agregação 2: Veículos por Concessionária
        const byConcessionaria = await Vehicle.aggregate([
            ...(Object.keys(matchFilter).length > 0 ? [{ $match: matchFilter }] : []),
            {
                $group: {
                    _id: '$concessionaria',
                    total: { $sum: 1 }
                }
            },
            {
                $match: {
                    _id: { $nin: [null, ''] }
                }
            },
            {
                $sort: { total: -1 }
            },
            {
                $project: {
                    _id: 0,
                    nome: '$_id',
                    total: 1
                }
            }
        ]);

        // Agregação 3: Dias sem atualização por Concessionária
        const concessionariaStaleness = await Vehicle.aggregate([
            {
                $match: {
                    concessionaria: { $nin: [null, ''] },
                    ...matchFilter
                }
            },
            {
                $group: {
                    _id: '$concessionaria',
                    lastUpdated: {
                        $max: {
                            $ifNull: ['$updatedAt', '$createdAt']
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    nome: '$_id',
                    lastUpdated: 1,
                    dias: {
                        $divide: [
                            { $subtract: [new Date(), '$lastUpdated'] },
                            1000 * 60 * 60 * 24
                        ]
                    }
                }
            },
            {
                $project: {
                    nome: 1,
                    lastUpdated: 1,
                    dias: { $floor: '$dias' }
                }
            },
            {
                $sort: { dias: -1 }
            }
        ]);

        // Agregação 4: Detalhes por Concessionária (concessionária > responsável > operador > quantidade > dias)
        const dealershipDetails = await Vehicle.aggregate([
            {
                $match: {
                    concessionaria: { $nin: [null, ''] },
                    ...matchFilter
                }
            },
            {
                $group: {
                    _id: {
                        concessionaria: '$concessionaria',
                        responsavel: '$nomeContato',
                        operador: '$operador'
                    },
                    total: { $sum: 1 },
                    lastUpdated: {
                        $max: {
                            $ifNull: ['$updatedAt', '$createdAt']
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    concessionaria: '$_id.concessionaria',
                    responsavel: { $ifNull: ['$_id.responsavel', 'Sem responsável'] },
                    operador: { $ifNull: ['$_id.operador', 'Sem operador'] },
                    total: 1,
                    lastUpdated: 1,
                    dias: {
                        $floor: {
                            $divide: [
                                { $subtract: [new Date(), '$lastUpdated'] },
                                1000 * 60 * 60 * 24
                            ]
                        }
                    }
                }
            },
            {
                $sort: { concessionaria: 1, responsavel: 1 }
            }
        ]);

        return NextResponse.json({
            byOperator,
            byConcessionaria,
            concessionariaStaleness,
            dealershipDetails
        });
    } catch (error) {
        console.error('Erro ao buscar métricas administrativas:', error);
        return NextResponse.json(
            { error: 'Erro ao buscar métricas' },
            { status: 500 }
        );
    }
}
