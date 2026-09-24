import mongoose from 'mongoose';

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections growing exponentially
 * during API Route usage.
 */
let cached = (global as any).mongoose;

if (!cached) {
    cached = (global as any).mongoose = { conn: null, promise: null };
}

// A URI é lida no PRIMEIRO uso, nunca no momento do import — mesma razão do
// `lib/firebase-admin.ts`. O `next build` importa cada rota só para coletar os
// dados dela, sem chamar nada: um `throw` no corpo do módulo derruba o build
// inteiro por uma variável que só faz falta em runtime, e a mensagem que sobra
// no log aponta uma rota qualquer — a primeira coletada — em vez da causa.
async function dbConnect() {
    if (cached.conn) {
        return cached.conn;
    }

    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI) {
        throw new Error(
            'Please define the MONGODB_URI environment variable inside .env.local'
        );
    }

    if (!cached.promise) {
        const opts = {
            bufferCommands: false,
            serverSelectionTimeoutMS: 5000,
        };

        cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
            return mongoose;
        });
    }

    try {
        cached.conn = await cached.promise;
    } catch (e) {
        cached.promise = null;
        throw e;
    }

    return cached.conn;
}

export default dbConnect;
