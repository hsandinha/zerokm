
import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

import mongoose from 'mongoose';
import { getFirestore } from 'firebase-admin/firestore';

// Dynamic imports will be used in main() to ensure env vars are loaded first

async function migrateCollection(
    db: FirebaseFirestore.Firestore,
    collectionName: string,
    MongooseModel: mongoose.Model<any>,
    transformFn: (doc: any) => any,
    options: {
        uniqueFields?: string[],
        clearCollection?: boolean
    } = {}
) {
    console.log(`Starting migration for ${collectionName}...`);
    try {
        if (options.clearCollection) {
            console.log(`Clearing collection ${collectionName}...`);
            await MongooseModel.deleteMany({});
            console.log(`Collection ${collectionName} cleared.`);
        }

        const snapshot = await db.collection(collectionName).get();
        if (snapshot.empty) {
            console.log(`No documents found in ${collectionName}.`);
            return;
        }

        console.log(`Found ${snapshot.size} documents in ${collectionName}.`);
        let successCount = 0;
        let errorCount = 0;
        let skippedCount = 0;

        for (const doc of snapshot.docs) {
            try {
                const data = doc.data();
                const transformedData = transformFn({ ...data, id: doc.id });

                if (options.uniqueFields && options.uniqueFields.length > 0) {
                    const query: any = {};
                    let hasAllFields = true;
                    for (const field of options.uniqueFields) {
                        if (transformedData[field] === undefined || transformedData[field] === null) {
                            hasAllFields = false;
                            break;
                        }
                        query[field] = transformedData[field];
                    }

                    if (hasAllFields) {
                        const exists = await MongooseModel.findOne(query);
                        if (exists) {
                            skippedCount++;
                            continue;
                        }
                    }
                }

                await MongooseModel.create(transformedData);
                successCount++;
            } catch (error: any) {
                if (error.code === 11000) {
                    // Duplicate key error caught by Mongoose
                    skippedCount++;
                } else {
                    console.error(`Error migrating doc ${doc.id} in ${collectionName}:`, error);
                    errorCount++;
                }
            }
        }
        console.log(`Finished ${collectionName}: ${successCount} success, ${skippedCount} skipped, ${errorCount} errors.`);
    } catch (error) {
        console.error(`Error fetching ${collectionName}:`, error);
    }
}

// Transform functions
const transformMarca = (data: any) => ({
    nome: data.nome,
    createdAt: data.criadoEm?.toDate ? data.criadoEm.toDate() : new Date(),
});

const transformModelo = (data: any) => ({
    nome: data.nome,
    marca: data.marca,
    createdAt: data.criadoEm?.toDate ? data.criadoEm.toDate() : new Date(),
});

const transformCor = (data: any) => ({
    nome: data.nome,
    hex: data.hex,
    createdAt: data.criadoEm?.toDate ? data.criadoEm.toDate() : new Date(),
});

const transformConcessionaria = (data: any) => ({
    nome: data.nome,
    razaoSocial: data.razaoSocial || data.nome,
    cnpj: data.cnpj || '',
    inscricaoEstadual: data.inscricaoEstadual,
    telefone: data.telefone || '',
    celular: data.celular,
    contato: data.contato || '',
    email: data.email || 'nao_informado@zerokm.com.br',
    endereco: data.endereco || '',
    numero: data.numero || 'S/N',
    complemento: data.complemento,
    bairro: data.bairro || 'Não informado',
    cidade: data.cidade || '',
    uf: data.uf || '',
    cep: data.cep || '',
    nomeResponsavel: data.nomeResponsavel || 'Não informado',
    telefoneResponsavel: data.telefoneResponsavel || 'Não informado',
    emailResponsavel: data.emailResponsavel,
    observacoes: data.observacoes,
    ativo: data.ativo ?? true,
    createdAt: data.criadoEm?.toDate ? data.criadoEm.toDate() : new Date(),
});

const transformTransportadora = (data: any) => ({
    nome: data.nome,
    razaoSocial: data.razaoSocial || data.nome,
    cnpj: data.cnpj || '',
    inscricaoEstadual: data.inscricaoEstadual,
    telefone: data.telefone || '',
    celular: data.celular,
    email: data.email || '',
    endereco: data.endereco || '',
    numero: data.numero || '',
    complemento: data.complemento,
    bairro: data.bairro || '',
    cidade: data.cidade || '',
    estado: data.estado || '',
    cep: data.cep || '',
    nomeResponsavel: data.nomeResponsavel || '',
    telefoneResponsavel: data.telefoneResponsavel || '',
    emailResponsavel: data.emailResponsavel,
    observacoes: data.observacoes,
    ativo: data.ativo ?? true,
    dataCreated: data.dataCreated || new Date().toLocaleDateString('pt-BR'),
});

const transformVehicle = (data: any) => {
    let dataEntrada = new Date();
    if (data.dataEntrada) {
        if (data.dataEntrada.toDate) {
            dataEntrada = data.dataEntrada.toDate();
        } else if (typeof data.dataEntrada === 'string') {
            const dateStr = data.dataEntrada.trim().toLowerCase();

            // Handle "DD/MMM" format (e.g., "13/nov")
            const monthMap: { [key: string]: string } = {
                'jan': '01', 'fev': '02', 'mar': '03', 'abr': '04', 'mai': '05', 'jun': '06',
                'jul': '07', 'ago': '08', 'set': '09', 'out': '10', 'nov': '11', 'dez': '12'
            };

            const shortDateMatch = dateStr.match(/^(\d{1,2})\/([a-z]{3})$/);

            if (shortDateMatch) {
                const day = shortDateMatch[1].padStart(2, '0');
                const monthAbbr = shortDateMatch[2];
                const month = monthMap[monthAbbr];

                if (month) {
                    // Force year 2025 as requested
                    dataEntrada = new Date(`2025-${month}-${day}T12:00:00`);
                }
            }
            // Tenta converter string DD/MM/YYYY ou YYYY-MM-DD
            else if (data.dataEntrada.includes('/')) {
                const parts = data.dataEntrada.split('/');
                if (parts.length === 3) {
                    // Assume DD/MM/YYYY
                    dataEntrada = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                } else {
                    dataEntrada = new Date(data.dataEntrada);
                }
            } else {
                dataEntrada = new Date(data.dataEntrada);
            }
        } else {
            dataEntrada = new Date(data.dataEntrada);
        }
    }

    // Validate date
    if (isNaN(dataEntrada.getTime())) {
        dataEntrada = new Date();
    }

    return {
        dataEntrada: dataEntrada,
        modelo: data.modelo,
        transmissao: data.transmissao || 'Manual',
        combustivel: data.combustivel || 'Flex',
        cor: data.cor,
        ano: data.ano || '0000',
        opcionais: data.opcionais,
        preco: Number(data.preco) || 0,
        status: data.status || 'A faturar',
        observacoes: data.observacoes,
        cidade: data.cidade,
        estado: data.estado,
        concessionaria: data.concessionaria,
        telefone: data.telefone,
        nomeContato: data.nomeContato || data.vendedor,
        operador: data.operador,
        fotos: data.fotos || [],
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    };
};

const transformUser = (data: any) => ({
    firebaseUid: data.id,
    email: data.email || `missing_${data.id}@zerokm.com.br`,
    displayName: data.displayName || data.name,
    phoneNumber: data.phoneNumber,
    cpf: data.cpf,
    allowedProfiles: data.allowedProfiles || ['operador'],
    defaultProfile: data.defaultProfile,
    dealershipId: data.dealershipId,
    forcePasswordChange: data.forcePasswordChange || false,
    address: data.address,
});

async function main() {
    try {
        // Import dependencies dynamically
        const { adminApp } = await import('../lib/firebase-admin.js');
        const { default: connectDB } = await import('../lib/mongodb.js');

        // Import Models dynamically
        const { default: Marca } = await import('../models/Marca.js');
        const { default: Modelo } = await import('../models/Modelo.js');
        const { default: Cor } = await import('../models/Cor.js');
        const { default: Concessionaria } = await import('../models/Concessionaria.js');
        const { default: Transportadora } = await import('../models/Transportadora.js');
        const { default: Vehicle } = await import('../models/Vehicle.js');
        const { default: User } = await import('../models/User.js'); const db = getFirestore(adminApp);

        console.log('Connecting to MongoDB...');
        await connectDB();
        console.log('Connected to MongoDB.');

        // await migrateCollection(db, 'marcas', Marca, transformMarca, { uniqueFields: ['nome'] });
        // await migrateCollection(db, 'modelos', Modelo, transformModelo, { uniqueFields: ['nome', 'marca'] });
        // await migrateCollection(db, 'cores', Cor, transformCor, { uniqueFields: ['nome'] });
        // await migrateCollection(db, 'concessionarias', Concessionaria, transformConcessionaria, { uniqueFields: ['cnpj'] });
        // await migrateCollection(db, 'transportadoras', Transportadora, transformTransportadora, { uniqueFields: ['cnpj'] });
        // Vehicles: clear collection to avoid duplicates as we don't have a unique key
        await migrateCollection(db, 'vehicles', Vehicle, transformVehicle, { clearCollection: true });
        // await migrateCollection(db, 'users', User, transformUser, { uniqueFields: ['email'] });

        console.log('Migration completed.');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

main();
