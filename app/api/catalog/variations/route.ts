import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import Marca from '@/models/Marca';
import VehicleVariation from '@/models/VehicleVariation';

const MASTER_CATALOG_PROFILES = new Set(['admin', 'administrador', 'gerente', 'operador', 'operator']);

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function normalizeText(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function serializeVariation(doc: any) {
    const obj = typeof doc.toObject === 'function' ? doc.toObject() : doc;
    return {
        ...obj,
        id: obj._id?.toString(),
        _id: undefined,
        marcaId: obj.marcaId?.toString?.() || obj.marcaId,
    };
}

async function assertCanManageCatalog() {
    const session = await getServerSession(authOptions);
    const profile = session?.user?.profile;

    if (!session) {
        return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    }

    if (!profile || !MASTER_CATALOG_PROFILES.has(profile)) {
        return { error: NextResponse.json({ error: 'Acesso negado ao catálogo' }, { status: 403 }) };
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

export async function GET(request: Request) {
    try {
        const access = await assertCanManageCatalog();
        if (access.error) return access.error;

        await connectDB();

        const { searchParams } = new URL(request.url);
        const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
        const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '100', 10)));
        const skip = (page - 1) * limit;
        const search = normalizeText(searchParams.get('search'));
        const marca = normalizeText(searchParams.get('marca'));
        const marcaId = normalizeText(searchParams.get('marcaId'));
        const activeParam = searchParams.get('active');

        const query: any = {};
        if (activeParam !== 'all') query.ativo = activeParam === 'false' ? false : true;
        if (marcaId) query.marcaId = marcaId;
        if (marca) query.marca = { $regex: `^${escapeRegex(marca)}$`, $options: 'i' };
        if (search) {
            const regex = { $regex: escapeRegex(search), $options: 'i' };
            query.$or = [
                { marca: regex },
                { modelo: regex },
                { versao: regex },
                { codigoFipe: regex },
            ];
        }

        const [data, total] = await Promise.all([
            VehicleVariation.find(query)
                .sort({ marca: 1, modelo: 1, versao: 1, anoModelo: -1 })
                .skip(skip)
                .limit(limit),
            VehicleVariation.countDocuments(query),
        ]);

        return NextResponse.json({
            data: data.map(serializeVariation),
            total,
            page,
            totalPages: Math.ceil(total / limit),
            hasNextPage: skip + data.length < total,
        });
    } catch (error: any) {
        console.error('Erro ao buscar catálogo:', error);
        return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const access = await assertCanManageCatalog();
        if (access.error) return access.error;

        await connectDB();

        const body = await request.json();
        const modelo = normalizeText(body.modelo);
        const marca = await resolveMarca(normalizeText(body.marcaId), body.marca);

        if (!modelo) {
            return NextResponse.json({ error: 'Modelo é obrigatório' }, { status: 400 });
        }

        const variation = await VehicleVariation.create({
            marcaId: marca._id,
            marca: marca.nome,
            modelo,
            versao: normalizeText(body.versao) || undefined,
            codigoFipe: normalizeText(body.codigoFipe) || undefined,
            tipoVeiculo: body.tipoVeiculo || 'carro',
            anoModelo: body.anoModelo ? Number(body.anoModelo) : undefined,
            anoFabricacao: body.anoFabricacao ? Number(body.anoFabricacao) : undefined,
            combustivel: normalizeText(body.combustivel) || undefined,
            transmissao: normalizeText(body.transmissao) || undefined,
            motor: normalizeText(body.motor) || undefined,
            carroceria: normalizeText(body.carroceria) || undefined,
            portas: body.portas ? Number(body.portas) : undefined,
            opcionaisPadrao: Array.isArray(body.opcionaisPadrao) ? body.opcionaisPadrao : [],
            imagemUrl: normalizeText(body.imagemUrl) || undefined,
            ativo: body.ativo !== false,
            createdBy: access.session?.user?.email || undefined,
        });

        return NextResponse.json(serializeVariation(variation), { status: 201 });
    } catch (error: any) {
        console.error('Erro ao criar variação:', error);
        const status = error?.code === 11000 ? 409 : 500;
        return NextResponse.json({
            error: status === 409 ? 'Esta variação já existe para a marca' : (error.message || 'Erro interno'),
        }, { status });
    }
}
