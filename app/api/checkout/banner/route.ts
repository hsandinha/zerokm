import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import { createPreference } from '@/lib/mercadopago';
import Banner from '@/models/Banner';
import mongoose from 'mongoose';

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.uid) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { title, linkUrl, imageUrl } = body;

    if (!title || !imageUrl) {
        return NextResponse.json({ error: 'Título e imagem são obrigatórios' }, { status: 400 });
    }

    await connectDB();

    // Buscar configurações de banner
    const db = mongoose.connection.useDb('zerokm');
    const configCollection = db.collection('configs');
    const bannerConfig = await configCollection.findOne({ key: 'banners' });
    
    const priceCents = bannerConfig?.price_cents || 5000;
    const durationDays = bannerConfig?.duration_days || 1;
    const finalPrice = priceCents / 100;

    // Criar banner com status awaiting_payment
    const newBanner = await Banner.create({
        title: title,
        imageUrl: imageUrl,
        linkUrl: linkUrl || '',
        isActive: false, // Só fica ativo quando o admin aprovar
        dealershipId: session.user.uid,
        status: 'awaiting_payment',
        expiresAt: new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000)
    });

    const host = req.headers.get('host') || 'www.cnv0km.com.br';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;
    const externalRef = `BANNER:${newBanner._id}`;

    const mpItems: any[] = [
        {
            id: newBanner._id.toString(),
            title: `Anúncio Banner: ${title}`,
            description: `Publicação de Banner por ${durationDays} dias no aplicativo Cliente.`,
            quantity: 1,
            currency_id: 'BRL',
            unit_price: finalPrice,
            category_id: 'services',
        }
    ];

    const preference = {
        items: mpItems,
        payer: {
            email: session.user.email,
        },
        payment_methods: {
            installments: 1,
        },
        back_urls: {
            success: `${baseUrl}/dashboard/dealership?payment=success`,
            failure: `${baseUrl}/dashboard/dealership?payment=failure`,
            pending: `${baseUrl}/dashboard/dealership?payment=pending`,
        },
        auto_return: 'approved',
        external_reference: externalRef,
        notification_url: `${baseUrl}/api/webhooks/mercadopago`,
        statement_descriptor: 'ZEROKM BANNER',
        expires: true,
        expiration_date_from: new Date().toISOString(),
        expiration_date_to: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };

    const mpRes = await createPreference(preference);

    if (!mpRes.ok) {
        console.error('Erro Mercado Pago:', JSON.stringify(mpRes.data));
        return NextResponse.json({ error: 'Erro ao criar preferência de pagamento' }, { status: 500 });
    }

    return NextResponse.json({
        init_point: mpRes.data.init_point,
        sandbox_init_point: mpRes.data.sandbox_init_point,
        preference_id: mpRes.data.id,
    });
}
