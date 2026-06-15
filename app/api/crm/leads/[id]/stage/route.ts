import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Lead from '@/models/Lead';
import User from '@/models/User';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        await connectDB();
        const body = await request.json();

        let concessionariaId: string | undefined = undefined;
        // @ts-ignore
        if (session.user?.profile === 'admin' || session.user?.profile === 'administrador' || session.user?.profile === 'marketing') {
            // Admins and Marketing
        } else if (session.user?.profile === 'concessionaria' || session.user?.profile === 'dealership') {
            const user = await User.findOne({ email: session.user?.email });
            if (user && user.dealershipId) {
                concessionariaId = user.dealershipId;
            } else {
                 return NextResponse.json({ error: 'Concessionária não vinculada' }, { status: 400 });
            }
        } else {
             return NextResponse.json({ error: 'Acesso negado ao CRM' }, { status: 403 });
        }

        const { stageId } = body;
        
        if (!stageId) {
            return NextResponse.json({ error: 'Nova fase é obrigatória' }, { status: 400 });
        }

        const lead = await Lead.findOne({ _id: id, concessionariaId });
        if (!lead) {
             return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 });
        }

        lead.stageId = stageId;
        await lead.save();

        const doc = lead as any;
        return NextResponse.json({
            ...doc.toObject(),
            id: doc._id.toString(),
            _id: undefined,
            stageId: doc.stageId.toString()
        });
    } catch (error: any) {
        console.error('Erro ao atualizar fase do lead:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
