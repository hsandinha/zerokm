import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Vehicle from '@/models/Vehicle';
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
        let dealershipName: string | null = null;

        // @ts-ignore
        if (session.user?.profile === 'concessionaria') {
            const user = await User.findOne({ email: session.user.email });
            if (user && user.dealershipId) {
                const dealership = await Concessionaria.findById(user.dealershipId);
                if (dealership) {
                    dealershipName = dealership.nome;
                }
            }
        }

        if (!dealershipName) {
            return NextResponse.json({ error: 'Concessionária não encontrada para este usuário' }, { status: 404 });
        }

        // 1. Total Vehicles
        const veiculosCadastrados = await Vehicle.countDocuments({ concessionaria: dealershipName });

        // 2. Sold Vehicles (assuming 'Vendido' status is used, even if not in strict schema enum yet)
        const veiculosVendidos = await Vehicle.countDocuments({
            concessionaria: dealershipName,
            status: 'Vendido'
        });

        // 3. Last Update
        const lastUpdatedVehicle = await Vehicle.findOne({ concessionaria: dealershipName })
            .sort({ updatedAt: -1 })
            .select('updatedAt');

        let daysSinceUpdate = 0;
        if (lastUpdatedVehicle && lastUpdatedVehicle.updatedAt) {
            const lastUpdateDate = new Date(lastUpdatedVehicle.updatedAt);
            const today = new Date();
            const diffTime = Math.abs(today.getTime() - lastUpdateDate.getTime());
            daysSinceUpdate = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            // If updated today, diff might be small, ceil gives 1 if > 0. 
            // If we want 0 for today:
            daysSinceUpdate = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        } else {
            // If no vehicles or no update date, maybe treat as very old?
            // Or 0 if it's a new account? Let's say -1 or handle in frontend.
            // If they have vehicles but never updated (unlikely with timestamps), it uses createdAt.
            // If 0 vehicles, daysSinceUpdate = 0 (neutral).
            if (veiculosCadastrados === 0) daysSinceUpdate = 0;
            else daysSinceUpdate = 999; // Very old
        }

        // 4. Chart Data (Last 6 months evolution)
        // We'll group by month of dataEntrada
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
        sixMonthsAgo.setDate(1); // Start of that month

        const chartAggregation = await Vehicle.aggregate([
            {
                $match: {
                    concessionaria: dealershipName,
                    dataEntrada: { $gte: sixMonthsAgo }
                }
            },
            {
                $group: {
                    _id: {
                        month: { $month: "$dataEntrada" },
                        year: { $year: "$dataEntrada" }
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
