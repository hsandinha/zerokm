/**
 * Backup da tabela Vehicle (legada) para vehicle_legacy_backup
 *
 * Uso:
 *   npx tsx scripts/backup-vehicle-table.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import mongoose from 'mongoose';

async function main() {
    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI) {
        console.error('❌ MONGODB_URI não definida.');
        process.exit(1);
    }

    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado ao MongoDB');

    const db = mongoose.connection.db;
    if (!db) {
        throw new Error('Database connection not established');
    }

    console.log('📦 Iniciando cópia de "vehicles" para "vehicles_legacy_backup"...');

    // Apaga o backup anterior se existir
    const collections = await db.listCollections({ name: 'vehicles_legacy_backup' }).toArray();
    if (collections.length > 0) {
        console.log('   Apagando backup antigo...');
        await db.dropCollection('vehicles_legacy_backup');
    }

    // Usando agregação com $out para copiar a coleção de forma eficiente no MongoDB
    const result = await db.collection('vehicles').aggregate([
        { $match: {} },
        { $out: 'vehicles_legacy_backup' }
    ]).toArray();

    const count = await db.collection('vehicles_legacy_backup').countDocuments();
    
    console.log(`✅ Backup concluído! ${count} documentos copiados para 'vehicles_legacy_backup'.`);

    await mongoose.disconnect();
}

main().catch(err => {
    console.error('❌ Erro:', err);
    process.exit(1);
});
