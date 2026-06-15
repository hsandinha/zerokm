/**
 * Diagnóstico completo do ambiente de pagamento.
 *
 * Rode com:
 *   npx tsx scripts/diagnose-payment.ts <email-do-usuario>
 *
 * Ex.:
 *   npx tsx scripts/diagnose-payment.ts marcio@teste.com
 */
import { config } from 'dotenv';
import { resolve } from 'path';
// Next.js usa .env.local — carregar antes de qualquer import que leia process.env
config({ path: resolve(process.cwd(), '.env.local') });

import mongoose from 'mongoose';
import User from '../models/User';
import Payment from '../models/Payment';

async function main() {
    const email = process.argv[2];
    if (!email) {
        console.error('❌ Informe o e-mail: npx tsx scripts/diagnose-payment.ts <email>');
        process.exit(1);
    }

    const tok = process.env.MP_ACCESS_TOKEN || '';
    console.log('─'.repeat(60));
    console.log('1️⃣  MP_ACCESS_TOKEN');
    console.log('─'.repeat(60));
    if (!tok) {
        console.log('❌ MP_ACCESS_TOKEN NÃO configurado');
    } else if (tok.startsWith('TEST-')) {
        console.log('⚠️  TOKEN DE SANDBOX (TEST-)');
        console.log('   Cartões REAIS serão SEMPRE recusados com cc_rejected_high_risk.');
        console.log('   Use cartões de teste do MP para aprovar em sandbox.');
    } else if (tok.startsWith('APP_USR-')) {
        console.log('✅ Token de produção (APP_USR-)');
    } else {
        console.log('❓ Formato de token não reconhecido:', tok.slice(0, 10) + '...');
    }

    await mongoose.connect(process.env.MONGODB_URI!);

    const user = await User.findOne({ email: email.toLowerCase().trim() }).lean();
    console.log();
    console.log('─'.repeat(60));
    console.log('2️⃣  PERFIL DO USUÁRIO');
    console.log('─'.repeat(60));
    if (!user) {
        console.log('❌ Usuário não encontrado:', email);
        await mongoose.disconnect();
        process.exit(1);
    }

    const cpfDigits = (user.cpf || '').replace(/\D/g, '');
    const phoneDigits = (user.phoneNumber || '').replace(/\D/g, '');
    const addr = user.address || ({} as any);

    const checks: Array<[string, boolean, string]> = [
        ['displayName', !!user.displayName && user.displayName.trim().length > 2, user.displayName || '(vazio)'],
        ['cpf (11 dígitos)', cpfDigits.length === 11, cpfDigits || '(vazio)'],
        ['phoneNumber (≥10 dígitos)', phoneDigits.length >= 10, phoneDigits || '(vazio)'],
        ['address.street', !!addr.street, addr.street || '(vazio)'],
        ['address.number', !!addr.number, addr.number || '(vazio)'],
        ['address.city', !!addr.city, addr.city || '(vazio)'],
        ['address.state', !!addr.state, addr.state || '(vazio)'],
        ['address.zipCode', !!addr.zipCode, addr.zipCode || '(vazio)'],
        ['mpCustomerId', !!user.mpCustomerId, user.mpCustomerId || '(vazio)'],
        ['creditCard.mpCardId', !!user.creditCard?.mpCardId, user.creditCard?.mpCardId || '(vazio)'],
        // ESTE é o nome que vai no payer.first_name/last_name para o MP (após o fix).
        // Precisa ser exatamente o nome IMPRESSO no cartão físico.
        ['creditCard.holderName', !!user.creditCard?.holderName, user.creditCard?.holderName || '(vazio)'],
        ['creditCard.lastFour', !!user.creditCard?.lastFour, user.creditCard?.lastFour || '(vazio)'],
        ['creditCard.brand', !!user.creditCard?.brand, user.creditCard?.brand || '(vazio)'],
    ];

    // Simular o nome que será enviado ao payer após o fix
    const simulatedHolderName = ((user.creditCard as any)?.holderName || '').trim();
    const simulatedFullName = (simulatedHolderName || user.displayName || '').trim();
    const simulatedParts = simulatedFullName.split(/\s+/);
    const simulatedFirst = simulatedParts[0] || '(vazio)';
    const simulatedLast = simulatedParts.length > 1 ? simulatedParts.slice(1).join(' ') : '(vazio)';

    let allGood = true;
    for (const [field, ok, val] of checks) {
        const icon = ok ? '✅' : '❌';
        const display = val.length > 40 ? val.slice(0, 37) + '...' : val;
        console.log(`${icon}  ${field.padEnd(28)} ${display}`);
        if (!ok) allGood = false;
    }

    if (!allGood) {
        console.log();
        console.log('⚠️  Campos faltando → antifraude do MP DESCONFIA e recusa.');
        console.log('   Preencha no perfil antes de tentar pagar novamente.');
    }

    console.log();
    console.log('─'.repeat(60));
    console.log('🎯  NOME QUE O BACK VAI ENVIAR AO MP (payer.first_name/last_name)');
    console.log('─'.repeat(60));
    console.log(`   first_name: ${simulatedFirst}`);
    console.log(`   last_name:  ${simulatedLast}`);
    console.log();
    if (simulatedHolderName) {
        console.log(`   ℹ️  origem: creditCard.holderName  (nome digitado na tela do cartão)`);
        console.log(`   ✅ isso deve bater com o nome IMPRESSO NO CARTÃO físico`);
    } else {
        console.log(`   ⚠️  origem: displayName  (holderName estava vazio — fallback)`);
        console.log(`   ⚠️  se o nome do dono da conta for DIFERENTE do titular do cartão,`);
        console.log(`      o antifraude do MP vai detectar e recusar com cc_rejected_high_risk.`);
        console.log(`      Remova o cartão salvo e cadastre de novo digitando o nome correto.`);
    }

    console.log();
    console.log('─'.repeat(60));
    console.log('3️⃣  ÚLTIMAS 5 TENTATIVAS DE PAGAMENTO');
    console.log('─'.repeat(60));
    const payments = await Payment.find({ userId: user._id })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();

    if (payments.length === 0) {
        console.log('(nenhum registro)');
    } else {
        for (const p of payments as any[]) {
            const when = new Date(p.createdAt).toLocaleString('pt-BR');
            console.log(`${when}  ${p.method.padEnd(12)} ${p.status.padEnd(10)} R$ ${p.amount}  ${p.statusDetail || ''}`);
        }
    }

    console.log();
    console.log('─'.repeat(60));
    console.log('4️⃣  RECOMENDAÇÃO');
    console.log('─'.repeat(60));
    if (tok.startsWith('TEST-')) {
        console.log('👉 Troque MP_ACCESS_TOKEN por um APP_USR- (credenciais de produção).');
    } else if (!allGood) {
        console.log('👉 Complete o perfil do usuário (CPF, telefone, endereço).');
    } else {
        console.log('👉 Ambiente parece correto. O MP pode estar segurando por histórico recente');
        console.log('   (muitas recusas seguidas geram "cooldown" no antifraude). Tente:');
        console.log('   • Esperar 15-30 min antes de nova tentativa');
        console.log('   • Usar outro cartão');
        console.log('   • Usar PIX enquanto isso');
    }

    await mongoose.disconnect();
}

main().catch(err => {
    console.error('Erro no diagnóstico:', err);
    process.exit(1);
});
