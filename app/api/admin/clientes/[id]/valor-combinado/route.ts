import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { gravarValorCombinado, PERFIS_VALOR_COMBINADO, resumoValorCombinado } from '@/lib/services/valorCombinadoService';
import { normalizeBillingType } from '@/lib/services/mercadoPagoSubscriptionService';
import { LIMITE_VALOR_COMBINADO, lerValorEmReais } from '@/lib/utils/valorCombinado';

export const dynamic = 'force-dynamic';

async function acesso(params: Promise<{ id: string }>) {
    const session = await getServerSession(authOptions);
    if (!session?.user || !PERFIS_VALOR_COMBINADO.has(session.user.profile as string)) {
        return { erro: NextResponse.json({ error: 'Seu perfil não pode alterar o valor do cliente.' }, { status: 403 }) };
    }
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return { erro: NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 }) };
    await connectDB();
    return { session, id };
}

/** Valor que o cliente paga hoje: tabela ou combinado, com as telas extras. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const a = await acesso(params);
    if (a.erro) return a.erro;
    const resumo = await resumoValorCombinado(a.id);
    if (!resumo) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
    return NextResponse.json(resumo);
}

/** Combina um valor para o plano atual do cliente. Body: { valor, observacao }. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const a = await acesso(params);
    if (a.erro) return a.erro;
    const body = await request.json().catch(() => ({}));
    const valor = lerValorEmReais(body?.valor);
    if (valor === null || valor <= 0) return NextResponse.json({ error: 'Informe um valor maior que zero.' }, { status: 400 });
    if (valor > LIMITE_VALOR_COMBINADO) return NextResponse.json({ error: 'Valor alto demais. Confira o número.' }, { status: 400 });

    const user = await User.findById(a.id).select('subscription').lean() as any;
    if (!user?.subscription?.planId) return NextResponse.json({ error: 'O cliente não tem plano. Ative um plano antes de combinar o valor.' }, { status: 400 });

    try {
        const { assinaturaCartao } = await gravarValorCombinado({
            userId: a.id,
            planId: String(user.subscription.planId),
            periodicidade: normalizeBillingType(user.subscription.billingType),
            valor,
            observacao: typeof body?.observacao === 'string' ? body.observacao : '',
            por: a.session.user?.email || 'equipe',
        });
        return NextResponse.json({ ...(await resumoValorCombinado(a.id)), assinaturaCartao });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'Não foi possível salvar o valor.' }, { status: 400 });
    }
}

/** Volta o cliente para o preço da tabela. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const a = await acesso(params);
    if (a.erro) return a.erro;
    const user = await User.findById(a.id).select('subscription valorCombinado').lean() as any;
    if (!user) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
    const planId = user.valorCombinado?.planId || user.subscription?.planId;
    let assinaturaCartao: 'atualizada' | 'falhou' | null = null;
    if (planId && mongoose.isValidObjectId(planId)) {
        ({ assinaturaCartao } = await gravarValorCombinado({
            userId: a.id,
            planId: String(planId),
            periodicidade: normalizeBillingType(user.valorCombinado?.periodicidade || user.subscription?.billingType),
            valor: null,
            por: a.session.user?.email || 'equipe',
        }));
    } else {
        await User.updateOne({ _id: user._id }, { $unset: { valorCombinado: '' } });
    }
    return NextResponse.json({ ...(await resumoValorCombinado(a.id)), assinaturaCartao });
}
