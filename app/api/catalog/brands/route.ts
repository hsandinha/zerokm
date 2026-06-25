import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Marca from '@/models/Marca';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        await connectDB();

        const marcas = await Marca.find({}).sort({ nome: 1 }).select('nome').lean();

        return NextResponse.json(marcas.map((marca: any) => ({
            id: marca._id.toString(),
            nome: marca.nome,
        })));
    } catch (error: any) {
        console.error('Erro ao buscar marcas públicas:', error);
        return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
    }
}
