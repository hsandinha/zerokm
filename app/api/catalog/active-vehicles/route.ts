import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import mongoose from 'mongoose';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import Concessionaria from '@/models/Concessionaria';
import DealerVehiclePrice from '@/models/DealerVehiclePrice';
import User from '@/models/User';
import VehicleVariation from '@/models/VehicleVariation';
import { createExpiredFreeTrialWindow, isFreeTrialExpired } from '@/lib/utils/freeTrial';

const CATALOG_VIEW_PROFILES = new Set([
    'admin',
    'administrador',
    'gerente',
    'marketing',
    'operador',
    'operator',
    'vendedor',
    'cliente',
    'gratis',
]);

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function normalizeText(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        const profile = session?.user?.profile;
        if (!session || !profile || !CATALOG_VIEW_PROFILES.has(profile)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();

        if ((profile === 'gratis' || profile === 'cliente') && session.user?.email) {
            const user = await User.findOne({ email: session.user.email }).select('allowedProfiles freeTrialExpiresAt subscription');

            if (profile === 'cliente' && user?.allowedProfiles?.includes('cliente') && user.subscription?.expiresAt) {
                const expiresAt = new Date(user.subscription.expiresAt);
                if (expiresAt.getTime() <= Date.now()) {
                    return NextResponse.json(
                        { error: 'Assinatura vencida. Gere o PIX de renovação para continuar.', code: 'SUBSCRIPTION_EXPIRED' },
                        { status: 402 }
                    );
                }
            }

            const isFreeClient = user?.allowedProfiles?.includes('gratis') && !user.allowedProfiles.includes('cliente');
            if (profile === 'gratis' && user && isFreeClient) {
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

        const { searchParams } = new URL(request.url);
        const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
        const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
        const skip = (page - 1) * limit;
        const search = normalizeText(searchParams.get('search'));
        const marca = normalizeText(searchParams.get('marca'));
        const modelo = normalizeText(searchParams.get('modelo'));
        const combustivel = normalizeText(searchParams.get('combustivel'));
        const transmissao = normalizeText(searchParams.get('transmissao'));
        const anoModelo = normalizeText(searchParams.get('anoModelo') || searchParams.get('ano'));
        const estado = normalizeText(searchParams.get('estado'));
        const cidade = normalizeText(searchParams.get('cidade'));
        const concessionariaId = normalizeText(searchParams.get('concessionariaId'));

        const pipeline: any[] = [
            { $match: { ativo: true, preco: { $gt: 0 } } },
            {
                $lookup: {
                    from: VehicleVariation.collection.name,
                    localField: 'variationId',
                    foreignField: '_id',
                    as: 'variation',
                },
            },
            { $unwind: '$variation' },
            { $match: { 'variation.ativo': true } },
            {
                $lookup: {
                    from: Concessionaria.collection.name,
                    localField: 'concessionariaId',
                    foreignField: '_id',
                    as: 'concessionaria',
                },
            },
            { $unwind: '$concessionaria' },
            { $match: { 'concessionaria.ativo': { $ne: false } } },
        ];

        const filters: any[] = [];
        if (marca) filters.push({ 'variation.marca': { $regex: `^${escapeRegex(marca)}$`, $options: 'i' } });
        if (modelo) filters.push({ 'variation.modelo': { $regex: escapeRegex(modelo), $options: 'i' } });
        if (combustivel) filters.push({ 'variation.combustivel': { $regex: `^${escapeRegex(combustivel)}$`, $options: 'i' } });
        if (transmissao) filters.push({ 'variation.transmissao': { $regex: `^${escapeRegex(transmissao)}$`, $options: 'i' } });
        if (anoModelo && Number.isFinite(Number(anoModelo))) filters.push({ 'variation.anoModelo': Number(anoModelo) });
        if (estado) filters.push({ 'concessionaria.uf': { $regex: `^${escapeRegex(estado)}$`, $options: 'i' } });
        if (cidade) filters.push({ 'concessionaria.cidade': { $regex: escapeRegex(cidade), $options: 'i' } });
        if (concessionariaId && mongoose.Types.ObjectId.isValid(concessionariaId)) {
            filters.push({ concessionariaId: new mongoose.Types.ObjectId(concessionariaId) });
        }
        if (search) {
            const regex = { $regex: escapeRegex(search), $options: 'i' };
            filters.push({
                $or: [
                    { 'variation.marca': regex },
                    { 'variation.modelo': regex },
                    { 'variation.versao': regex },
                    { 'variation.codigoFipe': regex },
                    { 'concessionaria.nome': regex },
                ],
            });
        }

        if (filters.length > 0) pipeline.push({ $match: { $and: filters } });

        pipeline.push(
            { $sort: { updatedAt: -1 } },
            {
                $facet: {
                    metadata: [{ $count: 'total' }],
                    data: [
                        { $skip: skip },
                        { $limit: limit },
                        {
                            $project: {
                                _id: 0,
                                id: { $toString: '$_id' },
                                variationId: { $toString: '$variation._id' },
                                concessionariaId: { $toString: '$concessionaria._id' },
                                marca: '$variation.marca',
                                modelo: '$variation.modelo',
                                versao: '$variation.versao',
                                codigoFipe: '$variation.codigoFipe',
                                anoModelo: '$variation.anoModelo',
                                combustivel: '$variation.combustivel',
                                transmissao: '$variation.transmissao',
                                motor: '$variation.motor',
                                carroceria: '$variation.carroceria',
                                portas: '$variation.portas',
                                opcionaisPadrao: '$variation.opcionaisPadrao',
                                imagemUrl: '$variation.imagemUrl',
                                preco: '$preco',
                                frete: '$frete',
                                coresDisponiveis: '$coresDisponiveis',
                                observacoes: '$observacoes',
                                concessionaria: '$concessionaria.nome',
                                cidade: '$concessionaria.cidade',
                                estado: '$concessionaria.uf',
                                telefone: '$concessionaria.telefone',
                                nomeContato: '$concessionaria.nomeResponsavel',
                                updatedAt: '$updatedAt',
                            },
                        },
                    ],
                },
            }
        );

        const [result] = await DealerVehiclePrice.aggregate(pipeline);
        const data = result?.data || [];
        const total = result?.metadata?.[0]?.total || 0;

        return NextResponse.json({
            data,
            total,
            page,
            totalPages: Math.ceil(total / limit),
            hasNextPage: skip + data.length < total,
        });
    } catch (error: any) {
        console.error('Erro ao buscar veículos ativos do catálogo relacional:', error);
        return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
    }
}
