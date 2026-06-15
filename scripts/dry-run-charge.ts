/**
 * Dry-run de cobrança: monta o payload EXATO que seria enviado ao MP
 * e dispara a cobrança real (valor baixo), imprimindo request e response completos.
 *
 * ATENÇÃO: isso faz uma cobrança REAL de R$ 1,00 no cartão salvo.
 * Se aprovar, o valor vai realmente ser debitado (você pode estornar depois).
 *
 * Uso:
 *   npx tsx scripts/dry-run-charge.ts <email> <cvv>
 *
 * Exemplo:
 *   npx tsx scripts/dry-run-charge.ts marcio@meuzerokilometro.com.br 123
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import mongoose from 'mongoose';
import User from '../models/User';

const MP_BASE = 'https://api.mercadopago.com';

async function main() {
    const email = process.argv[2];
    const cvv = process.argv[3];

    if (!email || !cvv) {
        console.error('Uso: npx tsx scripts/dry-run-charge.ts <email> <cvv>');
        process.exit(1);
    }

    const token = process.env.MP_ACCESS_TOKEN!;
    if (!token) {
        console.error('MP_ACCESS_TOKEN ausente');
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI!);

    const user: any = await User.findOne({ email: email.toLowerCase().trim() }).lean();
    if (!user) {
        console.error('Usuário não encontrado:', email);
        process.exit(1);
    }

    if (!user.mpCustomerId || !user.creditCard?.mpCardId) {
        console.error('Usuário não tem cartão salvo no MP.');
        process.exit(1);
    }

    console.log('\n════════════════════════════════════════════════════════════');
    console.log('  FASE 1: GERAR TOKEN DO CARTÃO');
    console.log('════════════════════════════════════════════════════════════');

    const tokenReq = {
        card_id: user.creditCard.mpCardId,
        security_code: cvv,
    };
    console.log('→ POST /v1/card_tokens?customer_id=' + user.mpCustomerId);
    console.log('→ body:', JSON.stringify(tokenReq, null, 2));

    const tokenRes = await fetch(
        `${MP_BASE}/v1/card_tokens?customer_id=${user.mpCustomerId}`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                'X-Idempotency-Key': crypto.randomUUID(),
            },
            body: JSON.stringify(tokenReq),
        }
    );
    const tokenData: any = await tokenRes.json();
    console.log(`\n← status: ${tokenRes.status}`);
    console.log('← response:', JSON.stringify(tokenData, null, 2));

    if (!tokenRes.ok || !tokenData.id) {
        console.error('\n❌ Falha na tokenização. Parando aqui.');
        await mongoose.disconnect();
        process.exit(1);
    }

    console.log('\n════════════════════════════════════════════════════════════');
    console.log('  FASE 2: COBRAR R$ 1,00');
    console.log('════════════════════════════════════════════════════════════');

    const holderName = (user.creditCard.holderName || user.displayName || '').trim();
    const parts = holderName.split(/\s+/);
    const firstName = parts[0];
    const lastName = parts.slice(1).join(' ') || undefined;

    const phoneDigits = (user.phoneNumber || '').replace(/\D/g, '');
    const phone = phoneDigits.length >= 10
        ? { area_code: phoneDigits.slice(0, 2), number: phoneDigits.slice(2) }
        : undefined;

    const cpfDigits = (user.cpf || '').replace(/\D/g, '');

    const chargeBody: any = {
        transaction_amount: 1.00,
        description: 'ZEROKM — TESTE DIAGNÓSTICO',
        token: tokenData.id,
        payment_method_id: user.creditCard.brand || 'master',
        installments: 1,
        payer: {
            type: 'customer',
            id: user.mpCustomerId,
            email: user.email,
            first_name: firstName,
            ...(lastName ? { last_name: lastName } : {}),
            ...(cpfDigits.length === 11
                ? { identification: { type: 'CPF', number: cpfDigits } }
                : {}),
            ...(phone ? { phone } : {}),
        },
        statement_descriptor: 'ZEROKM',
        metadata: { dryRun: true },
        additional_info: {
            payer: {
                first_name: firstName,
                ...(lastName ? { last_name: lastName } : {}),
                ...(phone ? { phone } : {}),
                ...(user.address?.street ? {
                    address: {
                        zip_code: (user.address.zipCode || '').replace(/\D/g, ''),
                        street_name: user.address.street,
                        street_number: user.address.number || '',
                    }
                } : {}),
            },
            items: [{
                id: 'test',
                title: 'Teste de diagnóstico',
                description: 'Cobrança simbólica para diagnosticar antifraude',
                quantity: 1,
                unit_price: 1.00,
                category_id: 'services',
            }],
        },
    };

    console.log('→ POST /v1/payments');
    console.log('→ body:', JSON.stringify(chargeBody, null, 2));
    console.log('\n⚠️  SEM X-meli-session-id (script não tem device_id do browser)');
    console.log('   Isso SIMULA a mesma situação do fluxo real menos o device_id.');

    const payRes = await fetch(`${MP_BASE}/v1/payments`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify(chargeBody),
    });
    const payData: any = await payRes.json();
    console.log(`\n← status: ${payRes.status}`);
    console.log('← response:', JSON.stringify(payData, null, 2));

    console.log('\n════════════════════════════════════════════════════════════');
    console.log('  RESUMO');
    console.log('════════════════════════════════════════════════════════════');
    console.log(`   HTTP: ${payRes.status}`);
    console.log(`   status: ${payData.status}`);
    console.log(`   status_detail: ${payData.status_detail}`);
    if (payData.cause) {
        console.log(`   cause: ${JSON.stringify(payData.cause)}`);
    }
    console.log();
    if (payData.status === 'approved') {
        console.log('✅ APROVADO — sistema funciona, antifraude só estava sensível.');
        console.log('   Importante: estornar o R$ 1,00 no painel do MP.');
    } else if (payData.status_detail === 'cc_rejected_high_risk') {
        console.log('❌ Mesma recusa por risco. Próximo passo:');
        console.log('   • Mover tokenização para o frontend (SDK JS do MP)');
        console.log('   • OU contatar o MP e pedir revisão de conta');
    } else {
        console.log('ℹ️  Motivo diferente do esperado — me cola esse output completo.');
    }

    await mongoose.disconnect();
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
