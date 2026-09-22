import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import RepasseVehicle from '@/models/RepasseVehicle';
import VehicleVariation from '@/models/VehicleVariation';
import { resolveDealershipScope } from '@/lib/services/dealershipScope';
import { REPASSE_STATUS, serializeRepasse, validateRepasse } from '@/lib/utils/repasse';
import { MSG_PLANO_REPASSE_INATIVO, isPlanoRepasseAtivo, serializePlanoRepasse } from '@/lib/utils/planoRepasse';

export const dynamic = 'force-dynamic';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** GET /api/dealership/repasse?status=&search=&page=&limit=&concessionariaId= */
export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        await connectDB();

        const scope = await resolveDealershipScope(session, request);
        if (scope.kind === 'none') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
        if (!scope.concessionaria) return NextResponse.json({ error: 'Concessionária não encontrada' }, { status: 404 });

        const { searchParams } = new URL(request.url);
        const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
        const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
        const status = searchParams.get('status')?.trim() || '';
        const search = searchParams.get('search')?.trim() || '';

        const query: any = { concessionariaId: scope.concessionaria._id, ativo: true };
        if (status && (REPASSE_STATUS as readonly string[]).includes(status)) query.status = status;
        if (search) {
            const regex = { $regex: escapeRegex(search), $options: 'i' };
            query.$or = [{ marca: regex }, { modelo: regex }, { cor: regex }, { observacoes: regex }];
        }

        const baseCount = { concessionariaId: scope.concessionaria._id, ativo: true };
        const [data, total, porStatus] = await Promise.all([
            RepasseVehicle.find(query).sort({ updatedAt: -1, _id: 1 }).skip((page - 1) * limit).limit(limit),
            RepasseVehicle.countDocuments(query),
            RepasseVehicle.aggregate([{ $match: baseCount }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
        ]);

        const contagem: Record<string, number> = { 'Disponível': 0 };
        for (const row of porStatus) contagem[row._id] = row.n;

        return NextResponse.json({
            data: data.map(serializeRepasse),
            total,
            page,
            totalPages: Math.ceil(total / limit),
            hasNextPage: page * limit < total,
            contagem,
            concessionaria: { id: scope.concessionaria._id.toString(), nome: scope.concessionaria.nome },
            plano: serializePlanoRepasse(scope.concessionaria.planoRepasse),
        });
    } catch (error: any) {
        console.error('[repasse] GET', error);
        return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
    }
}

/** POST /api/dealership/repasse — cria um veículo de repasse. */
export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        await connectDB();

        const scope = await resolveDealershipScope(session, request);
        if (scope.kind === 'none') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
        if (!scope.concessionaria) return NextResponse.json({ error: 'Concessionária não encontrada' }, { status: 404 });

        // Anunciar repasse é pago pela concessionária. Vale também para a equipe
        // interna: para cadastrar em nome da loja, ative o plano (manual ou cortesia).
        if (!isPlanoRepasseAtivo(scope.concessionaria.planoRepasse)) {
            return NextResponse.json({ error: MSG_PLANO_REPASSE_INATIVO, code: 'PLANO_REPASSE_INATIVO' }, { status: 402 });
        }

        const body = await request.json().catch(() => ({}));
        const { data, errors } = validateRepasse(body, false);
        if (errors.length) return NextResponse.json({ error: errors.join(' '), errors }, { status: 400 });

        // Modelo vem do catálogo. Texto livre só com a marcação explícita, usada
        // em carro antigo que saiu de linha e não existe mais no catálogo.
        const foraDoCatalogo = body?.foraDoCatalogo === true;
        if (!foraDoCatalogo && data.modelo) {
            const existe = await VehicleVariation.exists({ modelo: data.modelo, ativo: true });
            if (!existe) {
                return NextResponse.json({
                    error: `"${data.modelo}" não está no catálogo. Escolha um modelo da lista ou marque "modelo fora do catálogo".`,
                    code: 'MODELO_FORA_DO_CATALOGO',
                }, { status: 400 });
            }
        }

        const created = await RepasseVehicle.create({
            ...data,
            foraDoCatalogo,
            concessionariaId: scope.concessionaria._id,
            createdBy: session.user?.email || undefined,
        });
        return NextResponse.json(serializeRepasse(created), { status: 201 });
    } catch (error: any) {
        console.error('[repasse] POST', error);
        return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
    }
}
