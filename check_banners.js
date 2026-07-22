// Quick diagnostic script to check banners in the database
require('dotenv').config({ path: '.env.local' });
const mongoose = require('mongoose');

async function checkBanners() {
    console.log('Connecting to MongoDB...');
    console.log('URI:', process.env.MONGODB_URI?.replace(/\/\/.*@/, '//<redacted>@'));
    
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected! Database:', mongoose.connection.db.databaseName);
    
    // Check via default connection (same as Banner model)
    const defaultBanners = await mongoose.connection.collection('banners').find({}).toArray();
    console.log(`\n=== Default connection - banners collection ===`);
    console.log(`Total banners: ${defaultBanners.length}`);
    defaultBanners.forEach(b => {
        console.log(`  - [${b.status || 'no-status'}] ${b.title} | active=${b.isActive} | expiresAt=${b.expiresAt}`);
    });
    
    // Check via useDb('zerokm') (same as fix_banners.js)
    const db = mongoose.connection.useDb('zerokm');
    const zerokBanners = await db.collection('banners').find({}).toArray();
    console.log(`\n=== useDb('zerokm') - banners collection ===`);
    console.log(`Total banners: ${zerokBanners.length}`);
    zerokBanners.forEach(b => {
        console.log(`  - [${b.status || 'no-status'}] ${b.title} | active=${b.isActive} | expiresAt=${b.expiresAt}`);
    });
    
    // List all collections in the default database
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`\n=== Collections in default db ===`);
    collections.forEach(c => console.log(`  - ${c.name}`));
    
    // List all collections in zerokm database
    const zkCollections = await db.db.listCollections().toArray();
    console.log(`\n=== Collections in 'zerokm' db ===`);
    zkCollections.forEach(c => console.log(`  - ${c.name}`));
    
    process.exit(0);
}

checkBanners().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
