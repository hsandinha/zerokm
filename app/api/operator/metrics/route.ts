import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import Concessionaria from '@/models/Concessionaria';
import DealerVehiclePrice from '@/models/DealerVehiclePrice';
import User from '@/models/User';

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !['operador', 'vendedor'].includes(session.user?.profile as string)) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }
        
        await connectDB();
        
        const uid = (session.user as any).uid;
        if (!uid) {
             return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }
        
        const dbUser = await User.findOne({ firebaseUid: uid }).select('_id').lean() as any;
        if (!dbUser) {
             return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 401 });
        }

        // 1. Número de concessionárias na carteira
        const dealerships = await Concessionaria.find({ operadorId: dbUser._id }).lean() as any[];
        const totalConcessionarias = dealerships.length;
        const dealershipNames = dealerships.map(d => d.nome).filter(Boolean);
        const dealershipIds = dealerships.map(d => d._id);

        const users = await User.find({ dealershipId: { $in: dealershipIds } })
            .select('dealershipId subscription')
            .lean() as any[];

        let expiramEmBreve = 0;
        let bloqueados = 0;
        const now = new Date();

        dealerships.forEach(dealer => {
            const dealerUsers = users.filter(u => u.dealershipId?.toString() === dealer._id.toString());
            let bestSubscription = null;

            for (const u of dealerUsers) {
                if (u.subscription?.expiresAt) {
                    if (!bestSubscription || new Date(u.subscription.expiresAt).getTime() > new Date(bestSubscription.expiresAt).getTime()) {
                        bestSubscription = u.subscription;
                    }
                }
            }

            if (bestSubscription) {
                const expiry = new Date(bestSubscription.expiresAt);
                const diff = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                if (diff < 0) {
                    bloqueados++;
                } else if (diff <= 5) {
                    expiramEmBreve++;
                }
            } else {
               bloqueados++;
            }
        });

        // 2. Total de veículos vinculados a essa carteira
        let totalVeiculos = 0;
        let veiculosAtivos = 0;
        let veiculosVendidos = 0;
        let desatualizadas = 0;

        if (dealershipIds.length > 0) {
            
            // Calculando total e vendidos
            totalVeiculos = await DealerVehiclePrice.countDocuments({ concessionariaId: { $in: dealershipIds }, ativo: true });
            veiculosVendidos = 0; // await DealerVehiclePrice.countDocuments({ concessionariaId: { $in: dealershipIds }, status: 'Licenciado' });
            veiculosAtivos = totalVeiculos - veiculosVendidos;

            // Calculando concessionárias desatualizadas (nenhum veículo atualizado nos últimos 5 dias)
            const fiveDaysAgo = new Date();
            fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

            const activeDealersAgg = await DealerVehiclePrice.aggregate([
                { $match: { concessionariaId: { $in: dealershipIds }, ativo: true } },
                { $group: { _id: "$concessionariaId", maxUpdatedAt: { $max: "$updatedAt" } } }
            ]);

            const updatingDealersCount = activeDealersAgg.filter(a => a.maxUpdatedAt >= fiveDaysAgo).length;
            // Desatualizadas = Total que tem carros, mas cuja última atualização é > 5 dias OU nem tem carros
            desatualizadas = Math.max(0, totalConcessionarias - updatingDealersCount);
        }

        return NextResponse.json({
            concessionariasAtivas: totalConcessionarias,
            veiculosEmEstoque: totalVeiculos,
            veiculosVendidos: veiculosVendidos,
            metaMensal: '100%', // Hardcoded pro design mas pode evoluir
            bloqueados,
            expiramEmBreve,
            desatualizadas
        });
        
    } catch (error) {
        console.error('API Operator Metrics Error:', error);
        return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
    }
}
