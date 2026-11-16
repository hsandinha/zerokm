import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import { acessoDaLoja } from '@/lib/services/acessoLoja';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dealership/papel
 * Papel de quem está logado na concessionária (titular ou atendente). O painel
 * usa só para montar o menu; quem barra o atendente é cada rota, no servidor.
 */
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        await connectDB();
        const acesso = await acessoDaLoja(session);
        if (!acesso) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
        return NextResponse.json({ papel: acesso.papel, nome: acesso.nome });
    } catch (error) {
        console.error('[papel da loja] GET', error);
        return NextResponse.json({ error: 'Não foi possível carregar o seu acesso.' }, { status: 500 });
    }
}
