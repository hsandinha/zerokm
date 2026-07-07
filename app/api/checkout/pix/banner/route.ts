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
    const { title, linkUrl, imageUrl } = body;

    if (!title || !imageUrl) {
        return NextResponse.json({ error: 'Título e imagem são obrigatórios' }, { status: 400 });
    }

    await connectDB();

    const user = await User.findOne({ firebaseUid: session.user.uid });
    if (!user) {
        return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    if (!user.cpf || !validateCPF(user.cpf)) {
        return NextResponse.json({ error: 'Completar seu perfil com um CPF válido é obrigatório para faturamento.' }, { status: 400 });
    }

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
        isActive: false, 
        dealershipId: session.user.uid,
        status: 'awaiting_payment',
        expiresAt: new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000)
    });

    const externalRef = `BANNER:${newBanner._id}`;
    const description = `Anúncio Banner: ${title} (${durationDays} dias) — PIX`;

    const clientIp = (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '').split(',')[0].trim();
    const host = req.headers.get('host') || 'www.cnv0km.com.br';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;

    const fullName = (user.displayName || '').trim();
    const nameParts = fullName.split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
    const cpfDigits = (user.cpf || '').replace(/\D/g, '');

    const paymentBody: Record<string, any> = {
        transaction_amount: finalPrice,
        description,
        payment_method_id: 'pix',
        payer: {
            email: user.email || session.user.email,
            ...(firstName ? { first_name: firstName } : {}),
            ...(lastName ? { last_name: lastName } : {}),
            ...(cpfDigits.length === 11 ? { identification: { type: 'CPF', number: cpfDigits } } : {}),
        },
        external_reference: externalRef,
        notification_url: `${baseUrl}/api/webhooks/mercadopago`,
        statement_descriptor: 'ZEROKM BANNER',
        metadata: {
            bannerId: newBanner._id.toString(),
            type: 'banner-pix',
        },
    };

    const extraHeaders: Record<string, string> = {};
    if (clientIp) extraHeaders['X-Forwarded-For'] = clientIp;

    const payRes = await mpPost('/v1/payments', paymentBody, undefined, extraHeaders);

    if (!payRes.ok) {
        console.error('Erro ao criar PIX Banner:', JSON.stringify(payRes.data));
        return NextResponse.json({ error: payRes.data?.message || 'Erro ao gerar PIX' }, { status: 400 });
    }

    const txData = payRes.data?.point_of_interaction?.transaction_data;

    // Atualiza o banner com o ID do pagamento
    await Banner.findByIdAndUpdate(newBanner._id, {
        $set: { paymentId: payRes.data.id?.toString() }
    });

    return NextResponse.json({
        ok: true,
        paymentId: payRes.data.id,
        qrCode: txData?.qr_code || null,
        qrCodeBase64: txData?.qr_code_base64 || null,
        amount: finalPrice,
    });
}
