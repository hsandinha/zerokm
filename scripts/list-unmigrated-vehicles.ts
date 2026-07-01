/**
 * Lista veículos que NÃO serão migrados e por quê.
 *
 * Uso:
 *   npx tsx scripts/list-unmigrated-vehicles.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import mongoose from 'mongoose';
import Vehicle from '../models/Vehicle';
import Concessionaria from '../models/Concessionaria';

function normalizeStr(value: any): string {
    return typeof value === 'string' ? value.trim() : '';
}

async function main() {
    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI) {
        console.error('❌ MONGODB_URI não definida.');
        process.exit(1);
    }

    await mongoose.connect(MONGODB_URI);

    // Build concessionaria map
    const allConc = await Concessionaria.find({}).lean();
    const concMap = new Set(allConc.map((c: any) => normalizeStr(c.nome).toUpperCase()));

    const allVehicles = await Vehicle.find({}).lean();

    // --- Sem marca ---
    const semMarca: any[] = [];
    // --- Sem concessionária ---
    const semConc: any[] = [];
    // --- Concessionária não encontrada ---
    const concNaoEncontrada = new Map<string, any[]>();

    for (const v of allVehicles) {
        const vv = v as any;
        const marca = normalizeStr(vv.marca);
        const concNome = normalizeStr(vv.concessionaria);

        if (!marca) {
            semMarca.push(vv);
            continue;
        }

        if (!concNome) {
            semConc.push(vv);
            continue;
        }

        if (!concMap.has(concNome.toUpperCase())) {
            if (!concNaoEncontrada.has(concNome)) concNaoEncontrada.set(concNome, []);
            concNaoEncontrada.get(concNome)!.push(vv);
        }
    }

    // --- Print ---
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`📋 VEÍCULOS SEM MARCA (${semMarca.length})`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Group by modelo
    const byModelo = new Map<string, number>();
    for (const v of semMarca) {
        const modelo = normalizeStr(v.modelo) || '(sem modelo)';
        byModelo.set(modelo, (byModelo.get(modelo) || 0) + 1);
    }
    const sortedModelos = [...byModelo.entries()].sort((a, b) => b[1] - a[1]);
    console.log('  Modelo                                    | Qtd  | Concessionária (exemplo)');
    console.log('  ------------------------------------------|------|-------------------------');
    for (const [modelo, count] of sortedModelos) {
        const example = semMarca.find((v: any) => normalizeStr(v.modelo) === modelo);
        const conc = normalizeStr(example?.concessionaria) || '—';
        console.log(`  ${modelo.padEnd(43)}| ${String(count).padEnd(5)}| ${conc}`);
    }

    console.log(`\n═══════════════════════════════════════════════════════════════`);
    console.log(`📋 VEÍCULOS SEM CONCESSIONÁRIA (campo vazio) (${semConc.length})`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    const byConcMarca = new Map<string, number>();
    for (const v of semConc) {
        const key = `${normalizeStr(v.marca) || '?'} - ${normalizeStr(v.modelo) || '?'}`;
        byConcMarca.set(key, (byConcMarca.get(key) || 0) + 1);
    }
    const sortedConcMarca = [...byConcMarca.entries()].sort((a, b) => b[1] - a[1]);
    console.log('  Marca - Modelo                            | Qtd');
    console.log('  ------------------------------------------|-----');
    for (const [key, count] of sortedConcMarca.slice(0, 30)) {
        console.log(`  ${key.padEnd(43)}| ${count}`);
    }
    if (sortedConcMarca.length > 30) console.log(`  ... e mais ${sortedConcMarca.length - 30} combinações`);

    console.log(`\n═══════════════════════════════════════════════════════════════`);
    console.log(`📋 CONCESSIONÁRIAS NÃO ENCONTRADAS (${concNaoEncontrada.size})`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log('  Nome no Vehicle                           | Veículos');
    console.log('  ------------------------------------------|----------');
    const sortedConc = [...concNaoEncontrada.entries()].sort((a, b) => b[1].length - a[1].length);
    for (const [nome, vehicles] of sortedConc) {
        console.log(`  ${nome.padEnd(43)}| ${vehicles.length}`);
    }

    console.log('\n═══════════════════════════════════════════════════════════════\n');

    await mongoose.disconnect();
}

main().catch(err => {
    console.error('❌ Erro:', err);
    process.exit(1);
});
