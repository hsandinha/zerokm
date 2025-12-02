import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Vehicle from '@/models/Vehicle';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();
        const { searchParams } = new URL(request.url);

        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '50');
        const search = searchParams.get('search') || '';
        const sortKey = searchParams.get('sortKey') || 'dataEntrada';
        const sortDir = searchParams.get('sortDir') === 'asc' ? 1 : -1;

        const filters: any = {};
        if (searchParams.get('status')) filters.status = searchParams.get('status');
        if (searchParams.get('combustivel')) filters.combustivel = searchParams.get('combustivel');
        if (searchParams.get('transmissao')) filters.transmissao = searchParams.get('transmissao');
        if (searchParams.get('ano')) filters.ano = searchParams.get('ano');
        if (searchParams.get('modelo')) filters.modelo = searchParams.get('modelo');
        if (searchParams.get('opcionais')) filters.opcionais = searchParams.get('opcionais');

        // Build base query from filters, using regex for cor to allow partial matches
        let query: any = {};
        if (filters.status) query.status = filters.status;
        if (filters.combustivel) query.combustivel = filters.combustivel;
        if (filters.transmissao) query.transmissao = filters.transmissao;
        if (filters.ano) query.ano = filters.ano;
        if (filters.modelo) {
            query.modelo = { $regex: escapeRegex(filters.modelo), $options: 'i' };
        }
        const corParam = searchParams.get('cor');
        if (corParam) query.cor = { $regex: escapeRegex(corParam), $options: 'i' };
        const opcionaisParam = searchParams.get('opcionais');
        if (opcionaisParam) {
            query.opcionais = { $regex: escapeRegex(opcionaisParam), $options: 'i' };
        }

        if (search) {
            const searchRegex = { $regex: search, $options: 'i' };
            // Se o termo de busca corresponde exatamente a valores de enum conhecidos, aplicar como filtro específico
            const normalized = search.trim().toLowerCase();
            const fuelMap: Record<string, string> = {
                'flex': 'Flex',
                'gasolina': 'Gasolina',
                'etanol': 'Etanol',
                'alcool': 'Etanol',
                'álcool': 'Etanol',
                'diesel': 'Diesel',
                'elétrico': 'Elétrico',
                'eletrico': 'Elétrico',
                'híbrido': 'Híbrido',
                'hibrido': 'Híbrido'
            };
            const transMap: Record<string, string> = {
                'manual': 'Manual',
                'automatico': 'Automático',
                'automático': 'Automático',
                'cvt': 'CVT'
            };
            const statusMap: Record<string, string> = {
                'a faturar': 'A faturar',
                'refaturamento': 'Refaturamento',
                'licenciado': 'Licenciado'
            };

            if (fuelMap[normalized]) {
                query.combustivel = fuelMap[normalized];
            } else if (transMap[normalized]) {
                query.transmissao = transMap[normalized];
            } else if (statusMap[normalized]) {
                query.status = statusMap[normalized];
            }

            const orConditions = [
                { transmissao: searchRegex },
                { combustivel: searchRegex },
                { cor: searchRegex },
                { ano: searchRegex },
                { opcionais: searchRegex },
                { observacoes: searchRegex },
                { cidade: searchRegex },
                { estado: searchRegex },
                { concessionaria: searchRegex }
            ];

            // Only search in model if we are not already filtering by a specific model
            if (!filters.modelo) {
                orConditions.unshift({ modelo: searchRegex });
            }

            query.$or = orConditions;
        }

        const skip = (page - 1) * limit;

        const [data, total] = await Promise.all([
            Vehicle.find(query)
                .sort({ [sortKey]: sortDir })
                .skip(skip)
                .limit(limit),
            Vehicle.countDocuments(query)
        ]);

        const serializedData = data.map(doc => ({
            ...doc.toObject(),
            id: doc._id.toString(),
            _id: undefined
        }));

        return NextResponse.json({
            data: serializedData,
            total,
            hasNextPage: skip + data.length < total,
            page,
            totalPages: Math.ceil(total / limit)
        });
    } catch (error: any) {
        console.error('Erro ao buscar veículos:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        await connectDB();
        const body = await request.json();

        // Ensure required fields are present or set defaults
        const vehicleData = {
            ...body,
            dataEntrada: body.dataEntrada || new Date().toLocaleDateString('pt-BR'),
            status: body.status || 'A faturar',
            transmissao: body.transmissao || 'Manual',
            combustivel: body.combustivel || 'Flex',
            preco: body.preco || 0
        };

        const newVehicle = await Vehicle.create(vehicleData);
        const doc = newVehicle as any;

        return NextResponse.json({
            ...doc.toObject(),
            id: doc._id.toString(),
            _id: undefined
        }, { status: 201 });
    } catch (error: any) {
        console.error('Erro ao criar veículo:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
