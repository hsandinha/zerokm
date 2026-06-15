import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Lead from '@/models/Lead';
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
        
        let concessionariaId = null;
        // @ts-ignore
        if (session.user?.profile === 'admin' || session.user?.profile === 'administrador' || session.user?.profile === 'marketing') {
            // Admins and Marketing
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

        const leads = await Lead.find({ concessionariaId, ativo: true }).sort({ createdAt: -1 });
        
        const serializedLeads = leads.map(doc => {
            const obj = doc.toObject();
            return { ...obj, id: obj._id.toString(), _id: undefined, stageId: obj.stageId.toString() };
        });

        return NextResponse.json({ data: serializedLeads });
    } catch (error: any) {
        console.error('Erro ao buscar leads:', error);
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

        const { name, phone, email, source, campaign, stageId, notes } = body;

        if (!name || !phone || !stageId) {
             return NextResponse.json({ error: 'Nome, telefone e fase são obrigatórios' }, { status: 400 });
        }

        const newLead = await Lead.create({
            name,
            phone,
            email,
            source,
            campaign,
            stageId,
            concessionariaId,
            notes
        });

        const doc = newLead as any;

        return NextResponse.json({
            ...doc.toObject(),
            id: doc._id.toString(),
            _id: undefined,
            stageId: doc.stageId.toString()
        }, { status: 201 });
    } catch (error: any) {
        console.error('Erro ao criar lead:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
