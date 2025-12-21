import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Vehicle from '@/models/Vehicle';
import User from '@/models/User';
import Concessionaria from '@/models/Concessionaria';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';

// GET /api/vehicles/suggestions?fields=modelo,cor,ano,status,combustivel,transmissao&searchTerm=corol
// Retorna valores distintos para cada campo solicitado (até limite opcional)
export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();
        const { searchParams } = new URL(request.url);
        const fieldsParam = searchParams.get('fields');
        const searchTerm = searchParams.get('searchTerm') || '';
        const limitParam = parseInt(searchParams.get('limit') || '10');
        const sortByCount = searchParams.get('sortByCount') === 'true';

        const defaultFields = ['modelo', 'cor', 'ano', 'status', 'combustivel', 'transmissao', 'opcionais'];
        const fields = (fieldsParam ? fieldsParam.split(',') : defaultFields).filter(Boolean);

        // Check for dealership restriction
        let restrictedDealershipName: string | null = null;
        // @ts-ignore
        if (session.user?.profile === 'concessionaria') {
            const user = await User.findOne({ email: session.user.email });
            if (user && user.dealershipId) {
                const dealership = await Concessionaria.findById(user.dealershipId);
                if (dealership) {
                    restrictedDealershipName = dealership.nome;
                }
            }

            // If logged in as concessionaria but no dealership found/linked, return empty
            if (!restrictedDealershipName) {
                return NextResponse.json({ suggestions: {} });
            }
        }

        const suggestions: Record<string, string[]> = {};

        // Para cada campo, buscamos distinct; se searchTerm presente, filtramos por regex case-insensitive
        for (const field of fields) {
            let filtered: string[] = [];

            if (sortByCount) {
                // Use aggregation to sort by frequency
                const matchStage: any = {};
                if (restrictedDealershipName) {
                    matchStage.concessionaria = restrictedDealershipName;
                }

                const pipeline: any[] = [];
                if (Object.keys(matchStage).length > 0) {
                    pipeline.push({ $match: matchStage });
                }
                pipeline.push(
                    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
                    { $sort: { count: -1 } },
                    { $limit: limitParam }
                );

                const aggregation = await Vehicle.aggregate(pipeline);
                filtered = aggregation.map(item => item._id).filter(v => typeof v === 'string');

                if (searchTerm) {
                    const lower = searchTerm.toLowerCase();
                    filtered = filtered.filter(v => v.toLowerCase().includes(lower));
                }
            } else {
                // Se campo inexistente evita erro
                // Distinct completo
                const query: any = {};
                if (restrictedDealershipName) {
                    query.concessionaria = restrictedDealershipName;
                }

                const distinctValues: string[] = await Vehicle.distinct(field as any, query).catch(() => []);
                filtered = distinctValues.filter(v => typeof v === 'string');
                if (searchTerm) {
                    const lower = searchTerm.toLowerCase();
                    filtered = filtered.filter(v => v.toLowerCase().includes(lower));
                }
                // Ordena alfabeticamente e aplica limite
                filtered.sort((a, b) => a.localeCompare(b, 'pt-BR'));
                filtered = filtered.slice(0, limitParam);
            }

            suggestions[field] = filtered;
        }

        return NextResponse.json({ suggestions });
    } catch (error: any) {
        console.error('Erro ao obter sugestões:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
