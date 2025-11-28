import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Cor from '@/models/Cor';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    try {
        await connectDB();
        const body = await request.json();
        const updated = await Cor.findByIdAndUpdate(id, body, { new: true });
        if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        return NextResponse.json({
            ...updated.toObject(),
            id: updated._id.toString(),
            _id: undefined
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    try {
        await connectDB();
        const deleted = await Cor.findByIdAndDelete(id);
        if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
