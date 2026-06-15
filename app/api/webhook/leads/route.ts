import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Lead from '@/models/Lead';
import LeadStage from '@/models/LeadStage';

export async function POST(request: Request) {
    try {
        await connectDB();
        const body = await request.json();

        // No MVP, vamos receber o concessionariaId diretamente no body do webhook.
        // Numa versão futura, isso pode ser um token ou API key vinculado à concessionária.
        const { name, phone, email, source, campaign, concessionariaId, notes } = body;

        if (!name || !phone) {
             return NextResponse.json({ error: 'Nome e telefone são obrigatórios' }, { status: 400 });
        }

        // Buscar a primeira fase do funil (menor order) daquela concessionária (ou null para Admin) para colocar o lead lá.
        const firstStage = await LeadStage.findOne({ concessionariaId: concessionariaId || null }).sort({ order: 1 });
        
        if (!firstStage) {
            return NextResponse.json({ error: 'Nenhuma fase de funil encontrada para esta concessionária. Crie uma fase no painel primeiro.' }, { status: 400 });
        }

        const newLead = await Lead.create({
            name,
            phone,
            email,
            source,
            campaign,
            stageId: firstStage._id,
            concessionariaId: concessionariaId || null,
            notes: notes || 'Lead recebido via Webhook'
        });

        return NextResponse.json({ success: true, leadId: newLead._id }, { status: 201 });
    } catch (error: any) {
        console.error('Erro no webhook de leads:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
