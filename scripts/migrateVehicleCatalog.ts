import 'dotenv/config';
import connectDB from '../lib/mongodb';
import Concessionaria from '../models/Concessionaria';
import DealerVehiclePrice from '../models/DealerVehiclePrice';
import Marca from '../models/Marca';
import Vehicle from '../models/Vehicle';
import VehicleVariation from '../models/VehicleVariation';

const shouldWrite = process.argv.includes('--write');

const normalize = (value: unknown) => {
    return typeof value === 'string' ? value.trim() : '';
};

const normalizeYear = (value: unknown) => {
    const raw = normalize(value);
    if (!raw) return undefined;
    const match = raw.match(/\d{4}/);
    if (!match) return undefined;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : undefined;
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function findOrCreateMarca(nome: string) {
    if (!shouldWrite) return { _id: undefined, nome } as any;

    return Marca.findOneAndUpdate(
        { nome },
        { $setOnInsert: { nome } },
        { new: true, upsert: true }
    );
}

async function findConcessionariaByName(nome: string) {
    if (!nome) return null;
    return Concessionaria.findOne({
        nome: { $regex: `^${escapeRegex(nome)}$`, $options: 'i' },
    });
}

function buildVariationPayload(vehicle: any, marca: any) {
    const marcaNome = normalize(vehicle.marca) || normalize(marca?.nome) || 'Sem marca';

    return {
        marcaId: marca?._id,
        marca: marcaNome,
        modelo: normalize(vehicle.modelo) || 'Sem modelo',
        versao: normalize(vehicle.versao) || undefined,
        tipoVeiculo: 'carro',
        anoModelo: normalizeYear(vehicle.anoModelo || vehicle.ano),
        anoFabricacao: normalizeYear(vehicle.ano),
        combustivel: normalize(vehicle.combustivel) || undefined,
        transmissao: normalize(vehicle.transmissao) || undefined,
        motor: normalize(vehicle.motor) || undefined,
        opcionaisPadrao: normalize(vehicle.opcionais)
            ? normalize(vehicle.opcionais).split(',').map(item => item.trim()).filter(Boolean)
            : [],
        ativo: true,
        createdBy: 'migration:migrateVehicleCatalog',
    };
}

async function findOrCreateVariation(payload: any) {
    const query = {
        marca: payload.marca,
        modelo: payload.modelo,
        versao: payload.versao,
        anoModelo: payload.anoModelo,
        combustivel: payload.combustivel,
        transmissao: payload.transmissao,
    };

    if (!shouldWrite) return { _id: undefined, ...payload } as any;

    return VehicleVariation.findOneAndUpdate(
        query,
        { $setOnInsert: payload },
        { new: true, upsert: true }
    );
}

async function main() {
    await connectDB();

    const vehicles = await Vehicle.find({}).lean();
    const stats = {
        scanned: 0,
        skippedNoDealership: 0,
        variations: 0,
        prices: 0,
        dealershipsLinked: 0,
    };

    const variationKeys = new Set<string>();

    for (const vehicle of vehicles as any[]) {
        stats.scanned++;

        const marcaNome = normalize(vehicle.marca) || 'Sem marca';
        const marca = await findOrCreateMarca(marcaNome);
        const variationPayload = buildVariationPayload(vehicle, marca);
        const variationKey = JSON.stringify({
            marca: variationPayload.marca,
            modelo: variationPayload.modelo,
            versao: variationPayload.versao,
            anoModelo: variationPayload.anoModelo,
            combustivel: variationPayload.combustivel,
            transmissao: variationPayload.transmissao,
        });

        if (!variationKeys.has(variationKey)) {
            variationKeys.add(variationKey);
            stats.variations++;
        }

        const variation = await findOrCreateVariation(variationPayload);
        const concessionariaNome = normalize(vehicle.concessionaria);
        const concessionaria = await findConcessionariaByName(concessionariaNome);

        if (!concessionaria) {
            stats.skippedNoDealership++;
            continue;
        }

        if (shouldWrite && marca?._id && !concessionaria.marcaId) {
            await Concessionaria.findByIdAndUpdate(concessionaria._id, {
                $set: {
                    marcaId: marca._id,
                    marca: marca.nome,
                },
            });
            stats.dealershipsLinked++;
        }

        const preco = typeof vehicle.preco === 'number' && vehicle.preco > 0
            ? vehicle.preco
            : null;

        if (!preco || !shouldWrite || !variation?._id) {
            if (preco) stats.prices++;
            continue;
        }

        await DealerVehiclePrice.findOneAndUpdate(
            {
                variationId: variation._id,
                concessionariaId: concessionaria._id,
            },
            {
                $set: {
                    preco,
                    frete: typeof vehicle.frete === 'number' ? vehicle.frete : null,
                    coresDisponiveis: normalize(vehicle.cor) ? [normalize(vehicle.cor)] : [],
                    observacoes: normalize(vehicle.observacoes) || undefined,
                },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        stats.prices++;
    }

    console.log(JSON.stringify({
        mode: shouldWrite ? 'write' : 'dry-run',
        ...stats,
    }, null, 2));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
