import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Concessionaria from '@/models/Concessionaria';
import DealerVehiclePrice from '@/models/DealerVehiclePrice';
import VehicleVariation from '@/models/VehicleVariation';
import User from '@/models/User';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';

const formatErrorMessage = (error: unknown) => {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    try {
        return JSON.stringify(error);
    } catch (jsonError) {
        return 'Erro desconhecido';
    }
};

type ConcessionariaPayload = {
    nome?: string;
    razaoSocial?: string;
    telefone?: string;
    celular?: string;
    contato?: string;
    email?: string;
    endereco?: string;
    numero?: string;
    complemento?: string;
    inscricaoEstadual?: string;
    bairro?: string;
    cidade?: string;
    cnpj?: string;
    uf?: string;
    cep?: string;
    nomeResponsavel?: string;
    telefoneResponsavel?: string;
    emailResponsavel?: string;
    observacoes?: string;
    ativo: boolean;
    dataCadastro?: string;
    operadorId?: string;
};

const sanitizeString = (value: unknown): string => {
    if (typeof value !== 'string') {
        return '';
    }
    return value.trim();
};

const sanitizeOptionalString = (value: unknown): string | undefined => {
    if (typeof value !== 'string') {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
};

const sanitizeBoolean = (value: unknown, defaultValue = true): boolean => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') {
        if (value === 1) return true;
        if (value === 0) return false;
    }
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'ativo', 'yes', 'sim'].includes(normalized)) return true;
        if (['false', '0', 'inativo', 'no', 'nao', 'não'].includes(normalized)) return false;
    }
    return defaultValue;
};

const serializeConcessionaria = (doc: any) => {
    return {
        id: doc._id.toString(),
        nome: doc.nome,
        razaoSocial: doc.razaoSocial,
        marcaId: doc.marcaId?.toString(),
        marca: doc.marca,
        marcaIds: Array.isArray(doc.marcaIds) ? doc.marcaIds.map((m: any) => m.toString()) : [],
        marcas: Array.isArray(doc.marcas) ? doc.marcas : [],
        operadorId: doc.operadorId?.toString(),
        telefone: doc.telefone,
        celular: doc.celular,
        contato: doc.contato,
        email: doc.email,
        endereco: doc.endereco,
        numero: doc.numero,
        complemento: doc.complemento,
        inscricaoEstadual: doc.inscricaoEstadual,
        bairro: doc.bairro,
        cidade: doc.cidade,
        cnpj: doc.cnpj,
        uf: doc.uf,
        cep: doc.cep,
        nomeResponsavel: doc.nomeResponsavel,
        telefoneResponsavel: doc.telefoneResponsavel,
        emailResponsavel: doc.emailResponsavel,
        observacoes: doc.observacoes,
        ativo: doc.ativo,
        dataCadastro: doc.dataCadastro ? new Date(doc.dataCadastro).toISOString() : null,
        criadoEm: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
        atualizadoEm: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null
    };
};

const buildPayload = (data: Partial<ConcessionariaPayload>): ConcessionariaPayload => {
    const optionalCelular = sanitizeOptionalString(data.celular);
    const optionalComplemento = sanitizeOptionalString(data.complemento);
    const optionalInscricao = sanitizeOptionalString(data.inscricaoEstadual);
    const optionalEmailResp = sanitizeOptionalString(data.emailResponsavel);
    const optionalObservacoes = sanitizeOptionalString(data.observacoes);

    const nome = sanitizeOptionalString(data.nome);
    const razaoSocial = sanitizeOptionalString(data.razaoSocial);
    const telefone = sanitizeOptionalString(data.telefone);
    const contato = sanitizeOptionalString(data.contato);
    const email = sanitizeOptionalString(data.email);
    const endereco = sanitizeOptionalString(data.endereco);
    const numero = sanitizeOptionalString(data.numero);
    const bairro = sanitizeOptionalString(data.bairro);
    const cidade = sanitizeOptionalString(data.cidade);
    const cnpj = sanitizeOptionalString(data.cnpj);
    const uf = sanitizeOptionalString(data.uf)?.toUpperCase();
    const cep = sanitizeOptionalString(data.cep);
    const nomeResponsavel = sanitizeOptionalString(data.nomeResponsavel);
    const telefoneResponsavel = sanitizeOptionalString(data.telefoneResponsavel);

    return {
        ...(nome ? { nome } : {}),
        ...(razaoSocial ? { razaoSocial } : {}),
        ...(telefone ? { telefone } : {}),
        ...(contato ? { contato } : {}),
        ...(email ? { email } : {}),
        ...(endereco ? { endereco } : {}),
        ...(numero ? { numero } : {}),
        ...(bairro ? { bairro } : {}),
        ...(cidade ? { cidade } : {}),
        ...(cnpj ? { cnpj } : {}),
        ...(uf ? { uf } : {}),
        ...(cep ? { cep } : {}),
        ...(nomeResponsavel ? { nomeResponsavel } : {}),
        ...(telefoneResponsavel ? { telefoneResponsavel } : {}),
        ativo: sanitizeBoolean(data.ativo, true),
        dataCadastro: data.dataCadastro ?? new Date().toISOString(),
        ...(optionalCelular ? { celular: optionalCelular } : {}),
        ...(optionalComplemento ? { complemento: optionalComplemento } : {}),
        ...(optionalInscricao ? { inscricaoEstadual: optionalInscricao } : {}),
        ...(optionalEmailResp ? { emailResponsavel: optionalEmailResp } : {}),
        ...(optionalObservacoes ? { observacoes: optionalObservacoes } : {}),
        ...(data.operadorId ? { operadorId: data.operadorId } : {})
    };
};

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();

        // Define constraints based on profile
        const query: any = {};
        if (['operador'].includes(session.user?.profile as string)) {
            const uid = (session.user as any)?.uid;
            if (!uid) {
                return NextResponse.json({ error: 'Sessão inválida para acesso' }, { status: 403 });
            }
            const dbUser = await User.findOne({ firebaseUid: uid }).select('_id').lean() as any;
            if (!dbUser) {
                return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 403 });
            }
            query.operadorId = dbUser._id;
        }

        // Estoque e atividade saem de DealerVehiclePrice, ligado por
        // concessionariaId. A fonte anterior era a coleção legada Vehicle,
        // casada pelo NOME da concessionária — o que errava sempre que o nome
        // cadastrado divergia do digitado no veículo, e ficou congelada quando
        // a coleção parou de receber dados.
        const [concessionarias, priceStats] = await Promise.all([
            Concessionaria.find(query).sort({ nome: 1 }),
            DealerVehiclePrice.aggregate([
                {
                    $lookup: {
                        from: VehicleVariation.collection.name,
                        localField: 'variationId',
                        foreignField: '_id',
                        as: 'variation',
                    }
                },
                { $unwind: { path: '$variation', preserveNullAndEmptyArrays: true } },
                {
                    $group: {
                        _id: "$concessionariaId",
                        // Estoque: só preço ativo cujo modelo continua no catálogo mestre.
                        unidades: {
                            $sum: {
                                $cond: [
                                    { $and: ['$ativo', { $eq: ['$variation.ativo', true] }] },
                                    { $ifNull: ["$quantidade", 0] },
                                    0,
                                ]
                            }
                        },
                        // Atividade: qualquer mexida conta, inclusive zerar estoque.
                        ultimaAtualizacao: { $max: "$updatedAt" },
                    }
                }
            ])
        ]);

        const statsMap = new Map(
            priceStats.map(stat => [
                stat._id?.toString(),
                { unidades: stat.unidades ?? 0, ultimaAtualizacao: stat.ultimaAtualizacao ?? null },
            ])
        );

        const serialized = concessionarias.map(c => {
            const base = serializeConcessionaria(c);
            const stats = statsMap.get(base.id) || { unidades: 0, ultimaAtualizacao: null };

            return {
                ...base,
                totalVeiculos: stats.unidades,
                ultimaAtualizacao: stats.ultimaAtualizacao,
                totalAtivos: stats.unidades
            };
        });

        return NextResponse.json(serialized);
    } catch (error) {
        console.error('Erro ao listar concessionárias:', error);
        return NextResponse.json({
            error: 'Erro ao listar concessionárias',
            details: formatErrorMessage(error)
        }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();
        const body = await request.json();
        const payload = buildPayload(body);

        if (['operador', 'operator', 'vendedor'].includes(session.user.profile as string)) {
            const uid = (session.user as any).uid;
            const dbUser = await User.findOne({ firebaseUid: uid }).select('_id').lean() as any;
            if (dbUser) {
                payload.operadorId = dbUser._id;
            }
        }

        const newConcessionaria = await Concessionaria.create(payload);
        const serialized = serializeConcessionaria(newConcessionaria);

        return NextResponse.json(serialized, { status: 201 });
    } catch (error) {
        console.error('Erro ao criar concessionária:', error);
        // @ts-ignore
        if (error.name === 'ValidationError') {
            // @ts-ignore
            const messages = Object.values(error.errors).map((val: any) => val.message);
            return NextResponse.json({ error: `Erro de validação: ${messages.join(', ')}` }, { status: 400 });
        }
        // @ts-ignore
        if (error.code === 11000) {
            return NextResponse.json({ error: 'Já existe uma concessionária com este CNPJ.' }, { status: 400 });
        }
        return NextResponse.json({
            error: 'Erro ao criar concessionária',
            details: formatErrorMessage(error)
        }, { status: 500 });
    }
}
