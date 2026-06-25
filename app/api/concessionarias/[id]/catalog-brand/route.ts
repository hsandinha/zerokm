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

// Aceita uma lista de marcaIds (multi marcas). Mantém compatibilidade com o
// formato antigo de marca única (marcaId / marca).
async function resolveMarcas(body: any): Promise<{ ids: any[]; nomes: string[] }> {
    const rawIds: unknown[] = Array.isArray(body?.marcaIds)
        ? body.marcaIds
        : body?.marcaId
            ? [body.marcaId]
            : [];

    const ids = rawIds.map(normalizeText).filter(Boolean);

    if (ids.length === 0) {
        // Permite limpar todas as marcas, ou cadastrar por nome (formato antigo).
        if (body?.marca) {
            const marca = await resolveMarca(undefined, body.marca);
            return { ids: [marca._id], nomes: [marca.nome] };
        }
        return { ids: [], nomes: [] };
    }

    const marcas = await Marca.find({ _id: { $in: ids } });
    const byId = new Map(marcas.map(m => [m._id.toString(), m]));

    const resolvedIds: any[] = [];
    const nomes: string[] = [];
    for (const id of ids) {
        const marca = byId.get(id);
        if (!marca) throw new Error('Marca não encontrada');
        resolvedIds.push(marca._id);
        nomes.push(marca.nome);
    }

    return { ids: resolvedIds, nomes };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const access = await assertCanLinkBrand();
        if (access.error) return access.error;

        await connectDB();

        const { id } = await params;
        const body = await request.json();
        const { ids, nomes } = await resolveMarcas(body);

        const concessionaria = await Concessionaria.findByIdAndUpdate(
            id,
            {
                $set: {
                    marcaIds: ids,
                    marcas: nomes,
                    // Mantém os campos legados sincronizados com a primeira marca.
                    marcaId: ids[0] ?? null,
                    marca: nomes[0] ?? null,
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
            marcaIds: (concessionaria.marcaIds || []).map((m: any) => m.toString()),
            marcas: concessionaria.marcas || [],
        });
    } catch (error: any) {
        console.error('Erro ao vincular marca da concessionária:', error);
        return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
    }
}
