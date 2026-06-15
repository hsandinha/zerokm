import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import Concessionaria from '@/models/Concessionaria';
import User from '@/models/User';

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !['operador', 'vendedor'].includes(session.user?.profile as string)) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }
        
        await connectDB();
        
        // Find all dealerships managed by this operator
        const dealerships = await Concessionaria.find({ operadorId: (session.user as any).uid ?? (session.user as any).id }).lean() as any[];
        const dealershipIds = dealerships.map(d => d._id);

        // Find users that belong to these dealerships
        const users = await User.find({ dealershipId: { $in: dealershipIds } })
            .select('displayName email dealershipId subscription creditCard')
            .lean() as any[];

        const now = new Date();

        const results = dealerships.map(dealer => {
            // Get users from this dealership
            const dealerUsers = users.filter(u => u.dealershipId?.toString() === dealer._id.toString());
            
            // Assume the main subscriber is the one with highest expiresAt, or just get any valid active one
            // We want to track the current health of the dealership's access
            let bestSubscription = null;
            let bestUser = null;
            let status = 'no_plan';
            let daysUntilExpiry = null;
            let paymentMethod = 'N/A';
            let hasCard = false;

            for (const u of dealerUsers) {
                if (u.subscription?.expiresAt) {
                    if (!bestSubscription || new Date(u.subscription.expiresAt).getTime() > new Date(bestSubscription.expiresAt).getTime()) {
                        bestSubscription = u.subscription;
                        bestUser = u;
                        hasCard = !!u.creditCard?.mpCardId;
                    }
                }
            }

            if (bestSubscription) {
                const expiry = new Date(bestSubscription.expiresAt);
                const diff = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                daysUntilExpiry = diff;
                
                if (diff < 0) {
                    status = 'expired';
                } else if (diff <= 5) {
                    status = 'expiring_soon';
                } else {
                    status = 'active';
                }

                if (hasCard) {
                    paymentMethod = 'Cartão de Crédito';
                } else {
                    paymentMethod = 'Pix / Boleto'; // Manual payment
                }
            }

            return {
                id: dealer._id.toString(),
                nome: dealer.nome || dealer.razaoSocial,
                cidade: dealer.cidade,
                status,
                daysUntilExpiry,
                expiresAt: bestSubscription?.expiresAt ? new Date(bestSubscription.expiresAt).toISOString() : null,
                paymentMethod,
                responsavel: dealer.nomeResponsavel,
                telefone: dealer.telefoneResponsavel || dealer.telefone,
            };
        });

        // Sorteamos primeiro os "expired", depois os "expiring_soon", e por último os "active/no_plan"
        results.sort((a, b) => {
            const getRank = (s: string) => s === 'expired' ? 0 : s === 'expiring_soon' ? 1 : 2;
            const rankA = getRank(a.status);
            const rankB = getRank(b.status);
            if (rankA !== rankB) return rankA - rankB;
            
            if (a.daysUntilExpiry !== null && b.daysUntilExpiry !== null) {
                return a.daysUntilExpiry - b.daysUntilExpiry;
            }
            return 0;
        });

        return NextResponse.json({ clients: results });
        
    } catch (error) {
        console.error('API Carteira Error:', error);
        return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
    }
}
