import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import Concessionaria from '@/models/Concessionaria';
import DealerVehiclePrice from '@/models/DealerVehiclePrice';
import VehicleVariation from '@/models/VehicleVariation';
import RepasseVehicle from '@/models/RepasseVehicle';
import { REPASSE_STATUS_VITRINE } from '@/lib/utils/repasse';
import { filtroPlanoRepasseAtivo } from '@/lib/utils/planoRepasse';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { createExpiredFreeTrialWindow, isFreeTrialExpired } from '@/lib/utils/freeTrial';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalizeAccessProfile = (profile?: string | null) => profile === 'dealership' ? 'concessionaria' : profile;

const getEffectiveProfile = (session: any, requestedProfile?: string | null) => {
    const currentProfile = normalizeAccessProfile(session.user?.profile);
    const allowedProfiles = (session.user?.allowedProfiles || []).map(normalizeAccessProfile);
    const normalizedRequested = normalizeAccessProfile(requestedProfile);

    if (normalizedRequested && (normalizedRequested === currentProfile || allowedProfiles.includes(normalizedRequested))) {
        return normalizedRequested;
    }

    return currentProfile;
};

/**
 * Estágios que deixam um veículo de repasse com o mesmo formato do documento
 * 0KM depois dos $lookup (variation / concessionariaInfo / operadorInfo). Assim
 * o $match, a ordenação e a serialização abaixo valem para os dois sem
 * nenhum caminho especial.
 *
 * Só entra repasse de concessionária com plano de repasse em dia. Vencido, os
 * anúncios saem da vitrine sem ser apagados e voltam quando a loja renova.
 */
function repasseAsVitrineStages(now: Date = new Date()) {
    return [
        { $match: { ativo: true, status: { $in: REPASSE_STATUS_VITRINE } } },
        {
            $lookup: {
                from: Concessionaria.collection.name,
                localField: 'concessionariaId',
                foreignField: '_id',
                as: 'concessionariaInfo',
            },
        },
        { $unwind: { path: '$concessionariaInfo', preserveNullAndEmptyArrays: true } },
        { $match: filtroPlanoRepasseAtivo('concessionariaInfo.', now) },
        {
            $lookup: {
                from: 'users',
                localField: 'concessionariaInfo.operadorId',
                foreignField: '_id',
                as: 'operadorInfo',
            },
        },
        { $unwind: { path: '$operadorInfo', preserveNullAndEmptyArrays: true } },
        {
            $project: {
                _id: 1,
                origem: { $literal: 'repasse' },
                concessionariaId: 1,
                concessionariaInfo: 1,
                operadorInfo: 1,
                preco: 1,
                frete: { $literal: 0 },
                quantidade: { $literal: 1 },
                // Usado está no pátio: Pronta Entrega.
                prazo: { $literal: 0 },
                coresDisponiveis: { $literal: [] },
                observacoes: 1,
                statusVeiculo: '$status',
                ativo: { $literal: true },
                km: 1,
                createdAt: 1,
                updatedAt: 1,
                variation: {
                    _id: '$_id',
                    ativo: { $literal: true },
                    tipoVeiculo: '$tipoVeiculo',
                    marca: '$marca',
                    modelo: '$modelo',
                    ano: '$ano',
                    anoModelo: '$anoModelo',
                    anoFabricacao: '$anoFabricacao',
                    combustivel: '$combustivel',
                    transmissao: '$transmissao',
                    cor: '$cor',
                    opcionais: '$opcionais',
                },
            },
        },
    ];
}

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();

        const { searchParams } = new URL(request.url);
        const effectiveProfile = getEffectiveProfile(session, searchParams.get('accessProfile'));

        // --- Verificações de Assinatura e Teste Grátis ---
        if ((effectiveProfile === 'gratis' || effectiveProfile === 'cliente') && session.user?.email) {
            const user = await User.findOne({ email: session.user.email }).select('allowedProfiles freeTrialExpiresAt subscription');

            if (effectiveProfile === 'cliente' && user?.allowedProfiles?.includes('cliente') && user.subscription?.expiresAt) {
                const expiresAt = new Date(user.subscription.expiresAt);
                if (expiresAt.getTime() <= Date.now()) {
                    return NextResponse.json(
                        { error: 'Assinatura vencida. Gere o PIX de renovação para continuar.', code: 'SUBSCRIPTION_EXPIRED' },
                        { status: 402 }
                    );
                }
            }

            const isFreeClient = user?.allowedProfiles?.includes('gratis') && !user.allowedProfiles.includes('cliente');

            if (effectiveProfile === 'gratis' && user && isFreeClient) {
                let freeTrialExpiresAt = user.freeTrialExpiresAt ? new Date(user.freeTrialExpiresAt) : null;
                if (!freeTrialExpiresAt) {
                    const freeTrial = createExpiredFreeTrialWindow();
                    freeTrialExpiresAt = freeTrial.freeTrialExpiresAt;
                    await User.findByIdAndUpdate(user._id, { $set: freeTrial });
                }

                if (isFreeTrialExpired(freeTrialExpiresAt)) {
                    return NextResponse.json(
                        { error: 'Teste grátis expirado. Escolha um plano para continuar.', code: 'FREE_TRIAL_EXPIRED' },
                        { status: 402 }
                    );
                }
            }
        }

        // --- Restrição para Concessionárias ---
        let restrictedDealershipId: string | null = null;
        if (effectiveProfile === 'concessionaria') {
            const user = await User.findOne({ email: session.user.email });
            if (user && user.dealershipId) {
                restrictedDealershipId = user.dealershipId.toString();
            }

            if (!restrictedDealershipId) {
                return NextResponse.json({ data: [], total: 0, hasNextPage: false, page: 1, totalPages: 0 });
            }
        }

        // --- Filtros e Paginação ---
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '50');
        const skip = (page - 1) * limit;
        const search = searchParams.get('search') || '';
        let sortKey = searchParams.get('sortKey') || 'dataEntrada';
        const sortDir = searchParams.get('sortDir') === 'asc' ? 1 : -1;
        const semConcessionaria = searchParams.get('semConcessionaria') === 'true';

        // O novo sistema não tem "dataEntrada" explícita, usamos updatedAt do DealerVehiclePrice
        if (sortKey === 'dataEntrada') sortKey = 'updatedAt';
        
        // Mapeia chaves de ordenação para o campo correto no aggregation
        const sortField = sortKey === 'preco' ? 'preco' :
                         sortKey === 'updatedAt' ? 'updatedAt' :
                         sortKey === 'marca' ? 'variation.marca' :
                         sortKey === 'modelo' ? 'variation.modelo' :
                         sortKey === 'ano' ? 'variation.anoModelo' : 'updatedAt';

        // Anúncio só entra na vitrine se o modelo continua no catálogo mestre.
        // Sem isso, preços ativos presos em variação inativa ficavam visíveis
        // aqui e para o cliente, mas invisíveis na aba Preços da concessionária
        // (que filtra ativo: true) — ela não conseguia corrigir nem tirar do ar.
        const matchStage: any = { ativo: true, 'variation.ativo': true };

        // Aplica filtros exatos se existirem
        // Segmento da vitrine. carro/moto = só 0KM daquele tipo; repasse = só
        // usados; 'todos' ou ausente = 0KM + repasse na mesma lista.
        const tipo = searchParams.get('tipo') || 'todos';
        if (tipo === 'carro' || tipo === 'moto') matchStage['variation.tipoVeiculo'] = tipo;
        if (searchParams.get('status')) matchStage['statusVeiculo'] = searchParams.get('status');
        if (searchParams.get('combustivel')) matchStage['variation.combustivel'] = searchParams.get('combustivel');
        if (searchParams.get('transmissao')) matchStage['variation.transmissao'] = searchParams.get('transmissao');
        if (searchParams.get('ano')) matchStage['variation.anoModelo'] = parseInt(searchParams.get('ano')!);
        if (searchParams.get('modelo')) matchStage['variation.modelo'] = { $regex: escapeRegex(searchParams.get('modelo')!), $options: 'i' };
        if (searchParams.get('opcionais')) matchStage['variation.opcionais'] = { $regex: escapeRegex(searchParams.get('opcionais')!), $options: 'i' };
        
        if (searchParams.get('estado')) matchStage['concessionariaInfo.uf'] = { $regex: escapeRegex(searchParams.get('estado')!), $options: 'i' };
        if (searchParams.get('cidade')) matchStage['concessionariaInfo.cidade'] = { $regex: escapeRegex(searchParams.get('cidade')!), $options: 'i' };
        if (searchParams.get('concessionaria')) matchStage['concessionariaInfo.nome'] = { $regex: escapeRegex(searchParams.get('concessionaria')!), $options: 'i' };
        if (searchParams.get('operador')) matchStage['operadorInfo.displayName'] = { $regex: escapeRegex(searchParams.get('operador')!), $options: 'i' };
        
        // O novo sistema não tem nomeContato no DealerVehiclePrice, usamos observacoes ou fallback
        if (searchParams.get('cor')) {
            matchStage.$or = [
                { 'coresDisponiveis': { $regex: escapeRegex(searchParams.get('cor')!), $options: 'i' } },
                { 'variation.cor': { $regex: escapeRegex(searchParams.get('cor')!), $options: 'i' } }
            ];
        }

        // Restriction apply
        if (restrictedDealershipId) {
            // override any concessionaria text search with hard restriction
            matchStage['concessionariaId'] = new mongoose.Types.ObjectId(restrictedDealershipId);
        }

        // Global Search
        if (search) {
            const searchRegex = { $regex: search, $options: 'i' };
            const normalized = search.trim().toLowerCase();
            
            const fuelMap: Record<string, string> = {
                'flex': 'Flex', 'gasolina': 'Gasolina', 'etanol': 'Etanol', 'alcool': 'Etanol', 'álcool': 'Etanol',
                'diesel': 'Diesel', 'elétrico': 'Elétrico', 'eletrico': 'Elétrico', 'híbrido': 'Híbrido', 'hibrido': 'Híbrido'
            };
            const transMap: Record<string, string> = {
                'manual': 'Manual', 'automatico': 'Automático', 'automático': 'Automático', 'cvt': 'CVT'
            };
            
            if (fuelMap[normalized]) matchStage['variation.combustivel'] = fuelMap[normalized];
            else if (transMap[normalized]) matchStage['variation.transmissao'] = transMap[normalized];

            const orConditions: any[] = [
                { 'variation.modelo': searchRegex },
                { 'variation.marca': searchRegex },
                { 'variation.combustivel': searchRegex },
                { 'variation.transmissao': searchRegex },
                { 'variation.cor': searchRegex },
                { 'variation.opcionais': searchRegex },
                { 'concessionariaInfo.nome': searchRegex },
                { 'concessionariaInfo.uf': searchRegex },
                { 'operadorInfo.displayName': searchRegex }, // Buscamos pelo nome do operador real!
            ];

            matchStage.$or = matchStage.$or ? [...matchStage.$or, ...orConditions] : orConditions;
        }

        const pipeline: any[] = [
            // 1. Join with Variation
            {
                $lookup: {
                    from: VehicleVariation.collection.name,
                    localField: 'variationId',
                    foreignField: '_id',
                    as: 'variation'
                }
            },
            { $unwind: '$variation' },
            
            // 2. Join with Concessionaria
            {
                $lookup: {
                    from: Concessionaria.collection.name,
                    localField: 'concessionariaId',
                    foreignField: '_id',
                    as: 'concessionariaInfo'
                }
            },
            { $unwind: { path: '$concessionariaInfo', preserveNullAndEmptyArrays: true } },
            
            // 2.5. Join with User to get dynamic Operador
            {
                $lookup: {
                    from: 'users',
                    localField: 'concessionariaInfo.operadorId',
                    foreignField: '_id',
                    as: 'operadorInfo'
                }
            },
            { $unwind: { path: '$operadorInfo', preserveNullAndEmptyArrays: true } },
            { $addFields: { origem: 'novo' } },

            // 2.6. Em "Todos", os usados entram na mesma lista, já no mesmo formato.
            ...(tipo === 'todos'
                ? [{ $unionWith: { coll: RepasseVehicle.collection.name, pipeline: repasseAsVitrineStages() } }]
                : []),

            // 3. Match filters
            { $match: matchStage },
            
            // 4. Sort and Paginate (Facet for totals)
            { $sort: { [sortField]: sortDir } },
            {
                $facet: {
                    data: [ { $skip: skip }, { $limit: limit } ],
                    totalCount: [ { $count: 'count' } ],
                    totalQuantidade: [ { $group: { _id: null, total: { $sum: '$quantidade' } } } ]
                }
            }
        ];

        // Segmento Repasse: começa direto na coleção de usados. Troca os estágios
        // de junção do 0KM pelos do repasse e mantém $match/ordenação/paginação.
        const matchIndex = pipeline.findIndex(stage => '$match' in stage);
        const [aggregationResult] = tipo === 'repasse'
            ? await RepasseVehicle.aggregate([...repasseAsVitrineStages(), ...pipeline.slice(matchIndex)])
            : await DealerVehiclePrice.aggregate(pipeline);
        
        const data = aggregationResult.data || [];
        const total = aggregationResult.totalCount[0]?.count || 0;
        const totalQuantidade = aggregationResult.totalQuantidade[0]?.total || 0;

        // Serialize data para manter o MESMO FORMATO esperado pelo Frontend
        const serializedData = data.map((doc: any) => {
            const v = doc.variation;
            const c = doc.concessionariaInfo || {};
            
            const isRepasse = doc.origem === 'repasse';
            return {
                id: doc._id.toString(), // The ID of the price record becomes the main ID to interact with
                // Repasse não tem variação de catálogo: o id acima é do próprio usado.
                variationId: isRepasse ? undefined : v._id.toString(),
                origem: isRepasse ? 'repasse' : 'novo',
                km: isRepasse ? doc.km : 0,
                concessionariaId: c._id?.toString(),
                
                // Mapped from Variation
                marca: v.marca,
                modelo: v.modelo,
                tipoVeiculo: v.tipoVeiculo || 'carro',
                cilindrada: v.cilindrada,
                ano: v.ano || String(v.anoModelo),
                anoModelo: v.anoModelo,
                anoFabricacao: v.anoFabricacao,
                combustivel: v.combustivel,
                cor: v.cor,
                transmissao: v.transmissao,
                opcionais: v.opcionais,
                motor: v.motor,
                carroceria: v.carroceria,
                portas: v.portas,
                imagemUrl: v.imagemUrl,
                status: doc.statusVeiculo || v.status || 'A faturar',
                
                // Mapped from DealerVehiclePrice
                preco: doc.preco,
                frete: doc.frete || 0,
                quantidade: doc.quantidade || 0,
                prazo: doc.prazo,
                coresDisponiveis: doc.coresDisponiveis || [],
                observacoes: doc.observacoes,
                ativo: doc.ativo,
                operador: doc.operadorInfo?.displayName || '', // Usa APENAS o operador dinâmico
                dataEntrada: doc.createdAt,
                updatedAt: doc.updatedAt,
                
                // Mapped from Concessionaria
                concessionaria: c.nome || 'Concessionária não vinculada',
                cidade: c.cidade,
                estado: c.uf,
                nomeContato: c.contato || '',
                telefone: c.celular || c.telefone || '',
            };
        });

        return NextResponse.json({
            data: serializedData,
            total,
            totalQuantidade,
            hasNextPage: skip + data.length < total,
            page,
            totalPages: Math.ceil(total / limit)
        });
    } catch (error: any) {
        console.error('Erro ao buscar veículos no novo catálogo:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST desativado - a adição é feita pela API do Catálogo
export async function POST(request: Request) {
    return NextResponse.json({ error: 'Operação movida. Use a tela de Catálogo/Preços para adicionar veículos.' }, { status: 405 });
}

export async function PATCH(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();
        const body = await request.json();

        // O 'update_date' é usado para dar um 'bump' no veículo na lista.
        // Agora atualizamos a data no DealerVehiclePrice.
        if (body.action === 'update_date') {
            const { ids } = body;
            if (!ids || !Array.isArray(ids) || ids.length === 0) {
                return NextResponse.json({ error: 'IDs são obrigatórios' }, { status: 400 });
            }
            const now = new Date();
            const result = await DealerVehiclePrice.updateMany(
                { _id: { $in: ids } },
                { $set: { updatedAt: now } }
            );
            return NextResponse.json({
                message: `Data de atualização atualizada para ${result.modifiedCount} veículos`,
                modifiedCount: result.modifiedCount
            });
        }

        return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
    } catch (error: any) {
        console.error('Erro na atualização em massa:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
