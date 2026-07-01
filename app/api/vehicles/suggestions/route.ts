import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import Concessionaria from '@/models/Concessionaria';
import VehicleVariation from '@/models/VehicleVariation';
import DealerVehiclePrice from '@/models/DealerVehiclePrice';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';

const normalizeAccessProfile = (profile?: string | null) => profile === 'dealership' ? 'concessionaria' : profile;

const getEffectiveProfile = (session: any, requestedProfile?: string | null) => {
    const currentProfile = normalizeAccessProfile(session.user?.profile);
    const allowedProfiles = (session.user?.allowedProfiles || []).map(normalizeAccessProfile);
    const normalizedRequested = normalizeAccessProfile(requestedProfile);

    if (normalizedRequested && (normalizedRequested === currentProfile || allowedProfiles.includes(normalizedRequested))) {
        return normalizedRequested;
    }

    return currentProfile;
};

// GET /api/vehicles/suggestions?fields=modelo,cor,ano,status,combustivel,transmissao&searchTerm=corol
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
        const effectiveProfile = getEffectiveProfile(session, searchParams.get('accessProfile'));

        const defaultFields = ['modelo', 'cor', 'ano', 'status', 'combustivel', 'transmissao', 'opcionais'];
        const fields = (fieldsParam ? fieldsParam.split(',') : defaultFields).filter(Boolean);

        // Check for dealership restriction
        let restrictedDealershipId: string | null = null;
        if (effectiveProfile === 'concessionaria') {
            const user = await User.findOne({ email: session.user.email });
            if (user && user.dealershipId) {
                restrictedDealershipId = user.dealershipId.toString();
            }

            // If logged in as concessionaria but no dealership found/linked, return empty
            if (!restrictedDealershipId) {
                return NextResponse.json({ suggestions: {} });
            }
        }

        const suggestions: Record<string, string[]> = {};
        
        // Mapeamento de quais campos pertencem a quais coleções no novo modelo
        const variationFields = new Set(['modelo', 'cor', 'ano', 'status', 'combustivel', 'transmissao', 'opcionais', 'anoModelo', 'marca']);
        const concessionariaFields = new Set(['cidade', 'estado', 'concessionaria']);

        for (const field of fields) {
            let filtered: string[] = [];
            
            // Map 'ano' to 'anoModelo' for variation query
            const actualField = field === 'ano' ? 'anoModelo' : field;
            
            if (variationFields.has(actualField)) {
                let query: any = { ativo: true };
                
                // If restricted, we should ideally only suggest variations they have prices for.
                // For performance, we can just do a general distinct, or query DealerVehiclePrice first.
                if (restrictedDealershipId) {
                    const activePrices = await DealerVehiclePrice.find({ 
                        concessionariaId: restrictedDealershipId, 
                        ativo: true 
                    }).distinct('variationId');
                    query._id = { $in: activePrices };
                }

                if (sortByCount) {
                    const pipeline: any[] = [
                        { $match: query },
                        { $group: { _id: `$${actualField}`, count: { $sum: 1 } } },
                        { $sort: { count: -1 } },
                        { $limit: limitParam }
                    ];
                    const aggregation = await VehicleVariation.aggregate(pipeline);
                    filtered = aggregation.map(item => String(item._id));
                } else {
                    const distinctValues = await VehicleVariation.distinct(actualField, query).catch(() => []);
                    filtered = distinctValues.map(v => String(v)).filter(Boolean);
                }
            } else if (concessionariaFields.has(actualField)) {
                // Map 'estado' -> 'uf', 'concessionaria' -> 'nome'
                const dbField = actualField === 'estado' ? 'uf' : actualField === 'concessionaria' ? 'nome' : actualField;
                
                let query: any = {};
                if (restrictedDealershipId) {
                    query._id = restrictedDealershipId;
                }

                if (sortByCount) {
                    const pipeline: any[] = [
                        { $match: query },
                        { $group: { _id: `$${dbField}`, count: { $sum: 1 } } },
                        { $sort: { count: -1 } },
                        { $limit: limitParam }
                    ];
                    const aggregation = await Concessionaria.aggregate(pipeline);
                    filtered = aggregation.map(item => String(item._id));
                } else {
                    const distinctValues = await Concessionaria.distinct(dbField, query).catch(() => []);
                    filtered = distinctValues.map(v => String(v)).filter(Boolean);
                }
            }

            if (searchTerm) {
                const lower = searchTerm.toLowerCase();
                filtered = filtered.filter(v => v.toLowerCase().includes(lower));
            }

            // Fallback limits
            if (!sortByCount) {
                filtered = filtered.slice(0, limitParam);
            }

            suggestions[field] = filtered;
        }

        return NextResponse.json({ suggestions });
    } catch (error: any) {
        console.error('Erro nas sugestões:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
