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

export async function GET() {
    try {
        await connectDB();
        const plans = await Plan.find({}).sort({ createdAt: -1 });
        return NextResponse.json(plans.map(p => {
            const obj = p.toObject();
            return { ...obj, id: p._id.toString(), _id: undefined, popular: obj.popular ?? false, publico: obj.publico || 'cliente' };
        }));
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !['administrador', 'admin'].includes(session.user?.profile as string)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        await connectDB();
        const body = await request.json();
        const plan = await Plan.create(normalizarPublico(body));
        return NextResponse.json({ ...plan.toObject(), id: plan._id.toString(), _id: undefined }, { status: 201 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
