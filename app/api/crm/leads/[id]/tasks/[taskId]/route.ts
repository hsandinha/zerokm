import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Lead from '@/models/Lead';
import LeadTask from '@/models/LeadTask';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { resolveCrmScope } from '@/lib/utils/crmScope';
import { serializeTask } from '@/lib/utils/crmSerialize';

async function resolveTask(session: any, leadId: string, taskId: string) {
    const scope = await resolveCrmScope(session);
    if (!scope.ok) {
        return { error: NextResponse.json({ error: scope.error }, { status: scope.status }) };
    }
    const lead = await Lead.findOne({ _id: leadId, concessionariaId: scope.concessionariaId });
    if (!lead) {
        return { error: NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 }) };
    }
    const task = await LeadTask.findOne({ _id: taskId, leadId: lead._id });
    if (!task) {
        return { error: NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 }) };
    }
    return { task };
}

/** Conclui/reabre a tarefa ou edita título e vencimento. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
    try {
        await connectDB();

        const session = await getServerSession(authOptions);
        const { id, taskId } = await params;
        const resolved = await resolveTask(session, id, taskId);
        if (resolved.error) return resolved.error;

        const { task } = resolved;
        const body = await request.json();

        if ('done' in body) {
            task.done = Boolean(body.done);
            task.doneAt = task.done ? new Date() : null;
        }
        if ('title' in body) {
            const title = typeof body.title === 'string' ? body.title.trim() : '';
            if (!title) {
                return NextResponse.json({ error: 'Descreva a tarefa' }, { status: 400 });
            }
            task.title = title;
        }
        if ('dueAt' in body) {
            const dueAt = body.dueAt ? new Date(body.dueAt) : null;
            if (!dueAt || isNaN(dueAt.getTime())) {
                return NextResponse.json({ error: 'Data de vencimento inválida' }, { status: 400 });
            }
            task.dueAt = dueAt;
        }

        await task.save();

        return NextResponse.json(serializeTask(task));
    } catch (error: any) {
        console.error('Erro ao atualizar tarefa do lead:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
    try {
        await connectDB();

        const session = await getServerSession(authOptions);
        const { id, taskId } = await params;
        const resolved = await resolveTask(session, id, taskId);
        if (resolved.error) return resolved.error;

        await resolved.task.deleteOne();

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Erro ao excluir tarefa do lead:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
