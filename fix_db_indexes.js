const mongoose = require('mongoose');

async function fix() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/zerokm');
  const collection = mongoose.connection.collection('vehiclevariations');
  
  const indexes = await collection.indexes();
  console.log("Current indexes:", indexes.map(i => i.name));
  
  for (const index of indexes) {
    if (index.name !== '_id_' && !index.name.includes('text') && !index.name.includes('anoFabricacao')) {
        // Drop the old unique index on variations that doesn't include anoFabricacao
        if (index.key && index.key.marca && index.key.modelo && index.key.anoModelo && index.key.combustivel && !index.key.anoFabricacao) {
            console.log("Dropping old index:", index.name);
            await collection.dropIndex(index.name);
        }
    }
  }
  
  // Re-run the index creation from the schema (mongoose does this on model init or we can force it)
  require('./models/VehicleVariation'); // load model
  await mongoose.model('VehicleVariation').syncIndexes();
  
  console.log("Indexes synced.");
  process.exit(0);
}

fix().catch(console.error);
