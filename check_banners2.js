const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

async function check() {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    const banners = await db.collection('banners').find({}).toArray();
    console.log(JSON.stringify(banners, null, 2));
    process.exit(0);
}
check();
