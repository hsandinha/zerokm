import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import Concessionaria from '@/models/Concessionaria';
import Marca from '@/models/Marca';

const BRAND_LINK_PROFILES = new Set(['admin', 'administrador', 'gerente', 'operador', 'operator']);

function normalizeText(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

async function assertCanLinkBrand() {
    const session = await getServerSession(authOptions);
    const profile = session?.user?.profile;

    if (!session) {
        return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    }

    if (!profile || !BRAND_LINK_PROFILES.has(profile)) {
        return { error: NextResponse.json({ error: 'Acesso negado' }, { status: 403 }) };
    }

    return { session };
}

async function resolveMarca(marcaId?: string, marcaName?: string) {
    if (marcaId) {
        const marca = await Marca.findById(marcaId);
        if (!marca) throw new Error('Marca não encontrada');
        return marca;
    }

    const nome = normalizeText(marcaName);
    if (!nome) throw new Error('Marca é obrigatória');

    return Marca.findOneAndUpdate(
        { nome },
        { $setOnInsert: { nome } },
        { new: true, upsert: true }
    );
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const access = await assertCanLinkBrand();
        if (access.error) return access.error;

        await connectDB();

        const { id } = await params;
        const body = await request.json();
        const marca = await resolveMarca(normalizeText(body.marcaId), body.marca);

        const concessionaria = await Concessionaria.findByIdAndUpdate(
            id,
            {
                $set: {
                    marcaId: marca._id,
                    marca: marca.nome,
                },
            },
            { new: true }
        );

        if (!concessionaria) {
            return NextResponse.json({ error: 'Concessionária não encontrada' }, { status: 404 });
        }

        return NextResponse.json({
            id: concessionaria._id.toString(),
            nome: concessionaria.nome,
            marcaId: concessionaria.marcaId?.toString?.() || null,
            marca: concessionaria.marca || null,
        });
    } catch (error: any) {
        console.error('Erro ao vincular marca da concessionária:', error);
        return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
    }
}
