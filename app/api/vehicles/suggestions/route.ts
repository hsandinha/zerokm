import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Vehicle from '@/models/Vehicle';
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

        const suggestions: Record<string, string[]> = {};

        // Para cada campo, buscamos distinct; se searchTerm presente, filtramos por regex case-insensitive
        for (const field of fields) {
            let filtered: string[] = [];

            if (sortByCount) {
                // Use aggregation to sort by frequency
                const aggregation = await Vehicle.aggregate([
                    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
                    { $sort: { count: -1 } },
                    { $limit: limitParam }
                ]);
                filtered = aggregation.map(item => item._id).filter(v => typeof v === 'string');

                if (searchTerm) {
                    const lower = searchTerm.toLowerCase();
                    filtered = filtered.filter(v => v.toLowerCase().includes(lower));
                }
            } else {
                // Se campo inexistente evita erro
                // Distinct completo
                const distinctValues: string[] = await Vehicle.distinct(field as any).catch(() => []);
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
