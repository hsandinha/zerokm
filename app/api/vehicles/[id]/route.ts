import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Vehicle from '@/models/Vehicle';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();
        const body = await request.json();

        const updatedVehicle = await Vehicle.findByIdAndUpdate(
            id,
            { $set: body },
            { new: true }
        );

        if (!updatedVehicle) {
            return NextResponse.json({ error: 'Veículo não encontrado' }, { status: 404 });
        }

        return NextResponse.json({
            ...updatedVehicle.toObject(),
            id: updatedVehicle._id.toString(),
            _id: undefined
        });
    } catch (error: any) {
        console.error('Erro ao atualizar veículo:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();
        const deletedVehicle = await Vehicle.findByIdAndDelete(id);

        if (!deletedVehicle) {
            return NextResponse.json({ error: 'Veículo não encontrado' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Erro ao deletar veículo:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
