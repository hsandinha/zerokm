import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const VehicleSchema = new mongoose.Schema({
    modelo: String,
    ano: String,
    cor: String,
    combustivel: String,
    transmissao: String,
    opcionais: String,
    status: String,
    updatedAt: Date
}, { collection: 'vehicles' });

const VehicleVariationSchema = new mongoose.Schema({
    modelo: String,
    anoModelo: Number,
    cor: String,
    combustivel: String,
    transmissao: String,
    opcionais: String,
    status: String
}, { collection: 'vehiclevariations' });

const Vehicle = mongoose.models.Vehicle || mongoose.model('Vehicle', VehicleSchema);
const VehicleVariation = mongoose.models.VehicleVariation || mongoose.model('VehicleVariation', VehicleVariationSchema);

async function run() {
    console.log('Conectando ao MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('Conectado!');

    const variations = await VehicleVariation.find({});
    console.log(`Verificando ${variations.length} variações...`);

    let updatedCount = 0;

    for (const variation of variations) {
        const query: any = {
            modelo: new RegExp(`^${variation.modelo}$`, 'i'),
        };

        if (variation.cor) query.cor = new RegExp(`^${variation.cor}$`, 'i');
        if (variation.combustivel) query.combustivel = new RegExp(`^${variation.combustivel}$`, 'i');
        if (variation.transmissao) query.transmissao = new RegExp(`^${variation.transmissao}$`, 'i');
        
        if (variation.anoModelo) {
            const shortYear = variation.anoModelo.toString().slice(-2);
            query.ano = new RegExp(`${shortYear}$`, 'i');
        }

        const oldVehicles = await Vehicle.find(query).sort({ updatedAt: -1 }).limit(1);
        const match = oldVehicles[0];

        // Se encontrou o veículo antigo e ele tem um status
        if (match && match.status) {
            if (variation.status !== match.status) {
                variation.status = match.status;
                await variation.save();
                updatedCount++;
            }
        } else {
            // Se não encontrou, e o status é undefined ou nulo, define o default 'A faturar' para garantir.
            if (!variation.status) {
                variation.status = 'A faturar';
                await variation.save();
                updatedCount++;
            }
        }
    }

    console.log(`Finalizado. ${updatedCount} variações atualizadas.`);
    await mongoose.disconnect();
}

run().catch(console.error);
