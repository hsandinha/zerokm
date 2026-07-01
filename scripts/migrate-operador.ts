import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
import mongoose from 'mongoose';
import VehicleVariation from '../models/VehicleVariation';
import DealerVehiclePrice from '../models/DealerVehiclePrice';
import Concessionaria from '../models/Concessionaria';

// Utility to normalize string (from original script)
const normalizeStr = (str: any) => {
    if (!str || typeof str !== 'string') return '';
    return str.trim();
};

const escapeRegex = (string: string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

async function main() {
    await mongoose.connect(process.env.MONGODB_URI as string);
    const db = mongoose.connection.db;
    if (!db) throw new Error("No db");

    console.log("Fetching legacy vehicles with operator...");
    
    // We only need vehicles that have an operator
    const legacyVehicles = await db.collection('vehicles_legacy_backup').find({
        operador: { $exists: true, $ne: "" },
        ativo: { $ne: false } // ensure we look at active ones or whatever logic was used
    }).toArray();

    console.log(`Found ${legacyVehicles.length} legacy vehicles with an operator.`);

    let updated = 0;
    let notFound = 0;

    for (const v of legacyVehicles) {
        const operador = normalizeStr(v.operador);
        if (!operador) continue;

        const concNome = normalizeStr(v.concessionaria);
        if (!concNome) continue;

        // 1. Get Concessionaria
        const conc = await Concessionaria.findOne({ nome: new RegExp(`^${escapeRegex(concNome)}$`, 'i') }).lean();
        if (!conc) continue;

        // 2. Get Variation (same logic as before)
        const modelo = normalizeStr(v.modelo);
        const matchQuery: any = {
            modelo: { $regex: `^${escapeRegex(modelo)}$`, $options: 'i' },
            ativo: true,
        };

        const combustivel = normalizeStr(v.combustivel) || undefined;
        if (combustivel) matchQuery.combustivel = { $regex: `^${escapeRegex(combustivel)}$`, $options: 'i' };
        
        const cor = normalizeStr(v.cor) || undefined;
        if (cor) matchQuery.cor = { $regex: `^${escapeRegex(cor)}$`, $options: 'i' };
        
        const transmissao = normalizeStr(v.transmissao) || undefined;
        if (transmissao) matchQuery.transmissao = { $regex: `^${escapeRegex(transmissao)}$`, $options: 'i' };
        
        const opcionais = normalizeStr(v.opcionais) || undefined;
        if (opcionais) matchQuery.opcionais = { $regex: `^${escapeRegex(opcionais)}$`, $options: 'i' };

        // year logic
        const anoStr = normalizeStr(v.ano || v.anoModelo || '');
        if (anoStr) {
            const parts = anoStr.split('/');
            let anoModeloStr = parts.length > 1 ? parts[1].trim() : parts[0].trim();
            if (anoModeloStr.length === 2) anoModeloStr = '20' + anoModeloStr;
            if (anoModeloStr) matchQuery.anoModelo = parseInt(anoModeloStr, 10);
        } else {
            matchQuery.anoModelo = { $in: [null, undefined] };
        }

        const variation = await VehicleVariation.findOne(matchQuery).lean();
        if (!variation) continue;

        // 3. Update DealerVehiclePrice
        const result = await DealerVehiclePrice.updateOne(
            { variationId: variation._id, concessionariaId: conc._id, operador: { $exists: false } },
            { $set: { operador } }
        );

        if (result.modifiedCount > 0) {
            updated++;
        }
    }

    console.log(`Updated ${updated} DealerVehiclePrices with an operator.`);
    process.exit(0);
}

main().catch(console.error);
