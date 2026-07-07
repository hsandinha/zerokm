import mongoose from 'mongoose';
import connectDB from './lib/mongodb';
import VehicleVariation from './models/VehicleVariation';

async function main() {
  await connectDB();
  const variations = await VehicleVariation.find({ ano: '25/26' }).limit(5);
  console.log(variations.map(v => ({
    modelo: v.modelo,
    anoFabricacao: v.anoFabricacao,
    anoModelo: v.anoModelo
  })));
  process.exit(0);
}
main();
