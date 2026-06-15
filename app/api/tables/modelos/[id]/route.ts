import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Modelo from '@/models/Modelo';
import Vehicle from '@/models/Vehicle';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';

const MODEL_CRUD_PROFILES = ['admin', 'administrador', 'administrativo', 'gerente', 'operator', 'operador'];

async function canManageModelos() {
    const session = await getServerSession(authOptions);
    const profile = (session?.user as any)?.profile;
    return !!profile && MODEL_CRUD_PROFILES.includes(profile);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    try {
        if (!(await canManageModelos())) {
            return NextResponse.json({ error: 'Sem permissão para alterar modelos' }, { status: 403 });
        }

        await connectDB();
        const body = await request.json();

        // Buscar modelo antigo para comparar
        const modeloAntigo = await Modelo.findById(id);
        if (!modeloAntigo) {
            return NextResponse.json({ error: 'Modelo não encontrado' }, { status: 404 });
        }

        // Atualizar o modelo
        const updated = await Modelo.findByIdAndUpdate(id, body, { returnDocument: 'after' });
        if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

        // Se o nome ou marca mudou, atualizar em cascata os veículos vinculados
        const nomeNovo = body.nome?.toUpperCase() || body.nome;
        const marcaNova = body.marca;

        if (modeloAntigo.nome !== nomeNovo || modeloAntigo.marca !== marcaNova) {
            const updateFields: any = {};
            if (modeloAntigo.nome !== nomeNovo) {
                updateFields.modelo = nomeNovo;
            }
            if (modeloAntigo.marca !== marcaNova) {
                updateFields.marca = marcaNova;
            }

            if (Object.keys(updateFields).length > 0) {
                const result = await Vehicle.updateMany(
                    { modeloId: id },
                    { $set: updateFields }
                );
                console.log(`Atualizados ${result.modifiedCount} veículos com o novo nome/marca do modelo`);
            }
        }

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
        if (!(await canManageModelos())) {
            return NextResponse.json({ error: 'Sem permissão para alterar modelos' }, { status: 403 });
        }

        await connectDB();

        // Verificar se há veículos vinculados
        const vehiclesCount = await Vehicle.countDocuments({ modeloId: id });
        if (vehiclesCount > 0) {
            return NextResponse.json({
                error: `Não é possível excluir. Existem ${vehiclesCount} veículo(s) vinculado(s) a este modelo.`
            }, { status: 400 });
        }

        const deleted = await Modelo.findByIdAndDelete(id);
        if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
