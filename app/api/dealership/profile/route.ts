import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Concessionaria from '@/models/Concessionaria';
import User from '@/models/User';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();

        // Find user to get dealershipId
        // @ts-ignore
        if (session.user?.profile !== 'concessionaria') {
            return NextResponse.json({ error: 'Profile not authorized' }, { status: 403 });
        }

        const user = await User.findOne({ email: session.user.email });

        if (!user || !user.dealershipId) {
            return NextResponse.json({ error: 'Usuário não associado a uma concessionária' }, { status: 404 });
        }

        const dealership = await Concessionaria.findById(user.dealershipId);

        if (!dealership) {
            return NextResponse.json({ error: 'Concessionária não encontrada' }, { status: 404 });
        }

        return NextResponse.json(dealership);

    } catch (error: any) {
        console.error('Erro ao buscar perfil da concessionária:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
