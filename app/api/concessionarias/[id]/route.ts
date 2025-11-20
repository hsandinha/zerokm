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
    } catch {
        return 'Erro desconhecido';
    }
};

const sanitizeString = (value: unknown): string | undefined => {
    if (typeof value !== 'string') {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
};

const sanitizeBoolean = (value: unknown): boolean | undefined => {
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
    return undefined;
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

const buildUpdatePayload = (body: Record<string, unknown>) => {
    const stringFields = [
        'nome',
        'razaoSocial',
        'telefone',
        'celular',
        'contato',
        'email',
        'endereco',
        'numero',
        'complemento',
        'inscricaoEstadual',
        'bairro',
        'cidade',
        'cnpj',
        'uf',
        'cep',
        'dataCadastro',
        'nomeResponsavel',
        'telefoneResponsavel',
        'emailResponsavel',
        'observacoes'
    ] as const;

    const updates: Record<string, string | boolean> = {};

    stringFields.forEach((field) => {
        const value = sanitizeString(body[field]);
        if (value) {
            updates[field] = field === 'uf' ? value.toUpperCase() : value;
        }
    });

    if ('ativo' in body) {
        const boolValue = sanitizeBoolean(body.ativo);
        if (typeof boolValue === 'boolean') {
            updates.ativo = boolValue;
        }
    }

    return updates;
};

export async function PUT(request: Request, { params }: { params: { id: string } }) {
    const { id } = params;

    if (!id) {
        return NextResponse.json({ error: 'ID da concessionária não informado' }, { status: 400 });
    }

    try {
        const body = await request.json();
        const updates = buildUpdatePayload(body);

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: 'Nenhum campo válido para atualizar' }, { status: 400 });
        }

        const docRef = collectionRef.doc(id);
        const docSnapshot = await docRef.get();

        if (!docSnapshot.exists) {
            return NextResponse.json({ error: 'Concessionária não encontrada' }, { status: 404 });
        }

        await docRef.update({
            ...updates,
            atualizadoEm: Timestamp.now()
        });

        const updatedDoc = await docRef.get();
        const serialized = serializeConcessionaria(updatedDoc);

        if (!serialized) {
            return NextResponse.json({ error: 'Erro ao ler a concessionária atualizada' }, { status: 500 });
        }

        return NextResponse.json(serialized);
    } catch (error) {
        console.error(`Erro ao atualizar concessionária ${id}:`, error);
        return NextResponse.json({
            error: 'Erro ao atualizar concessionária',
            details: formatErrorMessage(error)
        }, { status: 500 });
    }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
    const { id } = params;

    if (!id) {
        return NextResponse.json({ error: 'ID da concessionária não informado' }, { status: 400 });
    }

    try {
        const docRef = collectionRef.doc(id);
        const docSnapshot = await docRef.get();

        if (!docSnapshot.exists) {
            return NextResponse.json({ error: 'Concessionária não encontrada' }, { status: 404 });
        }

        await docRef.delete();
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error(`Erro ao excluir concessionária ${id}:`, error);
        return NextResponse.json({
            error: 'Erro ao excluir concessionária',
            details: formatErrorMessage(error)
        }, { status: 500 });
    }
}
