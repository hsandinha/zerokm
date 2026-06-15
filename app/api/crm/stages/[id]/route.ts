import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import LeadStage from '@/models/LeadStage';
import User from '@/models/User';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';

export async function PUT(request: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();
        const body = await request.json();

        let concessionariaId = null;
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

        const { name, order, color } = body;
        
        const stage = await LeadStage.findOne({ _id: params.id, concessionariaId });
        if (!stage) {
             return NextResponse.json({ error: 'Fase não encontrada' }, { status: 404 });
        }

        if (name) stage.name = name;
        if (order !== undefined) stage.order = order;
        if (color) stage.color = color;

        await stage.save();

        const doc = stage as any;
        return NextResponse.json({
            ...doc.toObject(),
            id: doc._id.toString(),
            _id: undefined
        });
    } catch (error: any) {
        console.error('Erro ao atualizar fase do funil:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();

        let concessionariaId = null;
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

        const stage = await LeadStage.findOneAndDelete({ _id: params.id, concessionariaId });
        if (!stage) {
             return NextResponse.json({ error: 'Fase não encontrada' }, { status: 404 });
        }

        return NextResponse.json({ message: 'Fase deletada com sucesso' });
    } catch (error: any) {
        console.error('Erro ao deletar fase do funil:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
