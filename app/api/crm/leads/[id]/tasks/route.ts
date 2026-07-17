import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Lead from '@/models/Lead';
import LeadTask from '@/models/LeadTask';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { resolveCrmScope } from '@/lib/utils/crmScope';
import { serializeTask } from '@/lib/utils/crmSerialize';

async function resolveLead(session: any, id: string) {
    const scope = await resolveCrmScope(session);
    if (!scope.ok) {
        return { error: NextResponse.json({ error: scope.error }, { status: scope.status }) };
    }
    const lead = await Lead.findOne({ _id: id, concessionariaId: scope.concessionariaId });
    if (!lead) {
        return { error: NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 }) };
    }
    return { lead, concessionariaId: scope.concessionariaId };
}

/** Tarefas de follow-up do lead, pendentes primeiro, por vencimento. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        await connectDB();

        const session = await getServerSession(authOptions);
        const { id } = await params;
        const resolved = await resolveLead(session, id);
        if (resolved.error) return resolved.error;

        const tasks = await LeadTask.find({ leadId: resolved.lead._id }).sort({ done: 1, dueAt: 1 });

        return NextResponse.json({ data: tasks.map(serializeTask) });
    } catch (error: any) {
        console.error('Erro ao listar tarefas do lead:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        await connectDB();

        const session = await getServerSession(authOptions);
        const { id } = await params;
        const resolved = await resolveLead(session, id);
        if (resolved.error) return resolved.error;

        const body = await request.json();
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        const dueAt = body.dueAt ? new Date(body.dueAt) : null;

        if (!title) {
            return NextResponse.json({ error: 'Descreva a tarefa' }, { status: 400 });
        }
        if (!dueAt || isNaN(dueAt.getTime())) {
            return NextResponse.json({ error: 'Data de vencimento inválida' }, { status: 400 });
        }

        const task = await LeadTask.create({
            leadId: resolved.lead._id,
            concessionariaId: resolved.concessionariaId,
            title,
            dueAt,
            createdBy: session?.user?.email ?? undefined,
        });

        return NextResponse.json(serializeTask(task), { status: 201 });
    } catch (error: any) {
        console.error('Erro ao criar tarefa do lead:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
