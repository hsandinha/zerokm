const mongoose = require('mongoose');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/zerokm');
  const collection = mongoose.connection.collection('vehiclevariations');
  
  const indexes = await collection.indexes();
  console.log("Current indexes:");
  indexes.forEach(idx => {
    console.log(idx.name, idx.key);
  });
  
  process.exit(0);
}

check().catch(console.error);
