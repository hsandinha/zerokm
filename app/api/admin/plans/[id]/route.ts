import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import Plan from '@/models/Plan';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    try {
        const session = await getServerSession(authOptions);
        if (!session || !['administrador', 'admin'].includes(session.user?.profile as string)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        await connectDB();
        const body = await request.json();
        // Ensure boolean fields are not stripped by JSON (undefined becomes missing key)
        const safeBody = { ...body, popular: body.popular === true };
        const plan = await Plan.findByIdAndUpdate(id, { $set: safeBody }, { returnDocument: 'after' });
        if (!plan) return NextResponse.json({ error: 'Plano não encontrado' }, { status: 404 });
        return NextResponse.json({ ...plan.toObject(), id: plan._id.toString(), _id: undefined });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    try {
        const session = await getServerSession(authOptions);
        if (!session || !['administrador', 'admin'].includes(session.user?.profile as string)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        await connectDB();
        await Plan.findByIdAndDelete(id);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
