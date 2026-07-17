const mongoose = require('mongoose');

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;

    // Mesmos critérios do diagnóstico: preço ativo cuja variação não existe ou está inativa
    const orphans = await db.collection('dealervehicleprices').aggregate([
        { $match: { ativo: true } },
        {
            $lookup: {
                from: 'vehiclevariations',
                localField: 'variationId',
                foreignField: '_id',
                as: 'variation',
            }
        },
        { $match: { 'variation.ativo': { $ne: true } } },
        { $project: { _id: 1 } },
    ]).toArray();

    console.log('Órfãos encontrados:', orphans.length);
    if (orphans.length === 0) {
        await mongoose.disconnect();
        return;
    }

    const ids = orphans.map(o => o._id);
    const result = await db.collection('dealervehicleprices').updateMany(
        { _id: { $in: ids } },
        { $set: { ativo: false, quantidade: 0 } }
    );
    console.log('Atualizados:', result.modifiedCount);

    // Verificação pós-limpeza
    const remaining = await db.collection('dealervehicleprices').aggregate([
        { $match: { ativo: true } },
        {
            $lookup: {
                from: 'vehiclevariations',
                localField: 'variationId',
                foreignField: '_id',
                as: 'variation',
            }
        },
        { $match: { 'variation.ativo': { $ne: true } } },
        { $count: 'total' },
    ]).toArray();
    console.log('Órfãos ativos restantes:', remaining[0]?.total || 0);

    const totalAtivos = await db.collection('dealervehicleprices').countDocuments({ ativo: true });
    console.log('Total de preços ativos após limpeza:', totalAtivos);

    // Normaliza registros inativos que ficaram com prazo/quantidade residuais
    const norm = await db.collection('dealervehicleprices').updateMany(
        { ativo: false, $or: [{ prazo: { $ne: null } }, { quantidade: { $gt: 0 } }] },
        { $set: { prazo: null, quantidade: 0 } }
    );
    console.log('Inativos normalizados (prazo/quantidade zerados):', norm.modifiedCount);

    await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
