import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import Concessionaria from '@/models/Concessionaria';
import Marca from '@/models/Marca';

// O administrativo cuida do cadastro das lojas e do estoque: estava fora da
// lista e recebia "Acesso negado" ao vincular qualquer marca.
const BRAND_LINK_PROFILES = new Set(['admin', 'administrador', 'administrativo', 'gerente', 'operador', 'operator']);

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

/**
 * Aceita uma lista de marcaIds (multi marcas). Mantém compatibilidade com o
 * formato antigo de marca única (marcaId / marca).
 *
 * Uma marca que saiu do cadastro (excluída ou unificada com outra) continuava
 * presa à loja. Como a tela manda a lista inteira a cada clique, esse id velho
 * derrubava o pedido com "Marca não encontrada" e nenhuma marca nova entrava:
 * era o que travava as multimarcas com estoque antigo. Agora o id velho é
 * reaproveitado pelo nome (a marca recriada com outro id) ou descartado.
 */
async function resolveMarcas(body: any, atual: any): Promise<{ ids: any[]; nomes: string[]; descartadas: string[] }> {
    const rawIds: unknown[] = Array.isArray(body?.marcaIds)
        ? body.marcaIds
        : body?.marcaId
            ? [body.marcaId]
            : [];

    const ids = Array.from(new Set(rawIds.map(normalizeText).filter(Boolean)));

    if (ids.length === 0) {
        // Permite limpar todas as marcas, ou cadastrar por nome (formato antigo).
        if (body?.marca) {
            const marca = await resolveMarca(undefined, body.marca);
            return { ids: [marca._id], nomes: [marca.nome], descartadas: [] };
        }
        return { ids: [], nomes: [], descartadas: [] };
    }

    const validos = ids.filter(id => mongoose.isValidObjectId(id));
    const marcas = await Marca.find({ _id: { $in: validos } });
    const byId = new Map(marcas.map(m => [m._id.toString(), m]));

    // Nome com que a loja guardou cada id, para achar a marca se o id mudou.
    const nomeGuardado = new Map<string, string>();
    const idsAtuais: any[] = atual?.marcaIds?.length ? atual.marcaIds : atual?.marcaId ? [atual.marcaId] : [];
    const nomesAtuais: string[] = atual?.marcas?.length ? atual.marcas : atual?.marca ? [atual.marca] : [];
    idsAtuais.forEach((id: any, i: number) => {
        if (id && nomesAtuais[i]) nomeGuardado.set(String(id), nomesAtuais[i]);
    });

    const resolvedIds: any[] = [];
    const nomes: string[] = [];
    const descartadas: string[] = [];
    const vistos = new Set<string>();
    for (const id of ids) {
        let marca = byId.get(id);
        if (!marca) {
            const nome = nomeGuardado.get(id) || (!mongoose.isValidObjectId(id) ? id : '');
            marca = nome ? await Marca.findOne({ nome: { $regex: `^${escapeRegex(nome)}$`, $options: 'i' } }) ?? undefined : undefined;
        }
        if (!marca) {
            descartadas.push(nomeGuardado.get(id) || id);
            continue;
        }
        const chave = marca._id.toString();
        if (vistos.has(chave)) continue;
        vistos.add(chave);
        resolvedIds.push(marca._id);
        nomes.push(marca.nome);
    }

    return { ids: resolvedIds, nomes, descartadas };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const access = await assertCanLinkBrand();
        if (access.error) return access.error;

        await connectDB();

        const { id } = await params;
        if (!mongoose.isValidObjectId(id)) {
            return NextResponse.json({ error: 'Concessionária não encontrada' }, { status: 404 });
        }
        const body = await request.json();
        const atual = await Concessionaria.findById(id).select('marcaId marca marcaIds marcas').lean();
        if (!atual) {
            return NextResponse.json({ error: 'Concessionária não encontrada' }, { status: 404 });
        }
        const { ids, nomes, descartadas } = await resolveMarcas(body, atual);

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
            // Marcas antigas que não existem mais no cadastro e saíram da loja.
            descartadas,
        });
    } catch (error: any) {
        console.error('Erro ao vincular marca da concessionária:', error);
        return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
    }
}
