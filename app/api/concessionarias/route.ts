import { NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import type { DocumentData, DocumentSnapshot } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';

const collectionRef = adminDb.collection('concessionarias');

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

const serializeConcessionaria = (
    doc: DocumentSnapshot<DocumentData>
) => {
    const data = doc.data();
    if (!data) {
        return null;
    }
    const createdAt = data.criadoEm instanceof Timestamp
        ? data.criadoEm.toDate()
        : (typeof data.criadoEm?.toDate === 'function' ? data.criadoEm.toDate() : undefined);
    const updatedAt = data.atualizadoEm instanceof Timestamp
        ? data.atualizadoEm.toDate()
        : (typeof data.atualizadoEm?.toDate === 'function' ? data.atualizadoEm.toDate() : undefined);

    return {
        id: doc.id,
        nome: data.nome ?? '',
        razaoSocial: data.razaoSocial ?? '',
        telefone: data.telefone ?? '',
        celular: data.celular ?? '',
        contato: data.contato ?? '',
        email: data.email ?? '',
        endereco: data.endereco ?? '',
        numero: data.numero ?? '',
        complemento: data.complemento ?? '',
        inscricaoEstadual: data.inscricaoEstadual ?? '',
        bairro: data.bairro ?? '',
        cidade: data.cidade ?? '',
        cnpj: data.cnpj ?? '',
        uf: data.uf ?? '',
        cep: data.cep ?? '',
        nomeResponsavel: data.nomeResponsavel ?? '',
        telefoneResponsavel: data.telefoneResponsavel ?? '',
        emailResponsavel: data.emailResponsavel ?? '',
        observacoes: data.observacoes ?? '',
        ativo: typeof data.ativo === 'boolean' ? data.ativo : true,
        dataCadastro: data.dataCadastro ?? (createdAt ? createdAt.toISOString() : null),
        criadoEm: createdAt ? createdAt.toISOString() : null,
        atualizadoEm: updatedAt ? updatedAt.toISOString() : null
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
        const snapshot = await collectionRef.orderBy('nome').get();
        const concessionarias = snapshot.docs
            .map(serializeConcessionaria)
            .filter((item): item is NonNullable<typeof item> => Boolean(item));
        return NextResponse.json(concessionarias);
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

        const timestamp = Timestamp.now();
        const docRef = await collectionRef.add({
            ...payload,
            criadoEm: timestamp,
            atualizadoEm: timestamp
        });

        const createdDoc = await docRef.get();
        const serialized = serializeConcessionaria(createdDoc);

        if (!serialized) {
            return NextResponse.json({ error: 'Erro ao ler a concessionária criada' }, { status: 500 });
        }

        return NextResponse.json(serialized, { status: 201 });
    } catch (error) {
        console.error('Erro ao criar concessionária:', error);
        return NextResponse.json({
            error: 'Erro ao criar concessionária',
            details: formatErrorMessage(error)
        }, { status: 500 });
    }
}
