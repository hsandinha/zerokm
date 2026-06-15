import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import { mpPost } from '@/lib/mercadopago';
import Plan from '@/models/Plan';
import User from '@/models/User';
import Invite from '@/models/Invite';
import Payment from '@/models/Payment';
import { validateCPF } from '@/lib/utils/cpf';

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.uid) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { planId, billingType: rawBillingType } = body;

    if (!planId) {
        return NextResponse.json({ error: 'planId obrigatório' }, { status: 400 });
    }

    const billingType: 'monthly' | 'annual' = rawBillingType === 'annual' ? 'annual' : 'monthly';

    await connectDB();

    const plan = await Plan.findById(planId);
    if (!plan || !plan.active) {
        return NextResponse.json({ error: 'Plano não encontrado ou inativo' }, { status: 404 });
    }

    const user = await User.findOne({ firebaseUid: session.user.uid });
    if (!user) {
        return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    if (!user.cpf || !validateCPF(user.cpf)) {
        return NextResponse.json({ error: 'Completar seu perfil com um CPF válido é obrigatório para faturamento.' }, { status: 400 });
    }

    // Calculate total amount (plan + invitees)
    // annualPrice é o valor TOTAL anual (ex.: R$ 7.188) — usar diretamente, sem * 12.
    const hasAnnualPrice = billingType === 'annual' && typeof plan.annualPrice === 'number' && plan.annualPrice > 0;
    let totalAmount = hasAnnualPrice ? (plan.annualPrice as number) : plan.price;
    let inviteesCount = 0;

    if (plan.invitePrice && plan.invitePrice > 0) {
        inviteesCount = await Invite.countDocuments({
            inviterId: user._id,
            status: { $in: ['pending', 'accepted'] },
        });
        if (inviteesCount > 0) {
            const invitePriceEffective = billingType === 'annual'
                ? plan.invitePrice * 12
                : plan.invitePrice;
            totalAmount += invitePriceEffective * inviteesCount;
        }
    }

    const externalRef = `${session.user.uid}:${planId}:${billingType}`;
    const billingLabel = billingType === 'annual' ? 'Anual' : 'Mensal';
    const description = `${plan.name} (${billingLabel})${inviteesCount > 0 ? ` + ${inviteesCount} Convidados` : ''} — PIX`;

    const baseUrlRaw = process.env.NEXTAUTH_URL || 'https://zerokm.vercel.app';
    const baseUrl = baseUrlRaw.includes('localhost') || baseUrlRaw.includes('127.0.0.1') ? 'https://zerokm.vercel.app' : baseUrlRaw;

    // Captura IP real (importante para antifraude e qualidade da integração MP)
    const clientIp = (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '').split(',')[0].trim();

    // Monta nome / payer rico (campos exigidos pela qualidade da integração MP).
    const fullName = (user.displayName || '').trim();
    const nameParts = fullName.split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

    const cpfDigits = (user.cpf || '').replace(/\D/g, '');
    const phoneDigits = (user.phoneNumber || '').replace(/\D/g, '');
    const phoneObj = phoneDigits.length >= 10
        ? { area_code: phoneDigits.slice(0, 2), number: phoneDigits.slice(2) }
        : undefined;

    // items[] com TODOS os campos que o painel MP pede para subir o score
    const items: Array<Record<string, any>> = [
        {
            id: plan._id.toString(),
            title: `Assinatura ${plan.name} (${billingLabel})`,
            description: plan.description || `Assinatura ${plan.name} (${billingLabel})`,
            quantity: 1,
            unit_price: hasAnnualPrice ? (plan.annualPrice as number) : plan.price,
            category_id: 'services',
        },
    ];
    if (inviteesCount > 0 && plan.invitePrice && plan.invitePrice > 0) {
        items.push({
            id: `invite-${plan._id.toString()}`,
            title: `Convidados (${inviteesCount})`,
            description: 'Taxa por usuário convidado',
            quantity: inviteesCount,
            unit_price: billingType === 'annual' ? plan.invitePrice * 12 : plan.invitePrice,
            category_id: 'services',
        });
    }

    // additional_info — usado pelo motor de antifraude e pela qualidade da integração
    const additionalInfo: Record<string, any> = {
        items,
        payer: {
            ...(firstName ? { first_name: firstName } : {}),
            ...(lastName ? { last_name: lastName } : {}),
            ...(phoneObj ? { phone: phoneObj } : {}),
            ...((user as any).createdAt ? { registration_date: new Date((user as any).createdAt).toISOString() } : {}),
            is_first_purchase_online: true,
            ...(user.address && (user.address.zipCode || user.address.street)
                ? {
                    address: {
                        zip_code: (user.address.zipCode || '').replace(/\D/g, ''),
                        street_name: user.address.street || '',
                        street_number: user.address.number || '',
                    },
                }
                : {}),
        },
    };
    if (user.address && user.address.state) {
        additionalInfo.shipments = {
            receiver_address: {
                zip_code: (user.address.zipCode || '').replace(/\D/g, ''),
                street_name: user.address.street || '',
                street_number: user.address.number || '',
                city_name: user.address.city || '',
                state_name: user.address.state || '',
            },
        };
    }

    // Create a direct PIX payment via Mercado Pago Payments API
    const paymentBody: Record<string, any> = {
        transaction_amount: totalAmount,
        description,
        payment_method_id: 'pix',
        payer: {
            email: user.email || session.user.email,
            ...(firstName ? { first_name: firstName } : {}),
            ...(lastName ? { last_name: lastName } : {}),
            ...(cpfDigits.length === 11
                ? { identification: { type: 'CPF', number: cpfDigits } }
                : {}),
            ...(phoneObj ? { phone: phoneObj } : {}),
        },
        external_reference: externalRef,
        notification_url: `${baseUrl}/api/webhooks/mercadopago`,
        statement_descriptor: 'ZEROKM',
        additional_info: additionalInfo,
        metadata: {
            userId: user._id.toString(),
            planId: plan._id.toString(),
            type: 'pix-inline',
            billing_type: billingType,
        },
    };

    const extraHeaders: Record<string, string> = {};
    if (clientIp) extraHeaders['X-Forwarded-For'] = clientIp;

    const payRes = await mpPost('/v1/payments', paymentBody, undefined, extraHeaders);

    if (!payRes.ok) {
        console.error('Erro ao criar pagamento PIX:', JSON.stringify(payRes.data));
        return NextResponse.json({
            error: payRes.data?.message || 'Erro ao gerar PIX',
        }, { status: 400 });
    }

    const txData = payRes.data?.point_of_interaction?.transaction_data;

    // Register pending payment
    try {
        await Payment.create({
            userId: user._id,
            planId: plan._id,
            mpPaymentId: payRes.data.id?.toString(),
            externalReference: externalRef,
            method: 'pix',
            status: 'pending',
            amount: totalAmount,
            currency: 'BRL',
            billingType,
            payerEmail: user.email || session.user.email,
            payerName: user.displayName,
        });
    } catch (err) {
        console.error('Erro ao registrar Payment PIX pendente:', err);
    }

    return NextResponse.json({
        ok: true,
        paymentId: payRes.data.id,
        qrCode: txData?.qr_code || null,
        qrCodeBase64: txData?.qr_code_base64 || null,
        ticketUrl: txData?.ticket_url || null,
        expiresAt: payRes.data.date_of_expiration || null,
        amount: totalAmount,
    });
}
