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

        const query = marca ? { marca } : {};
        const modelos = await Modelo.find(query).sort({ nome: 1 });

        const serialized = modelos.map(doc => ({
            ...doc.toObject(),
            id: doc._id.toString(),
            _id: undefined
        }));
        return NextResponse.json(serialized);
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
