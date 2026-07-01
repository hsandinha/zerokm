/**
 * Exporta veículos que NÃO serão migrados para CSV.
 *
 * Uso:
 *   npx tsx scripts/export-unmigrated-vehicles.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import mongoose from 'mongoose';
import fs from 'fs';
import Vehicle from '../models/Vehicle';
import Concessionaria from '../models/Concessionaria';

function normalizeStr(value: any): string {
    return typeof value === 'string' ? value.trim() : '';
}

function escapeCsv(value: any): string {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

async function main() {
    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI) {
        console.error('❌ MONGODB_URI não definida.');
        process.exit(1);
    }

    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado ao MongoDB');

    // Build concessionaria map
    const allConc = await Concessionaria.find({}).lean();
    const concMap = new Set(allConc.map((c: any) => normalizeStr(c.nome).toUpperCase()));

    const allVehicles = await Vehicle.find({}).lean();

    const semMarca: any[] = [];
    const concNaoEncontrada: any[] = [];

    for (const v of allVehicles) {
        const vv = v as any;
        const marca = normalizeStr(vv.marca);
        const concNome = normalizeStr(vv.concessionaria);

        if (!marca) {
            semMarca.push(vv);
            continue;
        }

        if (concNome && !concMap.has(concNome.toUpperCase())) {
            concNaoEncontrada.push(vv);
        }
    }

    // --- Export Sem Marca ---
    let csvSemMarca = 'ID,Modelo,Ano,Concessionaria,Preco,Combustivel,Cor\n';
    for (const v of semMarca) {
        csvSemMarca += `${v._id.toString()},${escapeCsv(v.modelo)},${escapeCsv(v.ano || v.anoModelo)},${escapeCsv(v.concessionaria)},${v.preco || 0},${escapeCsv(v.combustivel)},${escapeCsv(v.cor)}\n`;
    }
    fs.writeFileSync('veiculos_sem_marca.csv', csvSemMarca, 'utf8');
    console.log(`✅ Salvo: veiculos_sem_marca.csv (${semMarca.length} linhas)`);

    // --- Export Concessionaria Nao Encontrada ---
    let csvNaoEncontrada = 'ID,Marca,Modelo,Ano,Concessionaria_Preenchida,Preco\n';
    for (const v of concNaoEncontrada) {
        csvNaoEncontrada += `${v._id.toString()},${escapeCsv(v.marca)},${escapeCsv(v.modelo)},${escapeCsv(v.ano || v.anoModelo)},${escapeCsv(v.concessionaria)},${v.preco || 0}\n`;
    }
    fs.writeFileSync('veiculos_concessionaria_nao_encontrada.csv', csvNaoEncontrada, 'utf8');
    console.log(`✅ Salvo: veiculos_concessionaria_nao_encontrada.csv (${concNaoEncontrada.length} linhas)`);

    await mongoose.disconnect();
}

main().catch(err => {
    console.error('❌ Erro:', err);
    process.exit(1);
});
