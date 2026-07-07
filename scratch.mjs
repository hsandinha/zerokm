import mongoose from 'mongoose';
import connectDB from './lib/mongodb.ts';
import VehicleVariation from './models/VehicleVariation.ts';

async function main() {
  await connectDB();
  const variations = await VehicleVariation.find({ ano: '25/26', modelo: { $regex: 'SCUDO' } }).limit(5);
  console.log(variations);
  process.exit(0);
}
main();
