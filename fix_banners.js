const mongoose = require('mongoose');

async function fix() {
  require('dotenv').config({ path: '.env.local' });
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.useDb('zerokm');
  
  // 1. Update config
  const configCollection = db.collection('configs');
  const bannerConfig = await configCollection.findOne({ key: 'banners' });
  if (bannerConfig) {
    await configCollection.updateOne({ key: 'banners' }, { $set: { duration_days: 1 } });
    console.log("Config 'duration_days' updated to 1.");
  } else {
    console.log("Config 'banners' not found, skipping.");
  }
  
  // 2. Update all active banners
  const collection = db.collection('banners');
  
  const now = Date.now();
  const plus24h = new Date(now + 24 * 60 * 60 * 1000);
  
  const result = await collection.updateMany(
    { isActive: true },
    { $set: { expiresAt: plus24h } }
  );
  
  console.log(`Updated ${result.modifiedCount} active banners to expire in 24h.`);
  
  process.exit(0);
}

fix().catch(console.error);
