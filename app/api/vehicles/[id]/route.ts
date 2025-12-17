import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Vehicle from '@/models/Vehicle';
import Modelo from '@/models/Modelo';
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

        // Se o modelo foi alterado, buscar o modeloId correspondente
        if (body.modelo && !body.modeloId) {
            const modeloDoc = await Modelo.findOne({ 
                nome: { $regex: new RegExp(`^${body.modelo.trim()}$`, 'i') }
            });
            if (modeloDoc) {
                body.modeloId = modeloDoc._id;
                // Também atualizar a marca se o modelo foi encontrado
                if (!body.marca && modeloDoc.marca) {
                    body.marca = modeloDoc.marca;
                }
            }
        }

        const updatedVehicle = await Vehicle.findByIdAndUpdate(
            id,
            { $set: body },
            { new: true }
        ).populate('modeloId', 'nome marca');

        if (!updatedVehicle) {
            return NextResponse.json({ error: 'Veículo não encontrado' }, { status: 404 });
        }

        const obj = updatedVehicle.toObject();
        const modeloPopulado = obj.modeloId as any;

        return NextResponse.json({
            ...obj,
            id: obj._id.toString(),
            _id: undefined,
            modelo: modeloPopulado?.nome || obj.modelo,
            marca: modeloPopulado?.marca || obj.marca,
            modeloId: modeloPopulado?._id?.toString() || obj.modeloId?.toString()
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
