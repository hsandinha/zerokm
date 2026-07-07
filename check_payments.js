const mongoose = require('mongoose');

async function run() {
  require('dotenv').config({ path: '.env.local' });
  await mongoose.connect(process.env.MONGODB_URI);
  
  const Payment = require('./models/Payment').default;
  const User = require('./models/User').default;
  
  const recentPayments = await Payment.find().sort({ createdAt: -1 }).limit(5);
  console.log("Recent Payments:");
  for (let p of recentPayments) {
    console.log(`- ID: ${p._id}, mpPaymentId: ${p.mpPaymentId}, extRef: ${p.externalReference}, status: ${p.status}, amount: ${p.amount}`);
  }
  
  process.exit(0);
}

run().catch(console.error);
