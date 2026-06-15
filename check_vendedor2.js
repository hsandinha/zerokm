const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const vendedores = await db.collection('users').find({ allowedProfiles: 'vendedor' }).toArray();
  console.log('Vendedores:', vendedores.map(v => ({ id: v._id, email: v.email, name: v.displayName })));
  
  for (const v of vendedores) {
    const clients = await db.collection('users').find({ vendedorId: v._id.toString() }).toArray();
    console.log(`Vendedor ${v.email} clients count:`, clients.length);
  }
  process.exit(0);
}
check();
