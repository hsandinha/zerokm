import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '../../../../lib/mongodb';
import Vehicle from '../../../../models/Vehicle';

export async function POST(request: NextRequest) {
    try {
        const { concessionaria, vehicleIds } = await request.json();

        if (!concessionaria || !vehicleIds || !Array.isArray(vehicleIds) || vehicleIds.length === 0) {
            return NextResponse.json(
                { error: 'Concessionária e IDs de veículos são obrigatórios' },
                { status: 400 }
            );
        }

        await dbConnect();

        // Atualizar todos os veículos selecionados
        const result = await Vehicle.updateMany(
            { _id: { $in: vehicleIds } },
            {
                $set: {
                    concessionaria: concessionaria,
                    updatedAt: new Date()
                }
            }
        );

        return NextResponse.json({
            success: true,
            message: `${result.modifiedCount} veículo(s) associado(s) com sucesso`,
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        console.error('Erro ao associar veículos:', error);
        return NextResponse.json(
            { error: 'Erro ao associar veículos' },
            { status: 500 }
        );
    }
}
