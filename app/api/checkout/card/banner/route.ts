import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import { mpPost } from '@/lib/mercadopago';
import Banner from '@/models/Banner';
import User from '@/models/User';
import mongoose from 'mongoose';
import { validateCPF } from '@/lib/utils/cpf';

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.uid) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { title, linkUrl, imageUrl, cardToken, installments, payerEmail, payerDocType, payerDocNumber } = body;

    if (!title || !imageUrl || !cardToken) {
        return NextResponse.json({ error: 'Faltam dados do pagamento (título, imagem ou cartão)' }, { status: 400 });
    }

    await connectDB();

    const user = await User.findOne({ firebaseUid: session.user.uid });
    if (!user) {
        return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    const db = mongoose.connection.useDb('zerokm');
    const configCollection = db.collection('configs');
    const bannerConfig = await configCollection.findOne({ key: 'banners' });
    
    const priceCents = bannerConfig?.price_cents || 5000;
    const durationDays = bannerConfig?.duration_days || 7;
    const finalPrice = priceCents / 100;

    const newBanner = await Banner.create({
        title: title,
        imageUrl: imageUrl,
        linkUrl: linkUrl || '',
        isActive: false, 
        dealershipId: session.user.uid,
        status: 'awaiting_payment',
        expiresAt: new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000)
    });

    const externalRef = `BANNER:${newBanner._id}`;
    const description = `Anúncio Banner: ${title} (${durationDays} dias) — Cartão`;

    const clientIp = (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '').split(',')[0].trim();
    const baseUrlRaw = process.env.NEXTAUTH_URL || 'https://zerokm.vercel.app';
    const baseUrl = baseUrlRaw.includes('localhost') || baseUrlRaw.includes('127.0.0.1') ? 'https://zerokm.vercel.app' : baseUrlRaw;

    const paymentBody: Record<string, any> = {
        transaction_amount: finalPrice,
        token: cardToken,
        description,
        installments: installments || 1,
        payer: {
            email: payerEmail || user.email || session.user.email,
            identification: {
                type: payerDocType || 'CPF',
                number: payerDocNumber || (user.cpf ? user.cpf.replace(/\D/g, '') : '')
            }
        },
        external_reference: externalRef,
        notification_url: `${baseUrl}/api/webhooks/mercadopago`,
        statement_descriptor: 'ZEROKM BANNER',
        metadata: {
            bannerId: newBanner._id.toString(),
            type: 'banner-card',
        },
    };

    const extraHeaders: Record<string, string> = {};
    if (clientIp) extraHeaders['X-Forwarded-For'] = clientIp;

    const payRes = await mpPost('/v1/payments', paymentBody, undefined, extraHeaders);

    if (!payRes.ok) {
        console.error('Erro ao cobrar Cartão Banner:', JSON.stringify(payRes.data));
        return NextResponse.json({ error: payRes.data?.message || 'Erro ao processar cartão' }, { status: 400 });
    }

    await Banner.findByIdAndUpdate(newBanner._id, {
        $set: { paymentId: payRes.data.id?.toString() }
    });

    return NextResponse.json({
        ok: true,
        paymentId: payRes.data.id,
        status: payRes.data.status,
        statusDetail: payRes.data.status_detail,
        amount: finalPrice,
    });
}
