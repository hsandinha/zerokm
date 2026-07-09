import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Lead from '@/models/Lead';
import LeadStage from '@/models/LeadStage';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { resolveCrmScope } from '@/lib/utils/crmScope';
import { LEAD_STAGE_TYPES } from '@/lib/utils/crmFunnel';
import { serializeStage } from '@/lib/utils/crmSerialize';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        await connectDB();

        const session = await getServerSession(authOptions);
        const scope = await resolveCrmScope(session);
        if (!scope.ok) {
            return NextResponse.json({ error: scope.error }, { status: scope.status });
        }

        const { id } = await params;
        const body = await request.json();
        const { name, order, color, type } = body;

        if (type && !LEAD_STAGE_TYPES.includes(type)) {
            return NextResponse.json({ error: 'Tipo de fase inválido' }, { status: 400 });
        }

        const stage = await LeadStage.findOne({ _id: id, concessionariaId: scope.concessionariaId });
        if (!stage) {
             return NextResponse.json({ error: 'Fase não encontrada' }, { status: 404 });
        }

        if (name) stage.name = name;
        if (order !== undefined) stage.order = order;
        if (color) stage.color = color;
        if (type) stage.type = type;

        await stage.save();

        return NextResponse.json(serializeStage(stage));
    } catch (error: any) {
        console.error('Erro ao atualizar fase do funil:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        await connectDB();

        const session = await getServerSession(authOptions);
        const scope = await resolveCrmScope(session);
        if (!scope.ok) {
            return NextResponse.json({ error: scope.error }, { status: scope.status });
        }

        const { id } = await params;
        const { concessionariaId } = scope;

        // Apagar uma fase com leads dentro os deixaria órfãos e fora de qualquer coluna.
        const leadsNaFase = await Lead.countDocuments({ stageId: id, concessionariaId, ativo: true });
        if (leadsNaFase > 0) {
            return NextResponse.json(
                { error: `Esta fase tem ${leadsNaFase} lead(s). Mova-os antes de excluí-la.` },
                { status: 409 },
            );
        }

        const stage = await LeadStage.findOneAndDelete({ _id: id, concessionariaId });
        if (!stage) {
             return NextResponse.json({ error: 'Fase não encontrada' }, { status: 404 });
        }

        return NextResponse.json({ message: 'Fase deletada com sucesso' });
    } catch (error: any) {
        console.error('Erro ao deletar fase do funil:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
