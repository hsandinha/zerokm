import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import LeadStage from '@/models/LeadStage';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { resolveCrmScope } from '@/lib/utils/crmScope';
import { LEAD_STAGE_TYPES } from '@/lib/utils/crmFunnel';
import { serializeStage } from '@/lib/utils/crmSerialize';

export async function GET(request: Request) {
    try {
        await connectDB();

        const session = await getServerSession(authOptions);
        const scope = await resolveCrmScope(session);
        if (!scope.ok) {
            return NextResponse.json({ error: scope.error }, { status: scope.status });
        }

        const stages = await LeadStage.find({ concessionariaId: scope.concessionariaId }).sort({ order: 1 });

        return NextResponse.json({ data: stages.map(serializeStage) });
    } catch (error: any) {
        console.error('Erro ao buscar fases do funil:', error);
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

        const body = await request.json();
        const { name, order, color, type } = body;

        if (!name || order === undefined) {
             return NextResponse.json({ error: 'Nome e ordem são obrigatórios' }, { status: 400 });
        }
        if (type && !LEAD_STAGE_TYPES.includes(type)) {
            return NextResponse.json({ error: 'Tipo de fase inválido' }, { status: 400 });
        }

        const newStage = await LeadStage.create({
            name,
            order,
            color: color || '#E5E7EB',
            type: type || 'open',
            concessionariaId: scope.concessionariaId
        });

        return NextResponse.json(serializeStage(newStage), { status: 201 });
    } catch (error: any) {
        console.error('Erro ao criar fase do funil:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
