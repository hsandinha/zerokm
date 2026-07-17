import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Lead from '@/models/Lead';
import LeadStage from '@/models/LeadStage';
import LeadEvent from '@/models/LeadEvent';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { resolveCrmScope } from '@/lib/utils/crmScope';
import { serializeEvent, serializeLead } from '@/lib/utils/crmSerialize';
import { computeIaResumeAt } from '@/lib/utils/iaSchedule';

/** Lead + histórico completo de movimentações (item 5 do funil comercial). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        await connectDB();

        const session = await getServerSession(authOptions);
        const scope = await resolveCrmScope(session);
        if (!scope.ok) {
            return NextResponse.json({ error: scope.error }, { status: scope.status });
        }

        const { concessionariaId } = scope;
        const { id } = await params;

        const lead = await Lead.findOne({ _id: id, concessionariaId });
        if (!lead) {
            return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 });
        }

        const [stages, events] = await Promise.all([
            LeadStage.find({ concessionariaId }),
            LeadEvent.find({ leadId: lead._id }).sort({ createdAt: 1 }),
        ]);

        const stageNames = new Map(stages.map(s => [(s._id as any).toString(), s.name]));
        const currentStage = stages.find(s => (s._id as any).toString() === lead.stageId.toString());

        return NextResponse.json({
            data: {
                ...serializeLead(lead),
                stageName: currentStage?.name ?? 'Fase removida',
                stageType: currentStage?.type ?? 'open',
                history: events.map(e => serializeEvent(e, stageNames)),
            },
        });
    } catch (error: any) {
        console.error('Erro ao buscar lead:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/** Atualiza responsável, tags e anotações. A fase muda por /stage, que grava o evento. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        await connectDB();

        const session = await getServerSession(authOptions);
        const scope = await resolveCrmScope(session);
        if (!scope.ok) {
            return NextResponse.json({ error: scope.error }, { status: scope.status });
        }

        const { concessionariaId } = scope;
        const { id } = await params;
        const body = await request.json();

        const lead = await Lead.findOne({ _id: id, concessionariaId });
        if (!lead) {
            return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 });
        }

        if ('ownerId' in body) {
            lead.ownerId = body.ownerId || null;
            lead.ownerName = body.ownerId ? (body.ownerName || undefined) : undefined;
        }
        if ('tags' in body && Array.isArray(body.tags)) {
            lead.tags = body.tags.map((t: any) => String(t).trim()).filter(Boolean);
        }
        if ('notes' in body) lead.notes = body.notes;
        if ('name' in body && body.name) lead.name = body.name;
        if ('phone' in body && body.phone) lead.phone = body.phone;
        if ('email' in body) lead.email = body.email;

        // Atuação humana pausa a IA de atendimento: volta 1h depois, dentro do horário comercial
        lead.iaPausedAt = new Date();
        lead.iaResumeAt = computeIaResumeAt(lead.iaPausedAt);

        await lead.save();

        return NextResponse.json(serializeLead(lead));
    } catch (error: any) {
        console.error('Erro ao atualizar lead:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
