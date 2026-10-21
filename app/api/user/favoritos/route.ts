import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import Favorito from '@/models/Favorito';
import FavoritoVeiculo from '@/models/FavoritoVeiculo';
import { resumoFavoritos } from '@/lib/services/favoritosService';

export const dynamic = 'force-dynamic';

const MAX_FAVORITOS = 100;
const texto = (valor: unknown) => (typeof valor === 'string' ? valor.trim() : '');

async function emailDaSessao() {
    const session = await getServerSession(authOptions);
    return session?.user?.email?.toLowerCase().trim() || null;
}

/**
 * GET /api/user/favoritos -> { veiculos, favoritos, totalNovos }
 *   veiculos: ofertas específicas favoritadas (o jeito atual);
 *   favoritos: modelos monitorados no formato antigo, até o cliente remover.
 */
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

/**
 * POST /api/user/favoritos { veiculoId, origem, marca, modelo, ano?, cor?, tipoVeiculo?, imagemUrl? }
 * -> favorita o veículo específico da linha (pedido do Márcio: antes era o modelo).
 */
export async function POST(request: Request) {
    try {
        const email = await emailDaSessao();
        if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const body = await request.json().catch(() => ({}));
        const veiculoId = texto(body?.veiculoId);
        if (!veiculoId) return NextResponse.json({ error: 'Informe o veículo.' }, { status: 400 });
        await connectDB();
        const existe = await FavoritoVeiculo.exists({ userEmail: email, veiculoId });
        if (!existe && await FavoritoVeiculo.countDocuments({ userEmail: email }) >= MAX_FAVORITOS) {
            return NextResponse.json({ error: `Limite de ${MAX_FAVORITOS} veículos favoritos atingido.` }, { status: 400 });
        }
        // Começa a contar a partir de agora: só alteração depois daqui é novidade.
        await FavoritoVeiculo.updateOne(
            { userEmail: email, veiculoId },
            {
                $setOnInsert: {
                    userEmail: email,
                    veiculoId,
                    origem: body?.origem === 'repasse' ? 'repasse' : 'novo',
                    marca: texto(body?.marca),
                    modelo: texto(body?.modelo),
                    ano: texto(body?.ano) || undefined,
                    cor: texto(body?.cor) || undefined,
                    tipoVeiculo: texto(body?.tipoVeiculo) || undefined,
                    imagemUrl: texto(body?.imagemUrl) || undefined,
                    lastSeenAt: new Date(),
                },
            },
            { upsert: true },
        );
        return NextResponse.json({ ok: true });
    } catch (error: any) {
        console.error('[favoritos] POST', error);
        return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
    }
}

/**
 * DELETE /api/user/favoritos?veiculoId=... -> tira o veículo dos favoritos.
 * DELETE /api/user/favoritos?marca=...&modelo=... -> remove um favorito antigo por modelo.
 */
export async function DELETE(request: Request) {
    try {
        const email = await emailDaSessao();
        if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const params = new URL(request.url).searchParams;
        const veiculoId = texto(params.get('veiculoId'));
        const marca = texto(params.get('marca'));
        const modelo = texto(params.get('modelo'));
        if (!veiculoId && (!marca || !modelo)) return NextResponse.json({ error: 'Informe o veículo.' }, { status: 400 });
        await connectDB();
        if (veiculoId) await FavoritoVeiculo.deleteOne({ userEmail: email, veiculoId });
        else await Favorito.deleteOne({ userEmail: email, marca, modelo });
        return NextResponse.json({ ok: true });
    } catch (error: any) {
        console.error('[favoritos] DELETE', error);
        return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
    }
}
