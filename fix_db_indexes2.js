const mongoose = require('mongoose');

async function fix() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/zerokm');
  const collection = mongoose.connection.collection('vehiclevariations');
  
  await collection.createIndex({
    marca: 1,
    modelo: 1,
    anoFabricacao: 1,
    anoModelo: 1,
    combustivel: 1,
    cor: 1,
    transmissao: 1,
    opcionais: 1,
  }, {
    unique: true,
    partialFilterExpression: { ativo: true },
  });
  
  console.log("New index created.");
  process.exit(0);
}

fix().catch(console.error);
