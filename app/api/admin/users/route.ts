import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';

export const dynamic = 'force-dynamic';

const EQUIPE = new Set(['admin', 'administrador', 'administrativo', 'gerente', 'operador', 'operator', 'vendedor']);

export async function GET(request: NextRequest) {
    try {
        // Lista de e-mails da equipe: só para a própria equipe (antes abria sem login).
        const session = await getServerSession(authOptions);
        const perfil = session?.user?.profile as string | undefined;
        if (!session || !perfil || !EQUIPE.has(perfil)) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: session ? 403 : 401 });
        }
        await connectDB();

        // Buscar somente usuários internos para vincular a concessionárias
        const users = await User.find({
            allowedProfiles: { $in: ['operator', 'operador', 'admin', 'administrador', 'administrativo', 'gerente'] }
        }).select('displayName email allowedProfiles');

        return NextResponse.json(users);
    } catch (error) {
        console.error('Erro ao buscar usuários:', error);
        return NextResponse.json(
            { error: 'Erro ao buscar usuários' },
            { status: 500 }
        );
    }
}
