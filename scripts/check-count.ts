import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
import mongoose from 'mongoose';

async function main() {
    await mongoose.connect(process.env.MONGODB_URI as string);
    const db = mongoose.connection.db;
    if(!db) throw new Error("No db");

    const totalPrices = await db.collection('dealervehicleprices').countDocuments();
    const activePrices = await db.collection('dealervehicleprices').countDocuments({ ativo: true });
    const legacyCount = await db.collection('vehicles_legacy_backup').countDocuments();
    const currentVehicles = await db.collection('vehicles').countDocuments();

    console.log(`Total DealerVehiclePrices: ${totalPrices}`);
    console.log(`Active DealerVehiclePrices: ${activePrices}`);
    console.log(`Legacy Backup Vehicles: ${legacyCount}`);
    console.log(`Current Vehicles collection (should be same as legacy): ${currentVehicles}`);

    // Run the same aggregation used in route.ts to see what drops out
    const pipeline = [
        { $match: { ativo: true } },
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
        { $count: 'count' }
    ];

    const aggResult = await db.collection('dealervehicleprices').aggregate(pipeline).toArray();
    console.log(`Aggregation Count (like API route): ${aggResult[0]?.count || 0}`);

    process.exit(0);
}

main().catch(console.error);
