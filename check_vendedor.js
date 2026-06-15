const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const user = await db.collection('users').findOne({ email: 'hsandinha@zerokm.com.br' }); // assuming email or similar
  console.log('User:', user?.displayName, user?._id);
  if (user) {
    const clients = await db.collection('users').find({ vendedorId: user._id.toString() }).toArray();
    console.log('Clients count (by string ID):', clients.length);
    const clientsObj = await db.collection('users').find({ vendedorId: user._id }).toArray();
    console.log('Clients count (by ObjectId):', clientsObj.length);
    
    // Total users without plan?
    const allNoPlan = await db.collection('users').find({ 'subscription.status': { $nin: ['active'] } }).toArray();
    console.log('Total users without active plan:', allNoPlan.length);
  }
  process.exit(0);
}
check();
