/**
 * Migração: Vehicle → VehicleVariation + DealerVehiclePrice
 *
 * Para cada Vehicle existente:
 *   1. Resolve a concessionariaId pelo nome
 *   2. Busca ou cria a VehicleVariation correspondente no catálogo
 *   3. Cria um DealerVehiclePrice vinculando variação + concessionária + preço
 *
 * Uso:
 *   npx tsx scripts/migrate-vehicles-to-catalog.ts --dry-run   # simula sem salvar
 *   npx tsx scripts/migrate-vehicles-to-catalog.ts              # executa de verdade
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import mongoose from 'mongoose';
import Vehicle from '../models/Vehicle';
import VehicleVariation from '../models/VehicleVariation';
import DealerVehiclePrice from '../models/DealerVehiclePrice';
import Concessionaria from '../models/Concessionaria';
import Marca from '../models/Marca';

const DRY_RUN = process.argv.includes('--dry-run');

// --- Helpers ---

function normalizeStr(value: any): string {
    return typeof value === 'string' ? value.trim() : '';
}

function escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseYear(value: string): number | undefined {
    const digits = value.replace(/\D/g, '');
    if (!digits) return undefined;
    const year = digits.length === 2 ? 2000 + Number(digits) : Number(digits.slice(0, 4));
    return Number.isFinite(year) && year >= 1900 && year <= 2100 ? year : undefined;
}

function parseAnoComposto(value: string): { anoFabricacao?: number; anoModelo?: number } {
    const parts = value.split(/[/-]/).map(part => parseYear(part)).filter((year): year is number => Boolean(year));
    if (parts.length >= 2) {
        return { anoFabricacao: parts[0], anoModelo: parts[1] };
    }
    const year = parseYear(value);
    return { anoFabricacao: undefined, anoModelo: year };
}

async function main() {
    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI) {
        console.error('❌ MONGODB_URI não definida. Defina em .env.local ou .env');
        process.exit(1);
    }

    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado ao MongoDB');

    if (DRY_RUN) {
        console.log('🔍 MODO DRY-RUN — nenhuma alteração será salva no banco.\n');
    } else {
        console.log('🚀 MODO EXECUÇÃO — alterações serão salvas no banco.\n');
    }

    // --- Step 1: Build concessionaria name → _id map ---

    console.log('📦 Carregando concessionárias...');
    const allConcessionarias = await Concessionaria.find({}).lean();
    const concessionariaMap = new Map<string, string>();
    for (const c of allConcessionarias) {
        const nome = normalizeStr((c as any).nome).toUpperCase();
        if (nome) {
            concessionariaMap.set(nome, (c as any)._id.toString());
        }
    }
    console.log(`   → ${concessionariaMap.size} concessionárias carregadas.`);

    // --- Step 2: Build marca name → _id map ---

    console.log('📦 Carregando marcas...');
    const allMarcas = await Marca.find({}).lean();
    const marcaMap = new Map<string, string>();
    for (const m of allMarcas) {
        const nome = normalizeStr((m as any).nome).toUpperCase();
        if (nome) {
            marcaMap.set(nome, (m as any)._id.toString());
        }
    }
    console.log(`   → ${marcaMap.size} marcas carregadas.`);

    // --- Step 3: Load all vehicles ---

    console.log('📦 Carregando veículos...');
    const allVehicles = await Vehicle.find({}).lean();
    console.log(`   → ${allVehicles.length} veículos carregados.\n`);

    // --- Step 4: Process each vehicle ---

    const stats = {
        total: allVehicles.length,
        linked: 0,
        variationCreated: 0,
        variationExisted: 0,
        skippedNoConcessionaria: 0,
        skippedNoPrice: 0,
        skippedNoMarca: 0,
        skippedNoModelo: 0,
        skippedPriceExists: 0,
        errors: 0,
    };

    const unmatchedConcessionarias = new Set<string>();

    console.log('🔄 Processando veículos...\n');

    for (let i = 0; i < allVehicles.length; i++) {
        const v = allVehicles[i] as any;
        const vehicleId = v._id.toString();

        // --- Resolve concessionária ---
        const concNome = normalizeStr(v.concessionaria);
        if (!concNome) {
            stats.skippedNoConcessionaria++;
            continue;
        }

        const concessionariaId = concessionariaMap.get(concNome.toUpperCase());
        if (!concessionariaId) {
            unmatchedConcessionarias.add(concNome);
            stats.skippedNoConcessionaria++;
            continue;
        }

        // --- Validate price ---
        const preco = typeof v.preco === 'number' && v.preco > 0 ? v.preco : 0;
        if (preco <= 0) {
            stats.skippedNoPrice++;
            continue;
        }

        // --- Resolve marca ---
        let marcaNome = normalizeStr(v.marca);
        if (!marcaNome) {
            // Tentativa de adivinhar a marca pelo modelo buscando no catálogo
            const modeloStr = normalizeStr(v.modelo);
            if (modeloStr) {
                // Busca no catálogo se existe alguma variação com esse exato modelo
                const possibleBrand = await VehicleVariation.findOne({
                    modelo: { $regex: `^${escapeRegex(modeloStr)}$`, $options: 'i' }
                }).select('marca').lean();
                
                if (possibleBrand && possibleBrand.marca) {
                    marcaNome = (possibleBrand as any).marca;
                }
            }
        }

        if (!marcaNome) {
            stats.skippedNoMarca++;
            continue;
        }

        const marcaId = marcaMap.get(marcaNome.toUpperCase());

        // --- Resolve modelo ---
        const modelo = normalizeStr(v.modelo);
        if (!modelo) {
            stats.skippedNoModelo++;
            continue;
        }

        // --- Parse year ---
        const anoStr = normalizeStr(v.ano || v.anoModelo || '');
        const { anoFabricacao, anoModelo } = parseAnoComposto(anoStr);

        // --- Build fields ---
        const combustivel = normalizeStr(v.combustivel) || undefined;
        const cor = normalizeStr(v.cor) || undefined;
        const transmissao = normalizeStr(v.transmissao) || undefined;
        const opcionais = normalizeStr(v.opcionais) || undefined;
        const motor = normalizeStr(v.motor) || undefined;
        const frete = typeof v.frete === 'number' && v.frete >= 0 ? v.frete : undefined;

        // --- Build match query for VehicleVariation (mirrors unique index) ---
        const matchQuery: any = {
            marca: { $regex: `^${escapeRegex(marcaNome)}$`, $options: 'i' },
            modelo: { $regex: `^${escapeRegex(modelo)}$`, $options: 'i' },
            ativo: true,
        };

        if (anoModelo) matchQuery.anoModelo = anoModelo;
        else matchQuery.anoModelo = { $in: [null, undefined] };

        if (combustivel) matchQuery.combustivel = { $regex: `^${escapeRegex(combustivel)}$`, $options: 'i' };
        else matchQuery.combustivel = { $in: [null, undefined, ''] };

        if (cor) matchQuery.cor = { $regex: `^${escapeRegex(cor)}$`, $options: 'i' };
        else matchQuery.cor = { $in: [null, undefined, ''] };

        if (transmissao) matchQuery.transmissao = { $regex: `^${escapeRegex(transmissao)}$`, $options: 'i' };
        else matchQuery.transmissao = { $in: [null, undefined, ''] };

        if (opcionais) matchQuery.opcionais = { $regex: `^${escapeRegex(opcionais)}$`, $options: 'i' };
        else matchQuery.opcionais = { $in: [null, undefined, ''] };

        try {
            // --- Find or create VehicleVariation ---
            let variation = await VehicleVariation.findOne(matchQuery).lean();

            if (variation) {
                stats.variationExisted++;
            } else {
                if (!DRY_RUN) {
                    const created = await VehicleVariation.create({
                        marcaId: marcaId || undefined,
                        marca: marcaNome,
                        modelo,
                        tipoVeiculo: 'carro',
                        ano: anoStr || undefined,
                        anoModelo,
                        anoFabricacao,
                        combustivel,
                        cor,
                        transmissao,
                        motor,
                        opcionais,
                        ativo: true,
                        createdBy: 'migration-script',
                    });
                    variation = created.toObject();
                } else {
                    variation = { _id: new mongoose.Types.ObjectId() } as any;
                }
                stats.variationCreated++;
            }

            const variationId = (variation as any)._id;

            // --- Check if DealerVehiclePrice already exists ---
            if (!DRY_RUN) {
                const existingPrice = await DealerVehiclePrice.findOne({
                    variationId,
                    concessionariaId,
                }).lean();

                if (existingPrice) {
                    stats.skippedPriceExists++;
                    continue;
                }

                // --- Create DealerVehiclePrice ---
                await DealerVehiclePrice.create({
                    variationId,
                    concessionariaId,
                    preco,
                    frete: frete ?? null,
                    coresDisponiveis: cor ? [cor] : [],
                    observacoes: normalizeStr(v.observacoes) || undefined,
                    ativo: true,
                });
            }

            stats.linked++;

            // Progress log every 500
            if ((i + 1) % 500 === 0) {
                console.log(`   ... ${i + 1}/${allVehicles.length} processados`);
            }

        } catch (err: any) {
            if (err?.code === 11000) {
                // Duplicate key on variation create → find and link
                try {
                    const existing = await VehicleVariation.findOne(matchQuery).lean();
                    if (existing) {
                        stats.variationExisted++;

                        if (!DRY_RUN) {
                            const existingPrice = await DealerVehiclePrice.findOne({
                                variationId: (existing as any)._id,
                                concessionariaId,
                            }).lean();

                            if (existingPrice) {
                                stats.skippedPriceExists++;
                            } else {
                                await DealerVehiclePrice.create({
                                    variationId: (existing as any)._id,
                                    concessionariaId,
                                    preco,
                                    frete: frete ?? null,
                                    coresDisponiveis: cor ? [cor] : [],
                                    observacoes: normalizeStr(v.observacoes) || undefined,
                                    ativo: true,
                                });
                                stats.linked++;
                            }
                        } else {
                            stats.linked++;
                        }
                    } else {
                        stats.errors++;
                        console.error(`   ❌ Vehicle ${vehicleId}: Duplicate key mas não achou variação`);
                    }
                } catch (retryErr: any) {
                    stats.errors++;
                    console.error(`   ❌ Vehicle ${vehicleId}: Erro no retry — ${retryErr.message}`);
                }
            } else {
                stats.errors++;
                console.error(`   ❌ Vehicle ${vehicleId}: ${err.message}`);
            }
        }
    }

    // --- Report ---

    console.log('\n═══════════════════════════════════════════');
    console.log(DRY_RUN ? '📊 RELATÓRIO (DRY-RUN)' : '📊 RELATÓRIO FINAL');
    console.log('═══════════════════════════════════════════\n');

    console.log(`   Total de veículos:           ${stats.total}`);
    console.log(`   ✅ Vinculados com sucesso:    ${stats.linked}`);
    console.log(`   🆕 Variações criadas:         ${stats.variationCreated}`);
    console.log(`   📌 Variações já existiam:     ${stats.variationExisted}`);
    console.log(`   ⏭️  Preço já existia:          ${stats.skippedPriceExists}`);
    console.log(`   ⚠️  Sem concessionária:        ${stats.skippedNoConcessionaria}`);
    console.log(`   ⚠️  Sem preço (≤ 0):           ${stats.skippedNoPrice}`);
    console.log(`   ⚠️  Sem marca:                 ${stats.skippedNoMarca}`);
    console.log(`   ⚠️  Sem modelo:                ${stats.skippedNoModelo}`);
    console.log(`   ❌ Erros:                     ${stats.errors}`);

    if (unmatchedConcessionarias.size > 0) {
        console.log(`\n⚠️  Concessionárias não encontradas (${unmatchedConcessionarias.size}):`);
        for (const name of [...unmatchedConcessionarias].sort()) {
            console.log(`      • "${name}"`);
        }
    }

    console.log('\n═══════════════════════════════════════════\n');

    await mongoose.disconnect();
    console.log('🔌 Desconectado do MongoDB.');
}

main().catch(err => {
    console.error('❌ Erro fatal:', err);
    process.exit(1);
});
