import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
import mongoose from 'mongoose';
import Concessionaria from './models/Concessionaria';
import User from './models/User';
import DealerVehiclePrice from './models/DealerVehiclePrice';

async function main() {
    await mongoose.connect(process.env.MONGODB_URI as string);
    const conc = await Concessionaria.findOne({ nome: /RENAULT ROMA - ALDAIR/i }).lean();
    console.log("Concessionaria:", conc);
    
    if (conc?.operadorId) {
        const user = await User.findById(conc.operadorId).lean();
        console.log("User bound to it:", user?.displayName);
    }

    const price = await DealerVehiclePrice.findOne({ concessionariaId: conc?._id }).lean();
    console.log("One price record:", price);
    
    process.exit(0);
}
main().catch(console.error);
