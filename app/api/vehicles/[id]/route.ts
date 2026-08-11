import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import DealerVehiclePrice from '@/models/DealerVehiclePrice';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import User from '@/models/User';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const allowedProfiles = ['admin', 'administrador', 'administrativo', 'operator', 'operador', 'gerente'];
        const userProfile = session.user?.profile;
        if (!allowedProfiles.includes(userProfile || '')) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { id } = await params;
        const body = await request.json();

        await connectDB();

        const updateData: any = {};
        
        if (body.preco !== undefined) {
            const numPreco = Number(body.preco);
            if (numPreco <= 0 || isNaN(numPreco)) {
                updateData.preco = null;
                updateData.ativo = false;
                updateData.quantidade = 0;
            } else {
                updateData.preco = numPreco;
                updateData.ativo = true;
            }
        }

        if (body.quantidade !== undefined) {
            updateData.quantidade = Number(body.quantidade);
        }

        if (body.observacoes !== undefined) {
            updateData.observacoes = body.observacoes;
        }

        // Prazo de entrega: 0 = pronta entrega, null limpa o campo. Sem este
        // bloco a edição na Consulta de Veículos era aceita na tela e descartada
        // aqui, porque o PUT só olhava preço, quantidade e observações.
        if (body.prazo !== undefined) {
            const prazo = body.prazo === null || body.prazo === '' ? null : Number(body.prazo);
            if (prazo !== null && (!Number.isFinite(prazo) || prazo < 0)) {
                return NextResponse.json({ error: 'Prazo inválido' }, { status: 400 });
            }
            updateData.prazo = prazo;
        }

        // Preço zerado desativa o registro; manter prazo seria prometer entrega
        // de um veículo que saiu do catálogo.
        if (updateData.ativo === false) {
            updateData.prazo = null;
        }

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ message: 'Nada a atualizar' });
        }

        const currentDoc = await DealerVehiclePrice.findById(id);
        if (!currentDoc) {
            return NextResponse.json({ error: 'Registro não encontrado' }, { status: 404 });
        }

        if (updateData.ativo === true && currentDoc.quantidade === 0 && updateData.quantidade === undefined) {
            updateData.quantidade = 1;
        }

        const updated = await DealerVehiclePrice.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true }
        );

        if (!updated) {
            return NextResponse.json({ error: 'Registro não encontrado' }, { status: 404 });
        }

        return NextResponse.json(updated);
    } catch (error: any) {
        console.error('Erro ao atualizar DealerVehiclePrice:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    return NextResponse.json({ error: 'Exclusão desativada. Use a tela de Catálogo/Preços e zere o valor para remover o veículo.' }, { status: 405 });
}
