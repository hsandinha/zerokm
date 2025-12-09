import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Vehicle from '@/models/Vehicle';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        await connectDB();

        // Agregação 1: Veículos por Operador
        const byOperator = await Vehicle.aggregate([
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
        // Pegar a última atualização (updatedAt ou createdAt) de veículo por concessionária
        const concessionariaStaleness = await Vehicle.aggregate([
            {
                $match: {
                    concessionaria: { $nin: [null, ''] }
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

        return NextResponse.json({
            byOperator,
            byConcessionaria,
            concessionariaStaleness
        });
    } catch (error) {
        console.error('Erro ao buscar métricas administrativas:', error);
        return NextResponse.json(
            { error: 'Erro ao buscar métricas' },
            { status: 500 }
        );
    }
}
