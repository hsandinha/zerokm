/**
 * Remove do banco as coleções das antigas tabelas manuais de Modelos e Cores.
 * A aba Tabelas saiu do sistema: modelos e cores agora vêm do catálogo
 * (padronizado pela FIPE). A coleção de Marcas NÃO é removida: o catálogo,
 * as concessionárias e o cadastro dependem dela.
 *
 * Uso (na raiz do projeto, com o .env.local apontando para o banco):
 *   node scripts/remover-tabelas-legadas.cjs              -> só mostra o que seria removido
 *   node scripts/remover-tabelas-legadas.cjs --confirmar  -> faz backup em JSON e remove
 *
 * O backup fica em backups/tabelas-legadas-AAAA-MM-DD/ (fora do git).
 */
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

// .env.local tem FIREBASE_PRIVATE_KEY multilinha; parser só das linhas simples
function loadEnv() {
    const file = path.resolve(process.cwd(), '.env.local');
    if (!fs.existsSync(file)) return;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
}

// "Cor" vira "cors" na pluralização do Mongoose; "cores" entra por garantia.
const COLECOES = ['modelos', 'cors', 'cores'];
const kb = bytes => `${Math.round(bytes / 1024).toLocaleString('pt-BR')} KB`;

async function main() {
    loadEnv();
    const confirmar = process.argv.includes('--confirmar');
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI não encontrado no .env.local');

    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const db = client.db();
    try {
        const existentes = new Set((await db.listCollections().toArray()).map(c => c.name));
        const alvos = COLECOES.filter(nome => existentes.has(nome));
        if (!alvos.length) {
            console.log('Nada a remover: as coleções de Modelos e Cores não existem neste banco.');
            return;
        }

        console.log(`Banco: ${db.databaseName}\n`);
        let total = 0;
        for (const nome of alvos) {
            const st = await db.command({ collStats: nome });
            total += st.storageSize + st.totalIndexSize;
            console.log(`- ${nome}: ${st.count.toLocaleString('pt-BR')} documentos, ${kb(st.storageSize)} de dados, ${kb(st.totalIndexSize)} de índices`);
        }

        // Nenhum código grava mais modeloId em veículos; só conferência.
        if (existentes.has('vehicles')) {
            const comModeloId = await db.collection('vehicles').countDocuments({ modeloId: { $exists: true, $ne: null } });
            console.log(`\nVeículos com modeloId apontando para a tabela antiga: ${comModeloId} (o campo não é mais lido pelo sistema).`);
        }
        console.log(`\nEspaço a liberar: cerca de ${kb(total)}.`);

        if (!confirmar) {
            console.log('\nSimulação: nada foi removido. Rode de novo com --confirmar para fazer backup e remover.');
            return;
        }

        const pasta = path.resolve(process.cwd(), 'backups', `tabelas-legadas-${new Date().toISOString().slice(0, 10)}`);
        fs.mkdirSync(pasta, { recursive: true });
        for (const nome of alvos) {
            const docs = await db.collection(nome).find({}).toArray();
            const arquivo = path.join(pasta, `${nome}.json`);
            fs.writeFileSync(arquivo, JSON.stringify(docs, null, 2));
            console.log(`Backup: ${docs.length} documentos em ${path.relative(process.cwd(), arquivo)}`);
        }
        for (const nome of alvos) {
            await db.collection(nome).drop();
            console.log(`Removida: ${nome}`);
        }
        console.log('\nConcluído.');
    } finally {
        await client.close();
    }
}

main().catch(err => {
    console.error('Erro:', err.message);
    process.exit(1);
});
