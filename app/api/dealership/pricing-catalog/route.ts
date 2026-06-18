import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import Concessionaria from '@/models/Concessionaria';
import DealerVehiclePrice from '@/models/DealerVehiclePrice';
import User from '@/models/User';
import VehicleVariation from '@/models/VehicleVariation';

const ADMIN_PROFILES = new Set(['admin', 'administrador', 'gerente', 'operador', 'operator']);
const DEALERSHIP_PROFILES = new Set(['concessionaria', 'dealership']);

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function normalizeText(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function serializeCatalogRow(row: any) {
    const price = row.priceRecord || null;
    const priceValue = typeof price?.preco === 'number' ? price.preco : null;

    return {
        id: row._id?.toString?.() || String(row._id),
        variationId: row._id?.toString?.() || String(row._id),
        marcaId: row.marcaId?.toString?.() || row.marcaId,
        marca: row.marca,
        modelo: row.modelo,
        versao: row.versao,
        codigoFipe: row.codigoFipe,
        tipoVeiculo: row.tipoVeiculo,
        anoModelo: row.anoModelo,
        anoFabricacao: row.anoFabricacao,
        combustivel: row.combustivel,
        cor: row.cor,
        transmissao: row.transmissao,
        motor: row.motor,
        carroceria: row.carroceria,
        portas: row.portas,
        opcionaisPadrao: row.opcionaisPadrao || [],
        imagemUrl: row.imagemUrl,
        priceId: price?._id?.toString?.() || null,
        preco: priceValue,
        frete: typeof price?.frete === 'number' ? price.frete : null,
        coresDisponiveis: price?.coresDisponiveis || [],
        observacoes: price?.observacoes || '',
        ativo: priceValue !== null && priceValue > 0,
        status: priceValue !== null && priceValue > 0 ? 'ativo' : 'inativo',
        updatedAt: price?.updatedAt || row.updatedAt,
    };
}

async function resolveConcessionaria(session: any, request: Request) {
    const profile = session?.user?.profile;
    const url = new URL(request.url);
    const requestedId = normalizeText(url.searchParams.get('concessionariaId'));

    if (profile && ADMIN_PROFILES.has(profile) && requestedId) {
        return Concessionaria.findById(requestedId);
    }

    if (profile && DEALERSHIP_PROFILES.has(profile)) {
        const user = await User.findOne({ email: session.user.email }).select('dealershipId');
        if (!user?.dealershipId) return null;
        return Concessionaria.findById(user.dealershipId);
    }

    return null;
}

function buildBrandMatch(concessionaria: any) {
    if (concessionaria?.marcaId) {
        return { marcaId: concessionaria.marcaId };
    }

    if (concessionaria?.marca) {
        return { marca: { $regex: `^${escapeRegex(concessionaria.marca)}$`, $options: 'i' } };
    }

    return null;
}

function assertVariationBelongsToDealership(variation: any, concessionaria: any) {
    if (concessionaria?.marcaId && variation?.marcaId) {
        return variation.marcaId.toString() === concessionaria.marcaId.toString();
    }

    if (concessionaria?.marca && variation?.marca) {
        return variation.marca.toLowerCase() === concessionaria.marca.toLowerCase();
    }

    return false;
}

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        await connectDB();

        const concessionaria = await resolveConcessionaria(session, request);
        if (!concessionaria) {
            return NextResponse.json({ error: 'Concessionária não encontrada' }, { status: 404 });
        }

        const brandMatch = buildBrandMatch(concessionaria);
        if (!brandMatch) {
            return NextResponse.json({
                error: 'Concessionária sem marca vinculada',
                code: 'BRAND_NOT_LINKED',
                data: [],
                total: 0,
            }, { status: 409 });
        }

        const { searchParams } = new URL(request.url);
        const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
        const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '100', 10)));
        const skip = (page - 1) * limit;
        const search = normalizeText(searchParams.get('search'));
        const status = normalizeText(searchParams.get('status'));

        const variationMatch: any = { ativo: true, ...brandMatch };
        if (search) {
            const regex = { $regex: escapeRegex(search), $options: 'i' };
            variationMatch.$or = [
                { modelo: regex },
                { versao: regex },
                { codigoFipe: regex },
                { combustivel: regex },
                { cor: regex },
                { transmissao: regex },
            ];
        }

        const pipeline: any[] = [
            { $match: variationMatch },
            {
                $lookup: {
                    from: DealerVehiclePrice.collection.name,
                    let: { variationId: '$_id' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$variationId', '$$variationId'] },
                                        { $eq: ['$concessionariaId', concessionaria._id] },
                                    ],
                                },
                            },
                        },
                        { $limit: 1 },
                    ],
                    as: 'priceRecords',
                },
            },
            { $addFields: { priceRecord: { $first: '$priceRecords' } } },
            {
                $addFields: {
                    hasActivePrice: {
                        $gt: [{ $ifNull: ['$priceRecord.preco', 0] }, 0],
                    },
                },
            },
        ];

        if (status === 'ativo') pipeline.push({ $match: { hasActivePrice: true } });
        if (status === 'inativo') pipeline.push({ $match: { hasActivePrice: false } });

        pipeline.push(
            { $sort: { modelo: 1, versao: 1, cor: 1, anoModelo: -1 } },
            {
                $facet: {
                    metadata: [{ $count: 'total' }],
                    data: [{ $skip: skip }, { $limit: limit }],
                },
            }
        );

        const [result] = await VehicleVariation.aggregate(pipeline);
        const data = result?.data || [];
        const total = result?.metadata?.[0]?.total || 0;

        return NextResponse.json({
            concessionaria: {
                id: concessionaria._id.toString(),
                nome: concessionaria.nome,
                marca: concessionaria.marca || null,
                marcaId: concessionaria.marcaId?.toString?.() || null,
            },
            data: data.map(serializeCatalogRow),
            total,
            page,
            totalPages: Math.ceil(total / limit),
            hasNextPage: skip + data.length < total,
        });
    } catch (error: any) {
        console.error('Erro ao buscar catálogo de precificação:', error);
        return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        await connectDB();

        const concessionaria = await resolveConcessionaria(session, request);
        if (!concessionaria) {
            return NextResponse.json({ error: 'Concessionária não encontrada' }, { status: 404 });
        }

        const body = await request.json();
        const variationId = normalizeText(body.variationId);
        if (!variationId) {
            return NextResponse.json({ error: 'variationId é obrigatório' }, { status: 400 });
        }

        const variation = await VehicleVariation.findOne({ _id: variationId, ativo: true });
        if (!variation) {
            return NextResponse.json({ error: 'Variação não encontrada' }, { status: 404 });
        }

        if (!assertVariationBelongsToDealership(variation, concessionaria)) {
            return NextResponse.json({ error: 'Esta variação não pertence à marca da concessionária' }, { status: 403 });
        }

        const rawPrice = body.preco;
        const preco = rawPrice === '' || rawPrice === null || rawPrice === undefined ? null : Number(rawPrice);
        if (preco !== null && (!Number.isFinite(preco) || preco < 0)) {
            return NextResponse.json({ error: 'Preço inválido' }, { status: 400 });
        }

        if (!preco || preco <= 0) {
            await DealerVehiclePrice.deleteOne({
                variationId: variation._id,
                concessionariaId: concessionaria._id,
            });
            return NextResponse.json({
                variationId,
                preco: null,
                ativo: false,
                status: 'inativo',
            });
        }

        const frete = body.frete === '' || body.frete === null || body.frete === undefined ? null : Number(body.frete);
        if (frete !== null && (!Number.isFinite(frete) || frete < 0)) {
            return NextResponse.json({ error: 'Frete inválido' }, { status: 400 });
        }

        const price = await DealerVehiclePrice.findOneAndUpdate(
            {
                variationId: variation._id,
                concessionariaId: concessionaria._id,
            },
            {
                $set: {
                    preco,
                    frete,
                    coresDisponiveis: Array.isArray(body.coresDisponiveis) ? body.coresDisponiveis : [],
                    observacoes: normalizeText(body.observacoes) || undefined,
                },
            },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        return NextResponse.json({
            variationId,
            priceId: price._id.toString(),
            preco: price.preco,
            frete: price.frete,
            coresDisponiveis: price.coresDisponiveis || [],
            observacoes: price.observacoes || '',
            ativo: price.ativo,
            status: price.ativo ? 'ativo' : 'inativo',
        });
    } catch (error: any) {
        console.error('Erro ao atualizar preço da concessionária:', error);
        return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
    }
}
