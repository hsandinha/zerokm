import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import LeadStage from '@/models/LeadStage';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { resolveCrmScope } from '@/lib/utils/crmScope';
import { DEFAULT_FUNNEL } from '@/lib/utils/crmFunnel';
import { serializeStage } from '@/lib/utils/crmSerialize';

/** Cria o funil padrão de 11 etapas. Recusa se já existirem fases, para nunca duplicar. */
export async function POST() {
    try {
        await connectDB();

        const session = await getServerSession(authOptions);
        const scope = await resolveCrmScope(session);
        if (!scope.ok) {
            return NextResponse.json({ error: scope.error }, { status: scope.status });
        }

        const { concessionariaId } = scope;

        const existing = await LeadStage.countDocuments({ concessionariaId });
        if (existing > 0) {
            return NextResponse.json(
                { error: 'O funil já tem fases cadastradas. Exclua-as antes de recriar o padrão.' },
                { status: 409 },
            );
        }

        const stages = await LeadStage.insertMany(
            DEFAULT_FUNNEL.map((stage, order) => ({ ...stage, order, concessionariaId })),
        );

        return NextResponse.json({ data: stages.map(serializeStage) }, { status: 201 });
    } catch (error: any) {
        console.error('Erro ao criar funil padrão:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
