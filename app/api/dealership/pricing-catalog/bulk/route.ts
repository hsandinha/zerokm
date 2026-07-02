import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import DealerVehiclePrice from '@/models/DealerVehiclePrice';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';

export async function PATCH(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();
        
        const { searchParams } = new URL(request.url);
        let concessionariaId = searchParams.get('concessionariaId');
        
        const currentProfile = session.user?.profile;
        if (currentProfile === 'dealership') {
            const user = await User.findOne({ email: session.user.email });
            if (!user?.dealershipId) {
                return NextResponse.json({ error: 'Usuário não tem concessionária vinculada' }, { status: 403 });
            }
            concessionariaId = user.dealershipId.toString();
        }

        if (!concessionariaId) {
            return NextResponse.json({ error: 'ID da concessionária é obrigatório' }, { status: 400 });
        }

        const body = await request.json();
        const updates = body.updates; // Array de { variationId, preco }

        if (!Array.isArray(updates) || updates.length === 0) {
            return NextResponse.json({ error: 'Nenhuma atualização enviada' }, { status: 400 });
        }

        // Executar as atualizações de forma otimizada (BulkWrite)
        const bulkOps = updates.map((update: any) => {
            const precoNumber = update.preco;
            const ativo = precoNumber && typeof precoNumber === 'number' && precoNumber > 0;
            
            return {
                updateOne: {
                    filter: { 
                        concessionariaId: new mongoose.Types.ObjectId(concessionariaId),
                        variationId: new mongoose.Types.ObjectId(update.variationId)
                    },
                    update: {
                        $set: {
                            preco: precoNumber > 0 ? precoNumber : null,
                            ativo: ativo,
                            quantidade: ativo ? (update.quantidade !== undefined ? Number(update.quantidade) : 1) : 0,
                            statusVeiculo: update.statusVeiculo || undefined,
                            updatedAt: new Date()
                        }
                    },
                    upsert: true
                }
            };
        });

        await DealerVehiclePrice.bulkWrite(bulkOps);

        return NextResponse.json({ 
            success: true, 
            message: `Atualizados ${bulkOps.length} registros com sucesso.` 
        });

    } catch (error: any) {
        console.error('Erro no bulk update:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
