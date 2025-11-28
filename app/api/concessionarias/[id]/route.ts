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

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    if (!id) {
        return NextResponse.json({ error: 'ID da concessionária não informado' }, { status: 400 });
    }

    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();
        const body = await request.json();
        const updates = buildUpdatePayload(body);

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: 'Nenhum campo válido para atualizar' }, { status: 400 });
        }

        const updatedConcessionaria = await Concessionaria.findByIdAndUpdate(
            id,
            { $set: updates },
            { new: true }
        );

        if (!updatedConcessionaria) {
            return NextResponse.json({ error: 'Concessionária não encontrada' }, { status: 404 });
        }

        const serialized = serializeConcessionaria(updatedConcessionaria);

        return NextResponse.json(serialized);
    } catch (error) {
        console.error(`Erro ao atualizar concessionária ${id}:`, error);
        return NextResponse.json({
            error: 'Erro ao atualizar concessionária',
            details: formatErrorMessage(error)
        }, { status: 500 });
    }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    if (!id) {
        return NextResponse.json({ error: 'ID da concessionária não informado' }, { status: 400 });
    }

    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();
        const deletedConcessionaria = await Concessionaria.findByIdAndDelete(id);

        if (!deletedConcessionaria) {
            return NextResponse.json({ error: 'Concessionária não encontrada' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error(`Erro ao excluir concessionária ${id}:`, error);
        return NextResponse.json({
            error: 'Erro ao excluir concessionária',
            details: formatErrorMessage(error)
        }, { status: 500 });
    }
}
