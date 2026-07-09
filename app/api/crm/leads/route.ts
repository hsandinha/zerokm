import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Lead from '@/models/Lead';
import LeadStage from '@/models/LeadStage';
import LeadEvent from '@/models/LeadEvent';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { resolveCrmScope } from '@/lib/utils/crmScope';
import { periodFilter, resolvePeriodFromRequest } from '@/lib/utils/period';
import { serializeLead } from '@/lib/utils/crmSerialize';
import { classifyLeadTags } from '@/lib/utils/leadTags';

export async function GET(request: Request) {
    try {
        await connectDB();

        const session = await getServerSession(authOptions);
        const scope = await resolveCrmScope(session);
        if (!scope.ok) {
            return NextResponse.json({ error: scope.error }, { status: scope.status });
        }

        const url = new URL(request.url);
        const period = resolvePeriodFromRequest(url);

        const tags = (url.searchParams.get('tags') || '')
            .split(',')
            .map(t => t.trim())
            .filter(Boolean);
        const stageId = url.searchParams.get('stageId');
        const ownerId = url.searchParams.get('ownerId');

        const filter: Record<string, any> = {
            concessionariaId: scope.concessionariaId,
            ativo: true,
            ...periodFilter(period),
        };
        if (tags.length) filter.tags = { $in: tags };
        if (stageId) filter.stageId = stageId;
        if (ownerId) filter.ownerId = ownerId;

        const leads = await Lead.find(filter).sort({ createdAt: -1 });

        return NextResponse.json({
            data: leads.map(serializeLead),
            period: { preset: period.preset, from: period.from, to: period.to },
        });
    } catch (error: any) {
        console.error('Erro ao buscar leads:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        await connectDB();

        const session = await getServerSession(authOptions);
        const scope = await resolveCrmScope(session);
        if (!scope.ok) {
            return NextResponse.json({ error: scope.error }, { status: scope.status });
        }

        const { concessionariaId } = scope;
        const body = await request.json();
        const { name, phone, email, source, campaign, stageId, notes, firstMessage, ownerId, ownerName } = body;

        if (!name || !phone || !stageId) {
             return NextResponse.json({ error: 'Nome, telefone e fase são obrigatórios' }, { status: 400 });
        }

        const stage = await LeadStage.findOne({ _id: stageId, concessionariaId });
        if (!stage) {
            return NextResponse.json({ error: 'Fase não encontrada' }, { status: 400 });
        }
        if (stage.type === 'lost') {
            return NextResponse.json({ error: 'Não é possível criar um lead direto em uma fase de perda' }, { status: 400 });
        }

        const tags = Array.isArray(body.tags) && body.tags.length ? body.tags : classifyLeadTags(firstMessage);

        const newLead = await Lead.create({
            name,
            phone,
            email,
            source,
            campaign,
            tags,
            firstMessage,
            stageId,
            ownerId: ownerId || null,
            ownerName: ownerName || undefined,
            concessionariaId,
            notes
        });

        await LeadEvent.create({
            leadId: newLead._id,
            concessionariaId,
            type: 'created',
            fromStageId: null,
            toStageId: newLead.stageId,
            actor: 'user',
            actorEmail: session?.user?.email ?? undefined
        });

        return NextResponse.json(serializeLead(newLead), { status: 201 });
    } catch (error: any) {
        console.error('Erro ao criar lead:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
