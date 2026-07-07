const mongoose = require('mongoose');

async function fix() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/zerokm');
  const collection = mongoose.connection.collection('vehiclevariations');
  
  try {
    await collection.dropIndex('marca_1_modelo_1_anoModelo_1_combustivel_1_cor_1_transmissao_1_opcionais_1');
    console.log("Old index dropped.");
  } catch (err) {
    console.error("Error dropping old index:", err.message);
  }
  
  process.exit(0);
}

fix().catch(console.error);
