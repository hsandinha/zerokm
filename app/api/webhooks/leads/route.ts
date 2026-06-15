import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Concessionaria from '@/models/Concessionaria';
import User from '@/models/User';
import Lead from '@/models/Lead';
import LeadStage from '@/models/LeadStage';

export async function POST(req: Request) {
    try {
        await dbConnect();

        // 1. Authenticate via Token
        const authHeader = req.headers.get('authorization');
        const url = new URL(req.url);
        const queryToken = url.searchParams.get('token');

        let token = queryToken;
        if (!token && authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7);
        }

        if (!token) {
            return NextResponse.json({ error: 'Token de autenticação não fornecido' }, { status: 401 });
        }

        // Find by webhookSecret (could be a Dealership or an Admin User)
        let concessionariaId: string | undefined = undefined;
        let ownerFound = false;

        const concessionaria = await Concessionaria.findOne({ webhookSecret: token });
        if (concessionaria) {
            concessionariaId = concessionaria._id.toString();
            ownerFound = true;
        } else {
            const user: any = await User.findOne({ webhookSecret: token });
            if (user && (user.profile === 'admin' || user.profile === 'administrador' || user.profile === 'marketing')) {
                concessionariaId = undefined; // Global pipeline
                ownerFound = true;
            }
        }

        if (!ownerFound) {
            return NextResponse.json({ error: 'Token inválido ou conta não encontrada' }, { status: 401 });
        }

        // 2. Parse payload
        let body;
        try {
            body = await req.json();
        } catch (e) {
            return NextResponse.json({ error: 'Body deve ser um JSON válido' }, { status: 400 });
        }

        const { name, phone, email, source, campaign, notes } = body;

        if (!name || !phone) {
            return NextResponse.json({ error: 'Nome e telefone são obrigatórios' }, { status: 400 });
        }

        // 3. Find or create the initial stage
        let stage = await LeadStage.findOne({ concessionariaId }).sort({ order: 1 });
        
        if (!stage) {
            // If there are no stages, create a default one
            stage = await LeadStage.create({
                name: 'Novo Lead (Integração)',
                concessionariaId,
                order: 0,
                color: '#3b82f6'
            });
        }

        // 4. Create the lead
        const lead = await Lead.create({
            name,
            phone,
            email,
            source: source || 'Integração Webhook',
            campaign,
            notes,
            stageId: stage._id,
            concessionariaId
        });

        return NextResponse.json({
            success: true,
            message: 'Lead criado com sucesso',
            data: lead
        }, { status: 201 });

    } catch (error: any) {
        console.error('Webhook Error:', error);
        return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
    }
}
