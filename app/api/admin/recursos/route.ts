import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import Concessionaria from '@/models/Concessionaria';
import User from '@/models/User';
import { WaStore } from '@wa/models/store';
import { storeAccess } from '@wa/lib/store';
import { TODOS_OS_RECURSOS, diferencaDoPadrao, lerRecursos, recursoAplica, type Recursos, type TipoConta } from '@/lib/recursos';

export const dynamic = 'force-dynamic';

// Mesma regra das outras liberações manuais (plano de repasse, vitrine).
const PODE_LIBERAR = new Set(['administrador', 'admin']);
const POR_PAGINA = 50;

const escapeRegex = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function autorizado() {
    const session = await getServerSession(authOptions);
    return session && PODE_LIBERAR.has(session.user?.profile as string) ? session : null;
}

/** Situação do atendimento da conta, para a lista mostrar quem já começou. */
function situacaoAtendimento(store: any | undefined) {
    if (!store) return { status: 'nao_iniciado' as const, ate: null };
    const a = storeAccess(store);
    if (!a.active) return { status: 'vencido' as const, ate: a.trial ? a.trialEndsAt : a.expiresAt };
    return a.trial ? { status: 'teste' as const, ate: a.trialEndsAt } : { status: 'assinante' as const, ate: a.expiresAt };
}

function linha(tipo: TipoConta, doc: any, store: any | undefined) {
    const recursos = lerRecursos(doc.recursos, tipo);
    const aplicaveis = TODOS_OS_RECURSOS.filter(k => recursoAplica(k, tipo));
    return {
        tipo,
        id: String(doc._id),
        nome: tipo === 'concessionaria' ? (doc.nome || doc.razaoSocial || 'Concessionária') : (doc.displayName || doc.email),
        detalhe: tipo === 'concessionaria' ? [doc.cidade, doc.uf].filter(Boolean).join(' - ') : doc.email,
        recursos,
        liberados: aplicaveis.filter(k => recursos[k]).length,
        total: aplicaveis.length,
        atendimento: situacaoAtendimento(store),
    };
}

/**
 * GET /api/admin/recursos?tipo=concessionaria|lojista&q=&page=
 * Contas de cliente com as funcionalidades liberadas (lib/recursos.ts).
 * Lojista = o titular; os sub-usuários dele seguem o que vale para ele.
 */
export async function GET(request: Request) {
    try {
        if (!(await autorizado())) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
        await connectDB();

        const { searchParams } = new URL(request.url);
        const tipo: TipoConta = searchParams.get('tipo') === 'lojista' ? 'lojista' : 'concessionaria';
        const q = (searchParams.get('q') || '').trim();
        const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
        const busca = q ? { $regex: escapeRegex(q), $options: 'i' } : null;

        let docs: any[];
        let total: number;
        if (tipo === 'concessionaria') {
            const filtro = busca ? { $or: [{ nome: busca }, { razaoSocial: busca }, { cnpj: busca }, { cidade: busca }] } : {};
            [docs, total] = await Promise.all([
                Concessionaria.find(filtro).select('nome razaoSocial cidade uf recursos').sort({ nome: 1 })
                    .skip((page - 1) * POR_PAGINA).limit(POR_PAGINA).lean(),
                Concessionaria.countDocuments(filtro),
            ]);
        } else {
            const filtro: any = { allowedProfiles: { $in: ['cliente', 'gratis'] }, isInvitee: { $ne: true } };
            if (busca) filtro.$or = [{ displayName: busca }, { email: busca }];
            [docs, total] = await Promise.all([
                User.find(filtro).select('displayName email recursos').sort({ displayName: 1, email: 1 })
                    .skip((page - 1) * POR_PAGINA).limit(POR_PAGINA).lean(),
                User.countDocuments(filtro),
            ]);
        }

        const ids = docs.map(d => d._id);
        const lojas = await WaStore.find(tipo === 'concessionaria' ? { concessionariaId: { $in: ids } } : { ownerUserId: { $in: ids } })
            .select('concessionariaId ownerUserId subscription trialEndsAt').lean();
        const lojaDe = new Map(lojas.map((s: any) => [String(tipo === 'concessionaria' ? s.concessionariaId : s.ownerUserId), s]));

        return NextResponse.json({
            data: docs.map(d => linha(tipo, d, lojaDe.get(String(d._id)))),
            total,
            page,
            totalPages: Math.max(1, Math.ceil(total / POR_PAGINA)),
        });
    } catch (error: any) {
        console.error('[admin recursos] GET', error);
        return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
    }
}

/**
 * PATCH /api/admin/recursos { tipo, id, recursos: { chave: boolean } }
 * Grava só o que difere do padrão; o que não veio no corpo volta ao padrão.
 */
export async function PATCH(request: Request) {
    try {
        const session = await autorizado();
        if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });

        const body = await request.json().catch(() => ({}));
        const tipo: TipoConta | null = body?.tipo === 'concessionaria' || body?.tipo === 'lojista' ? body.tipo : null;
        if (!tipo || !mongoose.isValidObjectId(body?.id)) return NextResponse.json({ error: 'Conta inválida' }, { status: 400 });
        if (!body.recursos || typeof body.recursos !== 'object') return NextResponse.json({ error: 'Informe as funcionalidades' }, { status: 400 });

        const recursos = diferencaDoPadrao(body.recursos as Partial<Recursos>, tipo);
        await connectDB();
        const Modelo: any = tipo === 'concessionaria' ? Concessionaria : User;
        const filtro = tipo === 'concessionaria' ? { _id: body.id } : { _id: body.id, allowedProfiles: { $in: ['cliente', 'gratis'] } };
        const doc = await Modelo.findOneAndUpdate(
            filtro,
            Object.keys(recursos).length ? { $set: { recursos } } : { $unset: { recursos: 1 } },
            { returnDocument: 'after' },
        ).select(tipo === 'concessionaria' ? 'nome razaoSocial cidade uf recursos' : 'displayName email recursos').lean();
        if (!doc) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 });

        const store = await WaStore.findOne(tipo === 'concessionaria' ? { concessionariaId: doc._id } : { ownerUserId: doc._id })
            .select('subscription trialEndsAt').lean();
        return NextResponse.json(linha(tipo, doc, store ?? undefined));
    } catch (error: any) {
        console.error('[admin recursos] PATCH', error);
        return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
    }
}
