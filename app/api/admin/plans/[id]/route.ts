import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import Plan from '@/models/Plan';

/**
 * Plano de concessionária é sempre mensal (com anual opcional), sem convidado e
 * sem destaque na landing, que é do lojista. Planos sem o campo são do lojista.
 */
function normalizarPublico(body: any) {
    if (!body || typeof body !== 'object') return body;
    if (!Object.prototype.hasOwnProperty.call(body, 'publico')) return body;
    const publico = body.publico === 'concessionaria' ? 'concessionaria' : 'cliente';
    if (publico === 'cliente') return { ...body, publico };
    return { ...body, publico, type: 'monthly', credits: null, invitePrice: 0, popular: false };
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    try {
        const session = await getServerSession(authOptions);
        if (!session || !['administrador', 'admin'].includes(session.user?.profile as string)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        await connectDB();
        const body = await request.json();
        // `popular` só é normalizado quando vem no corpo. Coagir sempre fazia o
        // toggle de "Ativo" — que envia apenas { active } — gravar popular:false
        // e apagar o destaque do plano na landing page sem ninguém pedir.
        const withPopular = Object.prototype.hasOwnProperty.call(body, 'popular')
            ? { ...body, popular: body.popular === true }
            : body;
        const safeBody = normalizarPublico(withPopular);
        const plan = await Plan.findByIdAndUpdate(id, { $set: safeBody }, { returnDocument: 'after' });
        if (!plan) return NextResponse.json({ error: 'Plano não encontrado' }, { status: 404 });
        return NextResponse.json({ ...plan.toObject(), id: plan._id.toString(), _id: undefined });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    try {
        const session = await getServerSession(authOptions);
        if (!session || !['administrador', 'admin'].includes(session.user?.profile as string)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        await connectDB();
        await Plan.findByIdAndDelete(id);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
