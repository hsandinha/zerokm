import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import Concessionaria from '@/models/Concessionaria';
import DealerVehiclePrice from '@/models/DealerVehiclePrice';
import User from '@/models/User';
import VehicleVariation from '@/models/VehicleVariation';

const ADMIN_PROFILES = new Set(['admin', 'administrador', 'gerente', 'operador', 'operator', 'administrativo']);
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
        opcionais: row.opcionais,
        opcionaisPadrao: row.opcionaisPadrao || [],
        imagemUrl: row.imagemUrl,
        priceId: price?._id?.toString?.() || null,
        preco: priceValue,
        frete: typeof price?.frete === 'number' ? price.frete : null,
        quantidade: typeof price?.quantidade === 'number' ? price.quantidade : 0,
        prazo: typeof price?.prazo === 'number' ? price.prazo : null,
        coresDisponiveis: price?.coresDisponiveis || [],
        observacoes: price?.observacoes || '',
        statusVeiculo: price?.statusVeiculo || row.status || 'A faturar',
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
    const orConditions = [];

    if (concessionaria?.marcaIds && concessionaria.marcaIds.length > 0) {
        orConditions.push({ marcaId: { $in: concessionaria.marcaIds } });
    } else if (concessionaria?.marcaId) {
        orConditions.push({ marcaId: concessionaria.marcaId });
    }

    if (concessionaria?.marcas && concessionaria.marcas.length > 0) {
        const regexList = concessionaria.marcas.map((m: string) => new RegExp(`^${escapeRegex(m)}$`, 'i'));
        orConditions.push({ marca: { $in: regexList } });
    } else if (concessionaria?.marca) {
        orConditions.push({ marca: { $regex: `^${escapeRegex(concessionaria.marca)}$`, $options: 'i' } });
    }

    if (orConditions.length > 0) {
        return { $or: orConditions };
    }

    return null;
}

function assertVariationBelongsToDealership(variation: any, concessionaria: any) {
    let matchesId = false;
    if (variation?.marcaId) {
        if (concessionaria?.marcaIds && concessionaria.marcaIds.length > 0) {
            matchesId = concessionaria.marcaIds.some((id: any) => id.toString() === variation.marcaId.toString());
        } else if (concessionaria?.marcaId) {
            matchesId = variation.marcaId.toString() === concessionaria.marcaId.toString();
        }
    }

    let matchesName = false;
    if (variation?.marca) {
        if (concessionaria?.marcas && concessionaria.marcas.length > 0) {
            matchesName = concessionaria.marcas.some((m: string) => m.toLowerCase() === variation.marca.toLowerCase());
        } else if (concessionaria?.marca) {
            matchesName = variation.marca.toLowerCase() === concessionaria.marca.toLowerCase();
        }
    }

    return matchesId || matchesName;
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

        const variationMatch: any = { ativo: true };
        
        // Add brand match logic to the match query properly
        if (brandMatch.$or) {
            variationMatch.$or = brandMatch.$or;
        } else {
            Object.assign(variationMatch, brandMatch);
        }
        if (search) {
            const regex = { $regex: escapeRegex(search), $options: 'i' };
            const searchOr = [
                { modelo: regex },
                { codigoFipe: regex },
                { combustivel: regex },
                { cor: regex },
                { transmissao: regex },
            ];
            
            if (variationMatch.$or) {
                variationMatch.$and = [{ $or: variationMatch.$or }, { $or: searchOr }];
                delete variationMatch.$or;
            } else {
                variationMatch.$or = searchOr;
            }
        }

        const pipeline: any[] = [
            { $match: variationMatch },
            {
                $lookup: {
                    from: DealerVehiclePrice.collection.name,
                    let: { variationId: { $toString: '$_id' } },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: [{ $toString: '$variationId' }, '$$variationId'] },
                                        { $eq: [{ $toString: '$concessionariaId' }, concessionaria._id.toString()] },
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
            { $sort: { modelo: 1, cor: 1, anoModelo: -1 } },
            {
                $facet: {
                    metadata: [{ $count: 'total' }],
                    activeMetadata: [{ $match: { hasActivePrice: true } }, { $count: 'total' }],
                    activeTotalQuantidade: [
                        { $match: { hasActivePrice: true } },
                        { $group: { _id: null, total: { $sum: { $ifNull: ['$priceRecord.quantidade', 0] } } } },
                    ],
                    data: [{ $skip: skip }, { $limit: limit }],
                },
            }
        );

        const [result] = await VehicleVariation.aggregate(pipeline);
        const data = result?.data || [];
        const total = result?.metadata?.[0]?.total || 0;
        const activeCount = result?.activeMetadata?.[0]?.total || 0;
        const totalQuantidade = result?.activeTotalQuantidade?.[0]?.total || 0;

        return NextResponse.json({
            concessionaria: {
                id: concessionaria._id.toString(),
                nome: concessionaria.nome,
                marca: concessionaria.marca || null,
                marcaId: concessionaria.marcaId?.toString?.() || null,
                cidade: concessionaria.cidade || null,
                uf: concessionaria.uf || null,
                telefone: concessionaria.telefone || null,
                contato: concessionaria.contato || null,
                nomeResponsavel: concessionaria.nomeResponsavel || null,
                operadorId: concessionaria.operadorId?.toString?.() || null,
            },
            data: data.map(serializeCatalogRow),
            total,
            activeCount,
            totalQuantidade,
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
                statusVeiculo: body.statusVeiculo || variation.status || 'A faturar',
            });
        }

        const frete = body.frete === '' || body.frete === null || body.frete === undefined ? null : Number(body.frete);
        if (frete !== null && (!Number.isFinite(frete) || frete < 0)) {
            return NextResponse.json({ error: 'Frete inválido' }, { status: 400 });
        }

        const prazo = body.prazo === '' || body.prazo === null || body.prazo === undefined ? null : parseInt(body.prazo, 10);
        if (prazo !== null && (!Number.isFinite(prazo) || prazo < 0)) {
            return NextResponse.json({ error: 'Prazo inválido' }, { status: 400 });
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
                    quantidade: body.quantidade !== undefined ? body.quantidade : undefined,
                    prazo,
                    coresDisponiveis: Array.isArray(body.coresDisponiveis) ? body.coresDisponiveis : [],
                    observacoes: normalizeText(body.observacoes) || undefined,
                    statusVeiculo: normalizeText(body.statusVeiculo) || undefined,
                },
            },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        return NextResponse.json({
            variationId,
            priceId: price._id.toString(),
            preco: price.preco,
            frete: price.frete,
            quantidade: price.quantidade,
            prazo: price.prazo,
            coresDisponiveis: price.coresDisponiveis || [],
            observacoes: price.observacoes || '',
            statusVeiculo: price.statusVeiculo || variation.status || 'A faturar',
            ativo: price.ativo,
            status: price.ativo ? 'ativo' : 'inativo',
        });
    } catch (error: any) {
        console.error('Erro ao atualizar preço da concessionária:', error);
        return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
    }
}
