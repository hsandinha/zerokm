import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Lead from '@/models/Lead';
import LeadStage from '@/models/LeadStage';
import LeadEvent from '@/models/LeadEvent';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { resolveCrmScope } from '@/lib/utils/crmScope';
import { LOST_REASON_VALUES } from '@/lib/utils/crmFunnel';
import { serializeLead } from '@/lib/utils/crmSerialize';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
        const { stageId, lostReason, lostReasonNote } = body;

        if (!stageId) {
            return NextResponse.json({ error: 'Nova fase é obrigatória' }, { status: 400 });
        }

        const lead = await Lead.findOne({ _id: id, concessionariaId });
        if (!lead) {
             return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 });
        }

        const stage = await LeadStage.findOne({ _id: stageId, concessionariaId });
        if (!stage) {
            return NextResponse.json({ error: 'Fase não encontrada' }, { status: 400 });
        }

        const isLost = stage.type === 'lost';
        if (isLost && !LOST_REASON_VALUES.includes(lostReason)) {
            return NextResponse.json(
                { error: 'Motivo da perda é obrigatório', code: 'LOST_REASON_REQUIRED', reasons: LOST_REASON_VALUES },
                { status: 400 },
            );
        }

        const fromStageId = lead.stageId;
        const moved = fromStageId.toString() !== (stage._id as any).toString();

        if (moved) {
            lead.stageId = stage._id as any;
            // Sair da fase de perda descarta o motivo: ele descreve o estado, não a história.
            // A história fica nos eventos.
            lead.lostReason = isLost ? lostReason : null;
            lead.lostReasonNote = isLost ? (lostReasonNote || undefined) : undefined;
            await lead.save();

            await LeadEvent.create({
                leadId: lead._id,
                concessionariaId,
                type: 'stage_changed',
                fromStageId,
                toStageId: stage._id,
                actor: 'user',
                actorEmail: session?.user?.email ?? undefined,
                lostReason: isLost ? lostReason : null,
            });
        }

        return NextResponse.json(serializeLead(lead));
    } catch (error: any) {
        console.error('Erro ao atualizar fase do lead:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
