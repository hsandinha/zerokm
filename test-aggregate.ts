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
        { $unwind: { path: '$variation', preserveNullAndEmptyArrays: true } },
        { $limit: 1 }
    ];
    const data = await DealerVehiclePrice.aggregate(pipeline);
    console.log(JSON.stringify(data, null, 2));
    process.exit(0);
}
test();
