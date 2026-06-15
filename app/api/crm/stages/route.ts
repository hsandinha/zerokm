import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import LeadStage from '@/models/LeadStage';
import User from '@/models/User';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();
        
        let concessionariaId: string | undefined = undefined;
        // @ts-ignore
        if (session.user?.profile === 'admin' || session.user?.profile === 'administrador' || session.user?.profile === 'marketing') {
            // Admins and Marketing have access to the global pipeline (concessionariaId = null)
        } else if (session.user?.profile === 'concessionaria' || session.user?.profile === 'dealership') {
            const user = await User.findOne({ email: session.user?.email });
            if (user && user.dealershipId) {
                concessionariaId = user.dealershipId;
            } else {
                 return NextResponse.json({ data: [] });
            }
        } else {
             return NextResponse.json({ error: 'Acesso negado ao CRM' }, { status: 403 });
        }

        const stages = await LeadStage.find({ concessionariaId }).sort({ order: 1 });
        
        const serializedStages = stages.map(doc => {
            const obj = doc.toObject();
            return { ...obj, id: obj._id.toString(), _id: undefined };
        });

        return NextResponse.json({ data: serializedStages });
    } catch (error: any) {
        console.error('Erro ao buscar fases do funil:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();
        const body = await request.json();

        let concessionariaId: string | undefined = undefined;
        // @ts-ignore
        if (session.user?.profile === 'admin' || session.user?.profile === 'administrador' || session.user?.profile === 'marketing') {
            // Admins and Marketing create stages for the global pipeline
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

        if (!name || order === undefined) {
             return NextResponse.json({ error: 'Nome e ordem são obrigatórios' }, { status: 400 });
        }

        const newStage = await LeadStage.create({
            name,
            order,
            color: color || '#E5E7EB',
            concessionariaId
        });

        const doc = newStage as any;

        return NextResponse.json({
            ...doc.toObject(),
            id: doc._id.toString(),
            _id: undefined
        }, { status: 201 });
    } catch (error: any) {
        console.error('Erro ao criar fase do funil:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
