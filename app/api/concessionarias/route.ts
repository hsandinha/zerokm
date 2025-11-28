import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Concessionaria from '@/models/Concessionaria';
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
    nome: string;
    razaoSocial: string;
    telefone: string;
    celular?: string;
    contato: string;
    email: string;
    endereco: string;
    numero: string;
    complemento?: string;
    inscricaoEstadual?: string;
    bairro: string;
    cidade: string;
    cnpj: string;
    uf: string;
    cep: string;
    nomeResponsavel: string;
    telefoneResponsavel: string;
    emailResponsavel?: string;
    observacoes?: string;
    ativo: boolean;
    dataCadastro?: string;
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

    return {
        nome: sanitizeString(data.nome),
        razaoSocial: sanitizeString(data.razaoSocial),
        telefone: sanitizeString(data.telefone),
        contato: sanitizeString(data.contato),
        email: sanitizeString(data.email),
        endereco: sanitizeString(data.endereco),
        numero: sanitizeString(data.numero),
        bairro: sanitizeString(data.bairro),
        cidade: sanitizeString(data.cidade),
        cnpj: sanitizeString(data.cnpj),
        uf: sanitizeString(data.uf).toUpperCase(),
        cep: sanitizeString(data.cep),
        nomeResponsavel: sanitizeString(data.nomeResponsavel),
        telefoneResponsavel: sanitizeString(data.telefoneResponsavel),
        ativo: sanitizeBoolean(data.ativo, true),
        dataCadastro: data.dataCadastro ?? new Date().toISOString(),
        ...(optionalCelular ? { celular: optionalCelular } : {}),
        ...(optionalComplemento ? { complemento: optionalComplemento } : {}),
        ...(optionalInscricao ? { inscricaoEstadual: optionalInscricao } : {}),
        ...(optionalEmailResp ? { emailResponsavel: optionalEmailResp } : {}),
        ...(optionalObservacoes ? { observacoes: optionalObservacoes } : {})
    };
};

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();
        const concessionarias = await Concessionaria.find().sort({ nome: 1 });
        const serialized = concessionarias.map(serializeConcessionaria);
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
        const requiredFields: Array<keyof ConcessionariaPayload> = [
            'nome',
            'razaoSocial',
            'cnpj',
            'telefone',
            'contato',
            'email',
            'nomeResponsavel',
            'telefoneResponsavel',
            'endereco',
            'numero',
            'bairro',
            'cidade',
            'uf',
            'cep'
        ];
        const missing = requiredFields.filter((field) => !payload[field]);

        if (missing.length > 0) {
            return NextResponse.json({ error: `Campos obrigatórios faltando: ${missing.join(', ')}` }, { status: 400 });
        }

        const newConcessionaria = await Concessionaria.create(payload);
        const serialized = serializeConcessionaria(newConcessionaria);

        return NextResponse.json(serialized, { status: 201 });
    } catch (error) {
        console.error('Erro ao criar concessionária:', error);
        return NextResponse.json({
            error: 'Erro ao criar concessionária',
            details: formatErrorMessage(error)
        }, { status: 500 });
    }
}
