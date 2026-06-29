/**
 * Script de migração: Atualiza o índice único de VehicleVariation
 * para incluir o campo 'opcionais'.
 *
 * O índice antigo (marca, modelo, anoModelo, combustivel, cor, transmissao)
 * impedia a criação de variações que diferissem apenas nos opcionais.
 *
 * Uso: npx ts-node scripts/migrate-variation-unique-index.ts
 * Ou:  npx tsx scripts/migrate-variation-unique-index.ts
 *
 * Requer a variável de ambiente MONGODB_URI configurada (.env).
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI não está definida no .env');
    process.exit(1);
}

async function migrate() {
    console.log('🔌 Conectando ao MongoDB...');
    await mongoose.connect(MONGODB_URI as string);

    const db = mongoose.connection.db;
    if (!db) {
        console.error('❌ Falha na conexão com o banco de dados');
        process.exit(1);
    }

    const collection = db.collection('vehiclevariations');

    // Listar índices atuais
    const indexes = await collection.indexes();
    console.log('\n📋 Índices atuais:');
    indexes.forEach((index: any) => {
        console.log(`   - ${index.name}: ${JSON.stringify(index.key)}${index.unique ? ' (unique)' : ''}`);
    });

    // Procurar o índice antigo que NÃO inclui opcionais
    const oldIndex = indexes.find((index: any) => {
        const keys = Object.keys(index.key);
        return (
            index.unique &&
            keys.includes('marca') &&
            keys.includes('modelo') &&
            keys.includes('anoModelo') &&
            keys.includes('combustivel') &&
            keys.includes('cor') &&
            keys.includes('transmissao') &&
            !keys.includes('opcionais')
        );
    });

    if (oldIndex) {
        console.log(`\n🗑️  Removendo índice antigo: ${oldIndex.name}`);
        await collection.dropIndex(oldIndex.name!);
        console.log('✅ Índice antigo removido com sucesso!');
    } else {
        console.log('\nℹ️  Índice antigo não encontrado (já pode ter sido removido).');
    }

    // Verificar se o novo índice (com opcionais) já existe
    const updatedIndexes = await collection.indexes();
    const newIndex = updatedIndexes.find((index: any) => {
        const keys = Object.keys(index.key);
        return (
            index.unique &&
            keys.includes('marca') &&
            keys.includes('modelo') &&
            keys.includes('anoModelo') &&
            keys.includes('combustivel') &&
            keys.includes('cor') &&
            keys.includes('transmissao') &&
            keys.includes('opcionais')
        );
    });

    if (!newIndex) {
        console.log('\n🔧 Criando novo índice com opcionais...');
        await collection.createIndex(
            {
                marca: 1,
                modelo: 1,
                anoModelo: 1,
                combustivel: 1,
                cor: 1,
                transmissao: 1,
                opcionais: 1,
            },
            {
                unique: true,
                partialFilterExpression: { ativo: true },
            }
        );
        console.log('✅ Novo índice criado com sucesso!');
    } else {
        console.log(`\n✅ Novo índice já existe: ${newIndex.name}`);
    }

    // Listar índices finais
    const finalIndexes = await collection.indexes();
    console.log('\n📋 Índices finais:');
    finalIndexes.forEach((index: any) => {
        console.log(`   - ${index.name}: ${JSON.stringify(index.key)}${index.unique ? ' (unique)' : ''}`);
    });

    await mongoose.disconnect();
    console.log('\n🏁 Migração concluída!');
}

migrate().catch((error) => {
    console.error('❌ Erro na migração:', error);
    process.exit(1);
});
