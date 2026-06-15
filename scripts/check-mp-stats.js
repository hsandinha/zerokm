require('dotenv').config({ path: '.env.local' });
const mongoose = require('mongoose');

(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;

    // Última semana
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const all = await db.collection('payments').aggregate([
        { $match: { createdAt: { $gte: since }, method: { $in: ['credit_card'] } } },
        {
            $group: {
                _id: { status: '$status', detail: '$statusDetail' },
                count: { $sum: 1 },
                users: { $addToSet: '$userId' },
            }
        },
        { $sort: { count: -1 } },
    ]).toArray();

    console.log('─'.repeat(70));
    console.log('TENTATIVAS DE CARTÃO NA ÚLTIMA SEMANA');
    console.log('─'.repeat(70));
    let totalAttempts = 0;
    let totalApproved = 0;
    const allUsers = new Set();
    const rejectedUsers = new Set();
    for (const row of all) {
        const status = row._id.status || '(sem status)';
        const detail = row._id.detail || '(sem detalhe)';
        console.log(`${status.padEnd(12)} ${detail.padEnd(35)} ${String(row.count).padStart(3)} tentativas (${row.users.length} usuários)`);
        totalAttempts += row.count;
        if (status === 'approved') totalApproved += row.count;
        for (const u of row.users) {
            allUsers.add(String(u));
            if (status === 'rejected') rejectedUsers.add(String(u));
        }
    }

    console.log();
    console.log(`Total: ${totalAttempts} tentativas, ${totalApproved} aprovadas (${totalAttempts > 0 ? ((totalApproved / totalAttempts) * 100).toFixed(0) : 0}%)`);
    console.log(`Usuários distintos: ${allUsers.size} | Com pelo menos uma rejeição: ${rejectedUsers.size}`);

    // Lista usuários com aprovações pra confirmar que NÃO é problema global
    console.log();
    console.log('─'.repeat(70));
    console.log('USUÁRIOS COM PELO MENOS UM PAGAMENTO APROVADO (cartão, ÚLTIMOS 90 DIAS)');
    console.log('─'.repeat(70));
    const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const approved = await db.collection('payments').aggregate([
        { $match: { createdAt: { $gte: since90 }, status: 'approved', method: { $in: ['credit_card'] } } },
        { $group: { _id: '$userId', count: { $sum: 1 }, last: { $max: '$createdAt' } } },
        { $sort: { last: -1 } },
        { $limit: 10 },
    ]).toArray();
    if (approved.length === 0) {
        console.log('⚠️  NENHUM pagamento de cartão aprovado nos últimos 90 dias.');
    } else {
        for (const u of approved) {
            const userDoc = await db.collection('users').findOne({ _id: u._id }, { projection: { email: 1, displayName: 1 } });
            console.log(`  ${userDoc?.email?.padEnd(35) || '(?)'} ${u.count} aprovados | último: ${new Date(u.last).toLocaleString('pt-BR')}`);
        }
    }

    // Outros métodos (PIX, boleto)
    console.log();
    console.log('─'.repeat(70));
    console.log('OUTROS MÉTODOS NA ÚLTIMA SEMANA (PIX, boleto, etc.)');
    console.log('─'.repeat(70));
    const others = await db.collection('payments').aggregate([
        { $match: { createdAt: { $gte: since }, method: { $nin: ['credit_card', 'pending'] } } },
        { $group: { _id: { method: '$method', status: '$status' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
    ]).toArray();
    if (others.length === 0) {
        console.log('(nenhum)');
    } else {
        for (const o of others) {
            console.log(`  ${(o._id.method || '?').padEnd(15)} ${(o._id.status || '?').padEnd(12)} ${o.count}`);
        }
    }

    await mongoose.disconnect();
})().catch(err => { console.error(err); process.exit(1); });
