import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import RepasseVehicle from '@/models/RepasseVehicle';
import { canTouchDealership, resolveDealershipScope } from '@/lib/services/dealershipScope';
import { serializeRepasse, validateRepasse } from '@/lib/utils/repasse';

type Params = { params: Promise<{ id: string }> };

async function loadOwned(request: Request, id: string) {
    const session = await getServerSession(authOptions);
    if (!session) return { ok: false as const, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    if (!mongoose.Types.ObjectId.isValid(id)) return { ok: false as const, error: NextResponse.json({ error: 'Registro não encontrado' }, { status: 404 }) };

    await connectDB();
    const scope = await resolveDealershipScope(session, request);
    if (scope.kind === 'none') return { ok: false as const, error: NextResponse.json({ error: 'Acesso negado' }, { status: 403 }) };

    const doc = await RepasseVehicle.findOne({ _id: id, ativo: true });
    if (!doc) return { ok: false as const, error: NextResponse.json({ error: 'Registro não encontrado' }, { status: 404 }) };
    // 404 e não 403: concessionária não precisa saber que o id existe em outra.
    if (!canTouchDealership(scope, doc.concessionariaId)) {
        return { ok: false as const, error: NextResponse.json({ error: 'Registro não encontrado' }, { status: 404 }) };
    }
    return { ok: true as const, doc, session };
}

/**
 * PATCH /api/dealership/repasse/:id — edição parcial (inclui troca de status).
 * Não exige plano ativo: com o plano vencido os anúncios já saem da vitrine,
 * e a loja precisa conseguir marcar Vendido ou corrigir antes de renovar.
 */
export async function PATCH(request: Request, { params }: Params) {
    try {
        const { id } = await params;
        const loaded = await loadOwned(request, id);
        if (!loaded.ok) return loaded.error;
        const { doc } = loaded;

        const body = await request.json().catch(() => ({}));
        const { data, errors } = validateRepasse(body, true);
        if (errors.length) return NextResponse.json({ error: errors.join(' '), errors }, { status: 400 });

        const $set: Record<string, any> = {};
        const $unset: Record<string, ''> = {};
        for (const [key, value] of Object.entries(data)) {
            if (value === undefined) $unset[key] = '';
            else $set[key] = value;
        }
        if (data.status && data.status !== doc.status) {
            $set.vendidoEm = data.status === 'Vendido' ? new Date() : null;
        }

        const update: Record<string, any> = {};
        if (Object.keys($set).length) update.$set = $set;
        if (Object.keys($unset).length) update.$unset = $unset;
        if (!Object.keys(update).length) return NextResponse.json(serializeRepasse(doc));

        const updated = await RepasseVehicle.findByIdAndUpdate(doc._id, update, { new: true });
        return NextResponse.json(serializeRepasse(updated));
    } catch (error: any) {
        console.error('[repasse] PATCH', error);
        return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
    }
}

/** DELETE /api/dealership/repasse/:id — exclusão lógica (ativo: false). */
export async function DELETE(request: Request, { params }: Params) {
    try {
        const { id } = await params;
        const loaded = await loadOwned(request, id);
        if (!loaded.ok) return loaded.error;

        await RepasseVehicle.findByIdAndUpdate(loaded.doc._id, { $set: { ativo: false } });
        return NextResponse.json({ ok: true });
    } catch (error: any) {
        console.error('[repasse] DELETE', error);
        return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
    }
}
