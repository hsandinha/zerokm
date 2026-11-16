import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Concessionaria from '@/models/Concessionaria';
import User from '@/models/User';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import crypto from 'crypto';
import { barrarAtendente } from '@/lib/services/acessoLoja';

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        await connectDB();

        // Token de integração dá acesso à loja por API: só o titular vê e gera.
        const recusa = await barrarAtendente(session, 'integracoes');
        if (recusa) return recusa;
        
        // Admins can manage a global token (we will just attach it to a "Global" placeholder or use a default one)
        // For simplicity, let's say the token belongs to the User if they are Admin, or the Concessionaria.
        // Actually, let's store Admin token in the User model if they don't have a dealership.
        
        let targetDoc: any = null;

        // @ts-ignore
        if (session.user?.profile === 'admin' || session.user?.profile === 'administrador' || session.user?.profile === 'marketing') {
            targetDoc = await User.findOne({ email: session.user?.email });
        } else if (session.user?.profile === 'concessionaria' || session.user?.profile === 'dealership') {
            const user = await User.findOne({ email: session.user?.email });
            if (user && user.dealershipId) {
                targetDoc = await Concessionaria.findById(user.dealershipId);
            }
        }

        if (!targetDoc) {
             return NextResponse.json({ error: 'Nenhuma conta encontrada para gerar o token' }, { status: 404 });
        }

        return NextResponse.json({ token: targetDoc.webhookSecret || null });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        await connectDB();

        const recusa = await barrarAtendente(session, 'integracoes');
        if (recusa) return recusa;
        
        let targetDoc: any = null;

        // @ts-ignore
        if (session.user?.profile === 'admin' || session.user?.profile === 'administrador' || session.user?.profile === 'marketing') {
            targetDoc = await User.findOne({ email: session.user?.email });
        } else if (session.user?.profile === 'concessionaria' || session.user?.profile === 'dealership') {
            const user = await User.findOne({ email: session.user?.email });
            if (user && user.dealershipId) {
                targetDoc = await Concessionaria.findById(user.dealershipId);
            }
        }

        if (!targetDoc) {
             return NextResponse.json({ error: 'Nenhuma conta encontrada para gerar o token' }, { status: 404 });
        }

        // Generate a new random token
        const newToken = 'zkm_' + crypto.randomBytes(24).toString('hex');
        targetDoc.webhookSecret = newToken;
        await targetDoc.save();

        return NextResponse.json({ token: newToken });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
