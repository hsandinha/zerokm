import mongoose from 'mongoose';
import connectDB from './lib/mongodb';
import DealerVehiclePrice from './models/DealerVehiclePrice';
import VehicleVariation from './models/VehicleVariation';

async function test() {
    await connectDB();
    const pipeline = [
        {
            $lookup: {
                from: 'vehiclevariations',
                localField: 'variationId',
                foreignField: '_id',
                as: 'variation'
            }
        },
        { $unwind: '$variation' },
        {
            $lookup: {
                from: 'concessionarias',
                localField: 'concessionariaId',
                foreignField: '_id',
                as: 'concessionariaInfo'
            }
        },
        { $unwind: { path: '$concessionariaInfo', preserveNullAndEmptyArrays: true } },
        {
            $lookup: {
                from: 'users',
                localField: 'concessionariaInfo.operadorId',
                foreignField: '_id',
                as: 'operadorInfo'
            }
        },
        { $unwind: { path: '$operadorInfo', preserveNullAndEmptyArrays: true } },
        { $match: {} },
        { $sort: { createdAt: -1 } },
        { $skip: 0 },
        { $limit: 2 }
    ];
    
    const data = await DealerVehiclePrice.aggregate(pipeline);
    
    const serializedData = data.map((doc: any) => {
        const v = doc.variation;
        const c = doc.concessionariaInfo || {};
        
        return {
            id: doc._id?.toString(),
            variationId: v._id?.toString(),
            concessionariaId: c._id?.toString(),
            marca: v.marca,
            modelo: v.modelo,
            ano: v.ano || String(v.anoModelo),
            combustivel: v.combustivel,
            cor: v.cor,
            transmissao: v.transmissao,
            opcionais: v.opcionais,
            status: v.status || 'A faturar',
            preco: doc.preco,
            frete: doc.frete || 0,
            concessionaria: c.nome || '',
            operador: doc.operadorInfo?.displayName || '',
        };
    });
    
    console.log("MAPPED RESULTS:");
    console.log(JSON.stringify(serializedData, null, 2));
    process.exit(0);
}
test();
