import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Concessionaria from '@/models/Concessionaria';
import User from '@/models/User';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { acessoDaLoja } from '@/lib/services/acessoLoja';
import { ehPerfilDaLoja, podeNaLoja, MSG_SO_TITULAR } from '@/lib/utils/atendentesLoja';

/** Lojista não mexe em concessionária; quem é da loja só altera a própria, e só o titular. */
const PERFIS_DE_LOJISTA = ['cliente', 'gratis'];

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
        marcaId: doc.marcaId?.toString(),
        marca: doc.marca,
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
        ocultarVitrine: Boolean(doc.ocultarVitrine),
        vitrineOcultaEm: doc.vitrineOcultaEm ? new Date(doc.vitrineOcultaEm).toISOString() : null,
        vitrineOcultaPor: doc.vitrineOcultaPor || null,
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
        'observacoes',
        'operadorId'
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

        const perfil = (session.user as any)?.profile as string | undefined;
        if (!perfil || PERFIS_DE_LOJISTA.includes(perfil)) {
            return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
        }
        if (ehPerfilDaLoja(perfil)) {
            const acesso = await acessoDaLoja(session);
            if (!acesso || acesso.concessionariaId !== id) {
                return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
            }
            if (!podeNaLoja(acesso.papel, 'dados-cadastrais')) {
                return NextResponse.json({ error: MSG_SO_TITULAR }, { status: 403 });
            }
        }

        const body = await request.json();
        const updates = buildUpdatePayload(body);

        // O operador responsável é assunto da equipe: a loja não troca o próprio operador,
        // e "Sem operador" (campo vazio) limpa o vínculo em vez de ser ignorado.
        const daLoja = ehPerfilDaLoja(perfil);
        // Operador só mexe nas lojas da própria carteira.
        if (perfil === 'operador' || perfil === 'operator') {
            const uid = (session.user as any)?.uid;
            const eu = uid ? await User.findOne({ firebaseUid: uid }).select('_id').lean() as any : null;
            const dona = eu ? await Concessionaria.exists({ _id: id, operadorId: eu._id }) : null;
            if (!dona) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
        }
        // Trocar o operador responsável é de quem coordena a equipe.
        const podeTrocarOperador = ['admin', 'administrador', 'gerente', 'administrativo'].includes(perfil);
        if (!podeTrocarOperador) delete updates.operadorId;
        if (typeof updates.operadorId === 'string' && !mongoose.isValidObjectId(updates.operadorId)) {
            return NextResponse.json({ error: 'Operador inválido' }, { status: 400 });
        }
        const limparOperador = !daLoja && podeTrocarOperador && 'operadorId' in body && !sanitizeString(body.operadorId);

        if (Object.keys(updates).length === 0 && !limparOperador) {
            return NextResponse.json({ error: 'Nenhum campo válido para atualizar' }, { status: 400 });
        }

        const updatedConcessionaria = await Concessionaria.findByIdAndUpdate(
            id,
            {
                ...(Object.keys(updates).length ? { $set: updates } : {}),
                ...(limparOperador ? { $unset: { operadorId: 1 } } : {}),
            },
            { returnDocument: 'after' }
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

        // Excluir concessionária é da equipe do CNV, nunca da loja nem do lojista.
        const perfil = (session.user as any)?.profile as string | undefined;
        if (!perfil || ehPerfilDaLoja(perfil) || PERFIS_DE_LOJISTA.includes(perfil)) {
            return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
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
