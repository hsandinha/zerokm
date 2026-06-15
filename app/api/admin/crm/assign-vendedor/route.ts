import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import mongoose from 'mongoose';

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const profile = (session.user as any)?.profile;
        if (!['admin', 'administrador', 'gerente'].includes(profile)) {
            return NextResponse.json({ error: 'Acesso não autorizado' }, { status: 403 });
        }

        const { clientId, vendedorId } = await request.json();
        if (!clientId) {
            return NextResponse.json({ error: 'clientId é obrigatório' }, { status: 400 });
        }

        await connectDB();

        // Se vendedorId for vazio, remove o vínculo
        const update = vendedorId
            ? { vendedorId }
            : { $unset: { vendedorId: '' } };

        const updated = await User.findByIdAndUpdate(
            new mongoose.Types.ObjectId(clientId),
            update,
            { returnDocument: 'after' }
        ).select('_id displayName vendedorId').lean() as any;

        if (!updated) {
            return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
        }

        return NextResponse.json({ success: true, clientId, vendedorId: updated.vendedorId || null });
    } catch (error) {
        console.error('Erro ao vincular vendedor:', error);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}
