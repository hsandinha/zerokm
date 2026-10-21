/**
 * Regrava o texto `ano` das variações a partir de anoFabricacao/anoModelo.
 *
 * Variações antigas guardavam o ano duas vezes e às vezes os dois divergiam
 * (o Argo que aparecia 26/27 no Catálogo e 26/26 no Estoque). As telas já
 * mostram o ano pelos números (lib/utils/anoVeiculo.ts); este script só deixa o
 * dado limpo. Antes de aplicar, rode sem --aplicar e confira a lista: em cada
 * linha o texto antigo é descartado e vale o número.
 *
 * Lê o MONGODB_URI do .env.local (como os outros scripts), ou da variável de ambiente.
 *
 *   node scripts/sincronizar-ano-catalogo.cjs            # só lista
 *   node scripts/sincronizar-ano-catalogo.cjs --aplicar  # grava
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env.local'), quiet: true });
const mongoose = require('mongoose');

const doisDigitos = (ano) => String(ano).slice(-2);
const textoDoAno = (fab, mod) => (fab && mod ? `${doisDigitos(fab)}/${doisDigitos(mod)}` : mod ? String(mod) : '');

async function main() {
    const aplicar = process.argv.includes('--aplicar');
    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI não encontrado. Rode na raiz do projeto, com o .env.local preenchido.');
        process.exit(1);
    }
    await mongoose.connect(process.env.MONGODB_URI);
    const colecao = mongoose.connection.db.collection('vehiclevariations');

    const cursor = colecao.find(
        { ativo: true, anoModelo: { $type: 'number' } },
        { projection: { marca: 1, modelo: 1, cor: 1, ano: 1, anoFabricacao: 1, anoModelo: 1 } }
    );

    const ajustes = [];
    for await (const v of cursor) {
        const certo = textoDoAno(v.anoFabricacao, v.anoModelo);
        if (certo && (v.ano || '').trim() !== certo) {
            ajustes.push({ updateOne: { filter: { _id: v._id }, update: { $set: { ano: certo } } } });
            console.log(`${v.marca} ${v.modelo} ${v.cor || ''}: "${v.ano || ''}" -> "${certo}"`);
        }
    }

    console.log(`\n${ajustes.length} variações com o texto do ano diferente dos números.`);
    if (aplicar && ajustes.length > 0) {
        const resultado = await colecao.bulkWrite(ajustes);
        console.log(`Gravadas: ${resultado.modifiedCount}.`);
    } else if (ajustes.length > 0) {
        console.log('Nada gravado. Rode com --aplicar para corrigir.');
    }

    await mongoose.disconnect();
}

main().catch((erro) => {
    console.error(erro);
    process.exit(1);
});
