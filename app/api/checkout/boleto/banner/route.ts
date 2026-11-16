import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import { mpPost } from '@/lib/mercadopago';
import Banner from '@/models/Banner';
import { barrarAtendente } from '@/lib/services/acessoLoja';
import User from '@/models/User';
import mongoose from 'mongoose';
import { validateCPF } from '@/lib/utils/cpf';
import Concessionaria from '@/models/Concessionaria';
import { DEALERSHIP_PROFILES } from '@/lib/services/dealershipScope';
import { emitirBoletoConcessionaria } from '@/lib/services/cobrancaConcessionariaService';
import { BANNER_PREFIX, descricaoDaCobranca, lerValorCobranca, lerVencimentoBoleto, pagadorDaConcessionaria } from '@/lib/utils/cobrancaConcessionaria';

async function boletoDaConcessionaria(params: { req: NextRequest; user: any; loja: any; title: string; linkUrl?: string; imageUrl: string; uid: string }) {
    const { req, user, loja, title, linkUrl, imageUrl, uid } = params;

    // Antes de criar o banner: sem cadastro completo não há boleto, e não
    // pode sobrar um anúncio parado em "aguardando pagamento".
    const { pagador, faltando } = pagadorDaConcessionaria(loja);
    if (!pagador) {
        return NextResponse.json({
            error: `Para pagar por boleto, complete o cadastro da concessionária: ${faltando.join(', ')}.`,
            faltando,
            code: 'CADASTRO_INCOMPLETO',
        }, { status: 422 });
    }

    const bannerConfig = await mongoose.connection.useDb('zerokm').collection('configs').findOne({ key: 'banners' });
    const durationDays = bannerConfig?.duration_days || 1;
    const valor = lerValorCobranca((bannerConfig?.price_cents || 5000) / 100);
    if ('erro' in valor) return NextResponse.json({ error: valor.erro }, { status: 400 });
    const venc = lerVencimentoBoleto('');
    if ('erro' in venc) return NextResponse.json({ error: venc.erro }, { status: 400 });

    const banner = await Banner.create({
        title,
        imageUrl,
        linkUrl: linkUrl || '',
        isActive: false,
        dealershipId: uid,
        status: 'awaiting_payment',
        expiresAt: new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000),
    });

    const clientIp = (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '').split(',')[0].trim();
    const r = await emitirBoletoConcessionaria({
        concessionaria: loja,
        userId: user._id,
        tipo: 'banner',
        valor: valor.valor,
        vencimento: venc.vencimento,
        descricao: descricaoDaCobranca({ tipo: 'banner', descricao: `${title} (${durationDays} ${durationDays === 1 ? 'dia' : 'dias'})` }),
        externalReference: `${BANNER_PREFIX}${banner._id}`,
        emitidoPor: 'concessionaria',
        bannerId: banner._id.toString(),
        clientIp,
    });
    if (!r.ok) {
        await Banner.deleteOne({ _id: banner._id });
        return NextResponse.json({ error: r.error, faltando: r.faltando }, { status: r.status });
    }

    await Banner.findByIdAndUpdate(banner._id, { $set: { paymentId: String(r.payment.mpPaymentId) } });
    return NextResponse.json({
        ok: true,
        paymentId: r.payment.mpPaymentId,
        boletoUrl: r.payment.boletoUrl || null,
        boletoBarcode: r.payment.boletoBarcode || null,
        expiresAt: venc.vencimento.toISOString(),
        amount: valor.valor,
    });
}

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

    // Anúncio é pago: na concessionária, só o titular contrata.
    const recusa = await barrarAtendente(session, 'cobranca');
    if (recusa) return recusa;

    const user = await User.findOne({ firebaseUid: session.user.uid });
    if (!user) {
        return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    // Concessionária: quem paga o banner é a loja. O boleto sai com o CNPJ e o
    // endereço do cadastro dela (o usuário da loja quase nunca tem CPF no
    // perfil) e fica registrado nas cobranças da concessionária.
    const loja = DEALERSHIP_PROFILES.has(session.user.profile as string) && user.dealershipId
        ? await Concessionaria.findById(user.dealershipId).catch(() => null)
        : null;
    if (loja) return boletoDaConcessionaria({ req, user, loja, title, linkUrl, imageUrl, uid: session.user.uid });

    if (!user.cpf || !validateCPF(user.cpf)) {
        return NextResponse.json({ error: 'Completar seu perfil com um CPF válido é obrigatório para boleto.' }, { status: 400 });
    }

    const db = mongoose.connection.useDb('zerokm');
    const configCollection = db.collection('configs');
    const bannerConfig = await configCollection.findOne({ key: 'banners' });
    
    const priceCents = bannerConfig?.price_cents || 5000;
    const durationDays = bannerConfig?.duration_days || 1;
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
    const description = `Anúncio Banner: ${title} (${durationDays} dias) — Boleto`;

    const clientIp = (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '').split(',')[0].trim();
    const host = req.headers.get('host') || 'www.cnv0km.com.br';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;

    const fullName = (user.displayName || '').trim();
    const nameParts = fullName.split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
    const cpfDigits = (user.cpf || '').replace(/\D/g, '');

    // Boleto expiration Date (3 days)
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 3);

    const paymentBody: Record<string, any> = {
        transaction_amount: finalPrice,
        description,
        payment_method_id: 'bolbradesco',
        date_of_expiration: expirationDate.toISOString(),
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
            type: 'banner-boleto',
        },
    };

    const extraHeaders: Record<string, string> = {};
    if (clientIp) extraHeaders['X-Forwarded-For'] = clientIp;

    const payRes = await mpPost('/v1/payments', paymentBody, undefined, extraHeaders);

    if (!payRes.ok) {
        console.error('Erro ao criar Boleto Banner:', JSON.stringify(payRes.data));
        return NextResponse.json({ error: payRes.data?.message || 'Erro ao gerar boleto' }, { status: 400 });
    }

    await Banner.findByIdAndUpdate(newBanner._id, {
        $set: { paymentId: payRes.data.id?.toString() }
    });

    const txDetails = payRes.data?.transaction_details;

    return NextResponse.json({
        ok: true,
        paymentId: payRes.data.id,
        boletoUrl: txDetails?.external_resource_url || null,
        boletoBarcode: payRes.data?.barcode?.content || null,
        expiresAt: payRes.data?.date_of_expiration || expirationDate.toISOString(),
        amount: finalPrice,
    });
}
