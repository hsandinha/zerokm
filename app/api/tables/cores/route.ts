import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Cor from '@/models/Cor';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();
        const cores = await Cor.find().sort({ nome: 1 });
        const serialized = cores.map(doc => ({
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
        const newCor = await Cor.create(body);
        const doc = newCor as any;
        return NextResponse.json({
            ...doc.toObject(),
            id: doc._id.toString(),
            _id: undefined
        }, { status: 201 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
