import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import Marca from '@/models/Marca';
import VehicleVariation from '@/models/VehicleVariation';

const MASTER_CATALOG_PROFILES = new Set(['admin', 'administrador', 'administrativo', 'gerente', 'operador', 'operator']);

function normalizeText(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function parseNumber(value: unknown) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    const normalized = normalizeText(value).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.');
    if (!normalized) return undefined;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
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
    if (!nome) return null;

    return Marca.findOneAndUpdate(
        { nome },
        { $setOnInsert: { nome } },
        { new: true, upsert: true }
    );
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const access = await assertCanManageCatalog();
        if (access.error) return access.error;

        await connectDB();

        const { id } = await params;
        const body = await request.json();
        const update: Record<string, any> = {};

        const marca = await resolveMarca(normalizeText(body.marcaId), body.marca);
        if (marca) {
            update.marcaId = marca._id;
            update.marca = marca.nome;
        }

        const textFields = [
            'modelo',
            'versao',
            'codigoFipe',
            'tipoVeiculo',
            'ano',
            'combustivel',
            'cor',
            'transmissao',
            'motor',
            'carroceria',
            'opcionais',
            'status',
            'observacoes',
            'cidade',
            'estado',
            'telefone',
            'concessionaria',
            'nomeContato',
            'operador',
            'imagemUrl',
        ];

        for (const field of textFields) {
            if (Object.prototype.hasOwnProperty.call(body, field)) {
                update[field] = normalizeText(body[field]) || undefined;
            }
        }

        const numberFields = ['anoModelo', 'anoFabricacao', 'portas', 'preco', 'frete'];
        for (const field of numberFields) {
            if (Object.prototype.hasOwnProperty.call(body, field)) {
                update[field] = parseNumber(body[field]);
            }
        }

        if (Object.prototype.hasOwnProperty.call(body, 'ativo')) {
            update.ativo = body.ativo !== false;
        }

        if (Array.isArray(body.opcionaisPadrao)) {
            update.opcionaisPadrao = body.opcionaisPadrao;
        }

        const variation = await VehicleVariation.findByIdAndUpdate(id, { $set: update }, { new: true });
        if (!variation) {
            return NextResponse.json({ error: 'Variação não encontrada' }, { status: 404 });
        }

        return NextResponse.json(serializeVariation(variation));
    } catch (error: any) {
        console.error('Erro ao atualizar variação:', error);
        const status = error?.code === 11000 ? 409 : 500;
        return NextResponse.json({
            error: status === 409 ? 'Esta variação já existe para a marca' : (error.message || 'Erro interno'),
        }, { status });
    }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const access = await assertCanManageCatalog();
        if (access.error) return access.error;

        await connectDB();

        const { id } = await params;
        const variation = await VehicleVariation.findByIdAndUpdate(id, { $set: { ativo: false } }, { new: true });
        if (!variation) {
            return NextResponse.json({ error: 'Variação não encontrada' }, { status: 404 });
        }

        return NextResponse.json(serializeVariation(variation));
    } catch (error: any) {
        console.error('Erro ao desativar variação:', error);
        return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
    }
}
