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
        console.log("Connected, fetching users...");
        const users = await db.collection('users').find({ "allowedProfiles": "cliente" }).limit(5).toArray();
        console.log("Found", users.length, "users.");
        for (let u of users) {
           console.log(u.email, "Operador field:", u.operador, "OperatorId:", u.operatorId, "Dealership:", u.dealershipId);
        }
        await client.close();
        console.log("Done");
    } catch(err) {
        console.error("ERROR:", err);
    }
}
run();
