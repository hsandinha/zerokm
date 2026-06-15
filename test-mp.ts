import { mpPost } from './lib/mercadopago';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
    const preference = {
        items: [
            {
                id: '123',
                title: 'Test',
                quantity: 1,
                currency_id: 'BRL',
                unit_price: 10,
            },
        ],
        payment_methods: {
            excluded_payment_methods: [],
            excluded_payment_types: [],
            installments: 12,
        },
    };
    const mpRes = await mpPost('/checkout/preferences', preference);
    console.log(JSON.stringify(mpRes, null, 2));
    process.exit(0);
}
run();
