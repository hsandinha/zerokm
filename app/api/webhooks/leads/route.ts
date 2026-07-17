import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Lead from '@/models/Lead';
import LeadStage from '@/models/LeadStage';
import LeadEvent from '@/models/LeadEvent';
import { classifyLeadTags } from '@/lib/utils/leadTags';
import { resolveWebhookAccount } from '@/lib/utils/webhookAuth';

export async function POST(req: Request) {
    try {
        await dbConnect();

        // 1. Authenticate via Token (Dealership or Admin User webhookSecret)
        const account = await resolveWebhookAccount(req);
        if (!account.ok) {
            return NextResponse.json({ error: 'Token inválido ou conta não encontrada' }, { status: 401 });
        }
        const { concessionariaId } = account;

        // 2. Parse payload
        let body;
        try {
            body = await req.json();
        } catch (e) {
            return NextResponse.json({ error: 'Body deve ser um JSON válido' }, { status: 400 });
        }

        const { name, phone, email, source, campaign, notes, message } = body;

        if (!name || !phone) {
            return NextResponse.json({ error: 'Nome e telefone são obrigatórios' }, { status: 400 });
        }

        // 3. Fase de entrada: a primeira aberta. Cair numa fase de venda/perda por acidente
        // de ordenação estragaria toda a contagem do funil.
        // Fases criadas antes de `type` existir não têm o campo; o default do schema só
        // vale na hidratação, então a query precisa aceitá-las explicitamente.
        let stage = await LeadStage.findOne({
            concessionariaId,
            $or: [{ type: 'open' }, { type: { $exists: false } }],
        }).sort({ order: 1 });

        if (!stage) {
            // If there are no stages, create a default one
            stage = await LeadStage.create({
                name: 'Novo Lead (Integração)',
                concessionariaId,
                order: 0,
                color: '#3b82f6',
                type: 'open'
            });
        }

        // 4. Create the lead, classificando a origem pela frase inicial.
        const firstMessage = message || notes;
        const tags = classifyLeadTags(firstMessage);

        const lead = await Lead.create({
            name,
            phone,
            email,
            source: source || 'Integração Webhook',
            campaign,
            notes,
            firstMessage,
            tags,
            stageId: stage._id,
            concessionariaId
        });

        await LeadEvent.create({
            leadId: lead._id,
            concessionariaId,
            type: 'created',
            fromStageId: null,
            toStageId: stage._id,
            actor: 'webhook'
        });

        return NextResponse.json({
            success: true,
            message: 'Lead criado com sucesso',
            data: { id: (lead._id as any).toString(), tags }
        }, { status: 201 });

    } catch (error: any) {
        console.error('Webhook Error:', error);
        return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
    }
}
