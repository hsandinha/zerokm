/**
 * Reclassifica motos que estão no catálogo como 'carro'.
 *
 * Contexto: até set/2026 100% das 29,5 mil variações eram tipoVeiculo 'carro',
 * incluindo HONDA MOTOS, YAMAHA, HAOJUE etc. Os operadores já separam a marca
 * ("HONDA MOTOS" ≠ "HONDA"), então a marca é a fonte de verdade — exceto SUZUKI,
 * que vende carro (e Vitara) e moto (GSX, V-Strom, Hayabusa) sob a mesma marca.
 *
 * O que faz:
 *   1. Marca.tipoVeiculo = 'moto' para as marcas 100% moto.
 *   2. VehicleVariation.tipoVeiculo = 'moto' para todas as variações dessas marcas.
 *   3. SUZUKI: só variações cujo modelo bate com a lista de linhas de moto.
 *   4. cilindrada extraída do nome do modelo quando evidente (CG160 → 160).
 *
 * Uso:
 *   node scripts/reclassify-motos.cjs            # dry-run (padrão)
 *   node scripts/reclassify-motos.cjs --write    # grava
 *   node scripts/reclassify-motos.cjs --revert   # volta para 'carro' o que este script marcou
 *
 * É idempotente. --revert desfaz por marca + regex, não por histórico.
 */
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

// .env.local tem FIREBASE_PRIVATE_KEY multilinha; parser ingênuo só das linhas simples
function loadEnv() {
    const file = path.resolve(process.cwd(), '.env.local');
    if (!fs.existsSync(file)) return;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
}

// Marcas cujo catálogo inteiro é moto. Nome exato como está no banco.
const MARCAS_MOTO = ['HONDA MOTOS', 'YAMAHA', 'HAOJUE', 'ZONTES', 'KYMCO', 'SHINERAY', 'WATTS'];

// Marcas mistas: só o modelo decide.
const MARCAS_MISTAS = {
    SUZUKI: /\b(GSX|GSX-?[RS]|V-?STROM|HAYABUSA|BURGMAN|INTRUDER|BOULEVARD|GIXXER|DL ?\d{3}|DR ?\d{3}|RM-?Z?\d{3}|SV ?650|BANDIT|KATANA)\b/i,
};

// Primeiro número entre 50 e 2500 no nome do modelo. Aceita colado ao nome (CG160) ou separado (RIDE 150).
function extrairCilindrada(modelo) {
    const m = String(modelo || '').match(/(?:^|[^\d])(\d{2,4})(?:[^\d]|$)/g);
    if (!m) return null;
    for (const raw of m) {
        const n = parseInt(raw.replace(/\D/g, ''), 10);
        if (n >= 50 && n <= 2500) return n;
    }
    return null;
}

async function main() {
    loadEnv();
    const write = process.argv.includes('--write');
    const revert = process.argv.includes('--revert');
    const mode = revert ? 'REVERT' : write ? 'WRITE' : 'DRY-RUN';
    console.log(`Modo: ${mode}\n`);

    const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    await client.connect();
    const db = client.db();
    const marcas = db.collection('marcas');
    const variations = db.collection('vehiclevariations');

    const alvoTipo = revert ? 'carro' : 'moto';
    const plano = [];

    // 1) marcas 100% moto
    for (const nome of MARCAS_MOTO) {
        const marca = await marcas.findOne({ nome });
        const filtro = { marca: nome };
        const total = await variations.countDocuments(filtro);
        const jaOk = await variations.countDocuments({ ...filtro, tipoVeiculo: alvoTipo });
        plano.push({ marca: nome, existeMarca: !!marca, filtro, total, aMudar: total - jaOk, atualizarMarca: true });
    }

    // 2) marcas mistas
    for (const [nome, regex] of Object.entries(MARCAS_MISTAS)) {
        const filtro = { marca: nome, modelo: { $regex: regex.source, $options: 'i' } };
        const total = await variations.countDocuments(filtro);
        const jaOk = await variations.countDocuments({ ...filtro, tipoVeiculo: alvoTipo });
        const amostra = await variations.distinct('modelo', filtro);
        plano.push({ marca: `${nome} (mista)`, filtro, total, aMudar: total - jaOk, atualizarMarca: false, amostra });
    }

    console.log('Plano:');
    for (const p of plano) {
        const flag = p.existeMarca === false ? '  (marca não existe na collection marcas)' : '';
        console.log(`  ${p.marca.padEnd(22)} variações: ${String(p.total).padStart(4)}  a mudar → '${alvoTipo}': ${String(p.aMudar).padStart(4)}${flag}`);
        if (p.amostra) console.log(`      modelos: ${p.amostra.join(' | ')}`);
    }

    // cilindrada: só no sentido moto
    let cilPreview = [];
    if (!revert) {
        const orFilters = plano.map(p => p.filtro);
        const docs = await variations.find({ $or: orFilters, cilindrada: { $in: [null] } }, { projection: { modelo: 1 } }).toArray();
        cilPreview = docs.map(d => ({ _id: d._id, modelo: d.modelo, cc: extrairCilindrada(d.modelo) })).filter(d => d.cc);
        const semCc = docs.length - cilPreview.length;
        console.log(`\nCilindrada extraível do nome: ${cilPreview.length} de ${docs.length} (${semCc} ficam sem)`);
        const exemplos = [...new Map(cilPreview.map(d => [d.modelo, d.cc])).entries()].slice(0, 12);
        for (const [modelo, cc] of exemplos) console.log(`    ${String(cc).padStart(4)}cc  ${modelo}`);
    }

    const totalMudancas = plano.reduce((acc, p) => acc + p.aMudar, 0);
    if (!write && !revert) {
        console.log(`\nDRY-RUN: ${totalMudancas} variações mudariam. Rode com --write para aplicar.`);
        await client.close();
        return;
    }

    let mudadas = 0;
    for (const p of plano) {
        const r = await variations.updateMany(p.filtro, { $set: { tipoVeiculo: alvoTipo } });
        mudadas += r.modifiedCount;
        if (p.atualizarMarca) {
            await marcas.updateOne({ nome: p.marca }, { $set: { tipoVeiculo: alvoTipo } });
        }
    }
    let cilSet = 0;
    if (!revert) {
        for (const d of cilPreview) {
            const r = await variations.updateOne({ _id: d._id }, { $set: { cilindrada: d.cc } });
            cilSet += r.modifiedCount;
        }
    } else {
        const r = await variations.updateMany({ $or: plano.map(p => p.filtro) }, { $unset: { cilindrada: '' } });
        cilSet = r.modifiedCount;
    }
    console.log(`\n${mode}: ${mudadas} variações → '${alvoTipo}', ${plano.filter(p => p.atualizarMarca).length} marcas atualizadas, cilindrada ${revert ? 'removida' : 'gravada'} em ${cilSet}.`);
    await client.close();
}

main().catch(err => { console.error(err); process.exit(1); });
