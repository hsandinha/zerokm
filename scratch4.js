const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '.env.local' });

async function run() {
    console.log("Starting script...");
    try {
        const uri = process.env.MONGODB_URI;
        if (!uri) throw new Error("No Mongo URI");
        const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
        console.log("Connecting...");
        await client.connect();
        const db = client.db();
        
        let u1 = await db.collection('users').findOne({ operador: { $exists: true } });
        let u2 = await db.collection('users').findOne({ operator: { $exists: true } });
        let u3 = await db.collection('users').findOne({ operatorId: { $exists: true } });
        
        console.log("Has operador?", u1 ? u1.email : "No");
        console.log("Has operator?", u2 ? u2.email : "No");
        console.log("Has operatorId?", u3 ? u3.email : "No");

        await client.close();
        console.log("Done");
    } catch(err) {
        console.error("ERROR:", err);
    }
}
run();
