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
        console.log("Connected, fetching concessionarias...");
        const conc = await db.collection('concessionarias').find({}).limit(5).toArray();
        for (let c of conc) {
           console.log(c.nome, "Operador field:", c.operador, "OperatorId:", c.operatorId, "Responsavel:", c.nomeResponsavel);
        }
        await client.close();
        console.log("Done");
    } catch(err) {
        console.error("ERROR:", err);
    }
}
run();
