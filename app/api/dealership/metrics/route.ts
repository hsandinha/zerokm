import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import DealerVehiclePrice from '@/models/DealerVehiclePrice';
import User from '@/models/User';
import Concessionaria from '@/models/Concessionaria';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();

        // Identify the dealership
        let dealershipId: string | null = null;

        // @ts-ignore
        if (session.user?.profile === 'concessionaria') {
            const user = await User.findOne({ email: session.user.email });
            if (user && user.dealershipId) {
                dealershipId = user.dealershipId;
            }
        }

        if (!dealershipId) {
            return NextResponse.json({ error: 'Concessionária não encontrada para este usuário' }, { status: 404 });
        }

        // 1. Total Vehicles
        const veiculosCadastrados = await DealerVehiclePrice.countDocuments({ concessionariaId: dealershipId, ativo: true });

        // 2. Sold Vehicles (not fully supported in new model yet, leaving at 0 or query status if added)
        const veiculosVendidos = 0; // await DealerVehiclePrice.countDocuments({ concessionariaId: dealershipId, status: 'Vendido' });

        // 3. Last Update
        const lastUpdatedVehicle = await DealerVehiclePrice.findOne({ concessionariaId: dealershipId })
            .sort({ updatedAt: -1 })
            .select('updatedAt');

        let daysSinceUpdate = 0;
        if (lastUpdatedVehicle && lastUpdatedVehicle.updatedAt) {
            const lastUpdateDate = new Date(lastUpdatedVehicle.updatedAt);
            const today = new Date();
            const diffTime = Math.abs(today.getTime() - lastUpdateDate.getTime());
            daysSinceUpdate = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        } else {
            if (veiculosCadastrados === 0) daysSinceUpdate = 0;
            else daysSinceUpdate = 999; // Very old
        }

        // 3b. Status breakdown per vehicle (mesmos limites do farol: verde <= 1 dia, amarelo 2-3 dias, vermelho > 3 dias)
        const now = new Date();
        const verdeCutoff = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
        const vermelhoCutoff = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);

        const [verde, amarelo, vermelho] = await Promise.all([
            DealerVehiclePrice.countDocuments({ concessionariaId: dealershipId, ativo: true, updatedAt: { $gte: verdeCutoff } }),
            DealerVehiclePrice.countDocuments({ concessionariaId: dealershipId, ativo: true, updatedAt: { $lt: verdeCutoff, $gte: vermelhoCutoff } }),
            DealerVehiclePrice.countDocuments({ concessionariaId: dealershipId, ativo: true, updatedAt: { $lt: vermelhoCutoff } }),
        ]);

        // 4. Chart Data (Last 6 months evolution)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
        sixMonthsAgo.setDate(1); // Start of that month

        const chartAggregation = await DealerVehiclePrice.aggregate([
            {
                $match: {
                    concessionariaId: typeof dealershipId === 'string' ? dealershipId : (dealershipId as any).toString(), // Just to be safe with ObjectId
                    createdAt: { $gte: sixMonthsAgo },
                    ativo: true
                }
            },
            {
                $group: {
                    _id: {
                        month: { $month: "$createdAt" },
                        year: { $year: "$createdAt" }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { "_id.year": 1, "_id.month": 1 }
            }
        ]);

        // Format chart data for frontend
        const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const chartData = [];

        // Fill in the last 6 months, even if empty
        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const month = d.getMonth() + 1;
            const year = d.getFullYear();

            const found = chartAggregation.find(item => item._id.month === month && item._id.year === year);

            chartData.push({
                label: monthNames[month - 1],
                value: found ? found.count : 0
            });
        }

        return NextResponse.json({
            veiculosCadastrados,
            veiculosVendidos,
            daysSinceUpdate,
            statusBreakdown: { verde, amarelo, vermelho },
            chartData,
            // Mocking other stats that we don't have data for yet
            propostas: {
                total: 0,
                aprovadas: 0,
                pendentes: 0,
                rejeitadas: 0
            },
            faturamento: {
                mensal: 0,
                total: 0
            },
            clientes: {
                total: 0,
                novos: 0
            }
        });

    } catch (error: any) {
        console.error('Erro ao buscar métricas da concessionária:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
