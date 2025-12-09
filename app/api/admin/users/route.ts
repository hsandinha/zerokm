import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        await connectDB();

        // Buscar todos os usuários que têm 'operador' ou 'operator' em allowedProfiles
        const users = await User.find({
            allowedProfiles: { $in: ['operator', 'operador'] }
        }).select('displayName email allowedProfiles canViewLocation');

        // Filtrar usuários que não têm canViewLocation (vendedor) ativado
        const operadoresSemVendedor = users.filter(user => !user.canViewLocation);

        return NextResponse.json(operadoresSemVendedor);
    } catch (error) {
        console.error('Erro ao buscar usuários:', error);
        return NextResponse.json(
            { error: 'Erro ao buscar usuários' },
            { status: 500 }
        );
    }
}
