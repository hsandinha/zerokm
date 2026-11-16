import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import { WaStore } from '@wa/models/store';
import { storeAccess } from '@wa/lib/store';

export const dynamic = 'force-dynamic';

/**
 * Loja de atendimento (WhatsApp) do lojista, para a ficha do cliente. Só lê:
 * a loja nasce no primeiro acesso do lojista ao atendimento, não aqui. Ativar
 * e desativar continuam em /api/wa/lojas/[id].
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    const profile = (session?.user as any)?.profile;
    // Mesma regra das rotas do CRM.
    if (!profile || !['administrador', 'admin'].includes(profile)) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
    }
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 });

    await connectDB();
    const store = await WaStore.findOne({ ownerUserId: id });
    if (!store) return NextResponse.json({ loja: null });
    return NextResponse.json({
        loja: {
            id: String(store._id),
            name: store.name,
            access: storeAccess(store),
            aiActive: Boolean(store.ai?.active && store.ai?.token),
        },
    });
}
