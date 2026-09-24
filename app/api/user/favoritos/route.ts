import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import Favorito from '@/models/Favorito';
import { resumoFavoritos } from '@/lib/services/favoritosService';

export const dynamic = 'force-dynamic';

const MAX_FAVORITOS = 100;
const texto = (valor: unknown) => (typeof valor === 'string' ? valor.trim() : '');

async function emailDaSessao() {
    const session = await getServerSession(authOptions);
    return session?.user?.email?.toLowerCase().trim() || null;
}

/** GET /api/user/favoritos -> carros monitorados, com ofertas disponíveis e novidades. */
export async function GET() {
    try {
        const email = await emailDaSessao();
        if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        await connectDB();
        return NextResponse.json(await resumoFavoritos(email));
    } catch (error: any) {
        console.error('[favoritos] GET', error);
        return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
    }
}

/** POST /api/user/favoritos { marca, modelo, tipoVeiculo?, imagemUrl? } -> passa a monitorar o carro. */
export async function POST(request: Request) {
    try {
        const email = await emailDaSessao();
        if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const body = await request.json().catch(() => ({}));
        const marca = texto(body?.marca);
        const modelo = texto(body?.modelo);
        if (!marca || !modelo) return NextResponse.json({ error: 'Informe marca e modelo.' }, { status: 400 });
        await connectDB();
        const existe = await Favorito.exists({ userEmail: email, marca, modelo });
        if (!existe && await Favorito.countDocuments({ userEmail: email }) >= MAX_FAVORITOS) {
            return NextResponse.json({ error: `Limite de ${MAX_FAVORITOS} carros monitorados atingido.` }, { status: 400 });
        }
        // Começa a contar a partir de agora: o que já está na vitrine não é novidade.
        await Favorito.updateOne(
            { userEmail: email, marca, modelo },
            { $setOnInsert: { userEmail: email, marca, modelo, tipoVeiculo: texto(body?.tipoVeiculo) || undefined, imagemUrl: texto(body?.imagemUrl) || undefined, lastSeenAt: new Date() } },
            { upsert: true },
        );
        return NextResponse.json({ ok: true });
    } catch (error: any) {
        console.error('[favoritos] POST', error);
        return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
    }
}

/** DELETE /api/user/favoritos?marca=...&modelo=... -> para de monitorar. */
export async function DELETE(request: Request) {
    try {
        const email = await emailDaSessao();
        if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const params = new URL(request.url).searchParams;
        const marca = texto(params.get('marca'));
        const modelo = texto(params.get('modelo'));
        if (!marca || !modelo) return NextResponse.json({ error: 'Informe marca e modelo.' }, { status: 400 });
        await connectDB();
        await Favorito.deleteOne({ userEmail: email, marca, modelo });
        return NextResponse.json({ ok: true });
    } catch (error: any) {
        console.error('[favoritos] DELETE', error);
        return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
    }
}
