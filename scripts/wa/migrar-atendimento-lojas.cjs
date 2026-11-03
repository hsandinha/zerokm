/**
 * Prepara o banco para o atendimento das lojas (Chatrun dentro da zerokm).
 *
 * O que faz (idempotente — pode rodar mais de uma vez):
 *   1. wa_contacts: troca o índice único `phone_1` (um telefone no banco
 *      inteiro) por `tenantId_1_phone_1` (um telefone por loja). Sem isso, o
 *      mesmo cliente não consegue ser contato do CNV e de uma loja, e a
 *      mensagem dele para a loja se perde no erro de duplicidade;
 *   2. cria os índices novos de wa_channels, wa_stores, wa_conversations e o
 *      do estoque local na repassevehicles.
 *
 * Rode ANTES de abrir o atendimento para as lojas. Sem --aplicar só mostra.
 * Lê o MONGODB_URI do .env.local (como os outros scripts), ou do ambiente.
 *
 *   node scripts/wa/migrar-atendimento-lojas.cjs
 *   node scripts/wa/migrar-atendimento-lojas.cjs --aplicar
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env.local'), quiet: true });
const mongoose = require('mongoose');

async function indices(db, nome) {
    try {
        return await db.collection(nome).indexes();
    } catch {
        return []; // coleção ainda não existe
    }
}

async function main() {
    const aplicar = process.argv.includes('--aplicar');
    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI não encontrado. Rode na raiz do projeto, com o .env.local preenchido.');
        process.exit(1);
    }
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    const passos = [];

    const contatos = await indices(db, 'wa_contacts');
    if (contatos.some((i) => i.name === 'phone_1' && i.unique)) {
        passos.push(['wa_contacts: remover o índice único phone_1', () => db.collection('wa_contacts').dropIndex('phone_1')]);
    }
    if (!contatos.some((i) => i.name === 'tenantId_1_phone_1')) {
        passos.push(['wa_contacts: criar índice único { tenantId, phone }', () =>
            db.collection('wa_contacts').createIndex({ tenantId: 1, phone: 1 }, { unique: true })]);
    }

    const novos = [
        ['wa_conversations', { tenantId: 1, lastMessageAt: -1 }, {}],
        ['wa_channels', { tenantId: 1, kind: 1 }, {}],
        ['wa_channels', { phoneNumberId: 1 }, { unique: true, partialFilterExpression: { phoneNumberId: { $type: 'string' } } }],
        ['wa_channels', { igUserId: 1 }, { unique: true, partialFilterExpression: { igUserId: { $type: 'string' } } }],
        ['wa_stores', { concessionariaId: 1 }, { unique: true, partialFilterExpression: { concessionariaId: { $type: 'objectId' } } }],
        ['wa_stores', { ownerUserId: 1 }, { unique: true, partialFilterExpression: { ownerUserId: { $type: 'objectId' } } }],
        ['wa_stores', { 'members.email': 1 }, {}],
        ['repassevehicles', { lojistaId: 1, ativo: 1, updatedAt: -1 }, {}],
    ];
    for (const [colecao, chave, opcoes] of novos) {
        const existentes = await indices(db, colecao);
        const nome = Object.entries(chave).map(([k, v]) => `${k}_${v}`).join('_');
        if (!existentes.some((i) => i.name === nome)) {
            passos.push([`${colecao}: criar índice ${nome}`, () => db.collection(colecao).createIndex(chave, opcoes)]);
        }
    }

    if (!passos.length) {
        console.log('Nada a fazer: o banco já está pronto para as lojas.');
    } else {
        for (const [descricao, executar] of passos) {
            console.log(`${aplicar ? '→' : '•'} ${descricao}`);
            if (aplicar) await executar();
        }
        console.log(aplicar ? '\nPronto.' : '\nNada foi alterado. Rode com --aplicar para gravar.');
    }
    await mongoose.disconnect();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
