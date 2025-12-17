/**
 * Script de migração para vincular veículos existentes aos modelos
 * 
 * Este script busca todos os veículos que não têm modeloId e tenta
 * vinculá-los aos modelos existentes baseado no nome do modelo.
 * 
 * Executar com: npx ts-node scripts/linkVehiclesToModelos.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config({ path: '.env.local' });

// Schemas inline para evitar problemas de importação
const ModeloSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    marca: { type: String, required: true }
}, { timestamps: true });

const VehicleSchema = new mongoose.Schema({
    dataEntrada: { type: Date, required: true },
    modelo: { type: String, required: true },
    modeloId: { type: mongoose.Schema.Types.ObjectId, ref: 'Modelo' },
    transmissao: { type: String, required: true },
    combustivel: { type: String, required: true },
    cor: { type: String, required: true },
    ano: { type: String, required: true },
    opcionais: { type: String },
    preco: { type: Number, required: true },
    valorVenda: { type: Number },
    status: { type: String, enum: ['A faturar', 'Refaturamento', 'Licenciado'], required: true },
    observacoes: { type: String },
    cidade: { type: String, required: true },
    estado: { type: String, required: true },
    frete: { type: Number, required: true },
    telefone: { type: String, required: true },
    nomeContato: { type: String, required: true },
    operador: { type: String, required: true },
    concessionaria: { type: String },
    fotos: { type: [String] },
    marca: String,
    versao: String,
    anoModelo: String,
    chassi: String,
    motor: String,
    vendedor: String,
    quilometragem: Number,
    categoria: String,
    descricao: String
}, { timestamps: true });

async function linkVehiclesToModelos() {
    try {
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            throw new Error('MONGODB_URI não definida no .env.local');
        }

        console.log('Conectando ao MongoDB...');
        await mongoose.connect(mongoUri);
        console.log('✓ Conectado ao MongoDB');

        // Criar modelos
        const Modelo = mongoose.models.Modelo || mongoose.model('Modelo', ModeloSchema);
        const Vehicle = mongoose.models.Vehicle || mongoose.model('Vehicle', VehicleSchema);

        // Buscar todos os veículos sem modeloId
        const vehicles = await Vehicle.find({ 
            $or: [
                { modeloId: { $exists: false } },
                { modeloId: null }
            ]
        });
        console.log(`\nEncontrados ${vehicles.length} veículos sem modeloId`);

        if (vehicles.length === 0) {
            console.log('Nenhum veículo para vincular!');
            await mongoose.disconnect();
            return;
        }

        // Buscar todos os modelos
        const modelos = await Modelo.find({});
        console.log(`Encontrados ${modelos.length} modelos na tabela`);

        // Criar mapa de modelos por nome (case insensitive)
        const modeloMap = new Map<string, any>();
        modelos.forEach(m => {
            modeloMap.set(m.nome.toUpperCase().trim(), m);
        });

        let linked = 0;
        let notFound = 0;
        const notFoundModels = new Set<string>();

        console.log('\nProcessando veículos...\n');

        for (const vehicle of vehicles) {
            const modeloNome = vehicle.modelo?.toUpperCase().trim();
            
            if (!modeloNome) {
                notFound++;
                continue;
            }

            // Tentar encontrar o modelo pelo nome exato
            let modelo = modeloMap.get(modeloNome);

            // Se não encontrou, tentar busca parcial
            if (!modelo) {
                for (const [nome, m] of modeloMap.entries()) {
                    if (modeloNome.includes(nome) || nome.includes(modeloNome)) {
                        modelo = m;
                        break;
                    }
                }
            }

            if (modelo) {
                await Vehicle.updateOne(
                    { _id: vehicle._id },
                    { 
                        $set: { 
                            modeloId: modelo._id,
                            marca: modelo.marca
                        } 
                    }
                );
                linked++;
                if (linked % 100 === 0) {
                    console.log(`Vinculados: ${linked}...`);
                }
            } else {
                notFound++;
                notFoundModels.add(modeloNome);
            }
        }

        console.log('\n=== RESUMO DA MIGRAÇÃO ===');
        console.log(`✓ Veículos vinculados: ${linked}`);
        console.log(`✗ Modelos não encontrados: ${notFound}`);
        
        if (notFoundModels.size > 0) {
            console.log('\nModelos não encontrados na tabela:');
            Array.from(notFoundModels).slice(0, 20).forEach(m => {
                console.log(`  - ${m}`);
            });
            if (notFoundModels.size > 20) {
                console.log(`  ... e mais ${notFoundModels.size - 20} modelos`);
            }
        }

        await mongoose.disconnect();
        console.log('\n✓ Desconectado do MongoDB');
        console.log('Migração concluída!');
    } catch (error) {
        console.error('Erro na migração:', error);
        process.exit(1);
    }
}

// Executar
linkVehiclesToModelos();
