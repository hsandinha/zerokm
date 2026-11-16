import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import DealerVehiclePrice from '@/models/DealerVehiclePrice';
import User from '@/models/User';
import RepasseVehicle from '@/models/RepasseVehicle';
import { acessoLiberado } from '@/lib/utils/atendentesLoja';
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
        if (session.user?.profile === 'concessionaria' || session.user?.profile === 'dealership') {
            const user = await User.findOne({ email: session.user.email });
            if (user && user.dealershipId && acessoLiberado(user)) {
                dealershipId = user.dealershipId;
            }
        }

        if (!dealershipId) {
            return NextResponse.json({ error: 'Concessionária não encontrada para este usuário' }, { status: 404 });
        }

        // O estoque da loja são os anúncios ativos de 0KM e de repasse: é o
        // que o lojista vê na consulta, com a data de cada um. Contar só o 0KM
        // (e a data de registro inativo) dava ao painel uma situação diferente
        // da que aparece para o cliente.
        const lojaId = new mongoose.Types.ObjectId(String(dealershipId));
        const novosAtivos = { concessionariaId: lojaId, ativo: true };
        const repasseAtivo = { concessionariaId: lojaId, ativo: true };

        // 1. Total Vehicles
        const [totalNovos, totalRepasse] = await Promise.all([
            DealerVehiclePrice.countDocuments(novosAtivos),
            RepasseVehicle.countDocuments(repasseAtivo),
        ]);
        const veiculosCadastrados = totalNovos + totalRepasse;

        // 2. Sold Vehicles (not fully supported in new model yet, leaving at 0 or query status if added)
        const veiculosVendidos = 0;

        // 3. Last Update
        const [ultimoNovo, ultimoRepasse] = await Promise.all([
            DealerVehiclePrice.findOne(novosAtivos).sort({ updatedAt: -1 }).select('updatedAt').lean(),
            RepasseVehicle.findOne(repasseAtivo).sort({ updatedAt: -1 }).select('updatedAt').lean(),
        ]);
        const ultimaAtualizacao = Math.max(
            ultimoNovo?.updatedAt ? new Date(ultimoNovo.updatedAt).getTime() : 0,
            ultimoRepasse?.updatedAt ? new Date(ultimoRepasse.updatedAt).getTime() : 0,
        );

        let daysSinceUpdate = 0;
        if (ultimaAtualizacao) {
            daysSinceUpdate = Math.floor(Math.abs(Date.now() - ultimaAtualizacao) / (1000 * 60 * 60 * 24));
        } else {
            if (veiculosCadastrados === 0) daysSinceUpdate = 0;
            else daysSinceUpdate = 999; // Very old
        }

        // 3b. Status breakdown per vehicle (mesmos limites do farol: verde <= 1 dia, amarelo 2-3 dias, vermelho > 3 dias)
        const now = new Date();
        const verdeCutoff = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
        const vermelhoCutoff = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);
        const faixas = [
            { updatedAt: { $gte: verdeCutoff } },
            { updatedAt: { $lt: verdeCutoff, $gte: vermelhoCutoff } },
            { updatedAt: { $lt: vermelhoCutoff } },
        ];

        const [verde, amarelo, vermelho] = await Promise.all(faixas.map(async faixa => {
            const [n, r] = await Promise.all([
                DealerVehiclePrice.countDocuments({ ...novosAtivos, ...faixa }),
                RepasseVehicle.countDocuments({ ...repasseAtivo, ...faixa }),
            ]);
            return n + r;
        }));

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
