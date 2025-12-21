import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Modelo from '@/models/Modelo';
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
        const marca = searchParams.get('marca');
        const search = searchParams.get('search');
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '10000');

        let query: any = {};

        if (marca) {
            query.marca = marca;
        }

        // Adicionar busca por nome ou marca
        if (search) {
            const searchRegex = { $regex: search.trim(), $options: 'i' };
            query.$or = [
                { nome: searchRegex },
                { marca: searchRegex }
            ];
        }

        const skip = (page - 1) * limit;

        const [modelos, total] = await Promise.all([
            Modelo.find(query).sort({ nome: 1 }).skip(skip).limit(limit),
            Modelo.countDocuments(query)
        ]);

        const serialized = modelos.map(doc => ({
            ...doc.toObject(),
            id: doc._id.toString(),
            _id: undefined
        }));

        return NextResponse.json({
            data: serialized,
            total,
            page,
            hasNextPage: skip + modelos.length < total
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();
        const body = await request.json();
        const newModelo = await Modelo.create(body);
        const doc = newModelo as any;
        return NextResponse.json({
            ...doc.toObject(),
            id: doc._id.toString(),
            _id: undefined
        }, { status: 201 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
