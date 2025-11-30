import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Vehicle from '@/models/Vehicle';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';

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
        if (searchParams.get('marca')) filters.marca = searchParams.get('marca');
        if (searchParams.get('combustivel')) filters.combustivel = searchParams.get('combustivel');
        if (searchParams.get('transmissao')) filters.transmissao = searchParams.get('transmissao');
        if (searchParams.get('ano')) filters.ano = searchParams.get('ano');

        let query: any = { ...filters };

        if (search) {
            const searchRegex = { $regex: search, $options: 'i' };
            query.$or = [
                { marca: searchRegex },
                { modelo: searchRegex },
                { versao: searchRegex },
                { cor: searchRegex },
                { concessionaria: searchRegex },
                { cidade: searchRegex },
                { estado: searchRegex },
                { vendedor: searchRegex },
                { observacoes: searchRegex },
                { nomeContato: searchRegex },
                { combustivel: searchRegex },
                { transmissao: searchRegex },
                { status: searchRegex },
                { ano: searchRegex },
                { opcionais: searchRegex }
            ];
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
