import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/authOptions';
import connectDB from '../../../../lib/mongodb';
import { createPreference } from '../../../../lib/mercadopago';
import Plan from '../../../../models/Plan';
import User from '../../../../models/User';
import Payment from '../../../../models/Payment';
import Invite from '../../../../models/Invite';

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.uid) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { planId, billingType } = body;

    if (!planId || typeof planId !== 'string') {
        return NextResponse.json({ error: 'planId inválido' }, { status: 400 });
    }

    const billing: 'monthly' | 'annual' = billingType === 'annual' ? 'annual' : 'monthly';

    await connectDB();

    const plan = await Plan.findById(planId);
    if (!plan || !plan.active) {
        return NextResponse.json({ error: 'Plano não encontrado ou inativo' }, { status: 404 });
    }

    const user = await User.findOne({ firebaseUid: session.user.uid });
    if (!user) {
        return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    // Calcular preço baseado no tipo de cobrança
    let finalPrice = plan.price;
    let description = plan.name;

    if (billing === 'annual' && plan.annualPrice && plan.annualPrice > 0) {
        finalPrice = plan.annualPrice;
        description = `${plan.name} — Plano Anual`;
    } else {
        description = `${plan.name} — Plano Mensal`;
    }

    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
        return NextResponse.json({ error: 'Configuração de pagamento ausente' }, { status: 500 });
    }

    const host = req.headers.get('host') || 'www.cnv0km.com.br';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;
    const externalRef = `${session.user.uid}:${planId}:${billing}`;

    const mpItems: any[] = [
        {
            // id + category_id são requisitos do MP para melhorar aprovação
            // (aparecem no painel "Qualidade da integração" como pendentes
            // até estarem presentes em todas as preferências).
            id: plan._id.toString(),
            title: description,
            description: plan.description || description,
            quantity: 1,
            currency_id: 'BRL',
            unit_price: finalPrice,
            category_id: 'services',
        }
    ];

    let totalAmount = finalPrice;

    // Check for active invitees
    if (plan.invitePrice && plan.invitePrice > 0) {
        const activeInvites = await Invite.countDocuments({
            inviterId: user._id,
            status: { $in: ['pending', 'accepted'] },
        });

        if (activeInvites > 0) {
            // Se o plano for anual, o valor do convidado tbm deve cobrir 12 meses?
            // De acordo com a regra padrão, cobrar proporcional/multiplicado ao billing.
            const invitePriceFinal = billing === 'annual' ? plan.invitePrice * 12 : plan.invitePrice;
            
            mpItems.push({
                id: `invite-${plan._id.toString()}`,
                title: `Acesso Convidado Extras (${activeInvites} un)`,
                description: `Taxa de usuários convidados do plano (${activeInvites}x)`,
                quantity: activeInvites,
                currency_id: 'BRL',
                unit_price: invitePriceFinal,
                category_id: 'services',
            });
            
            totalAmount += (invitePriceFinal * activeInvites);
        }
    }

    const preference = {
        items: mpItems,
        payer: {
            email: session.user.email,
            ...(user.displayName ? { name: user.displayName } : {}),
            ...(user.cpf ? {
                identification: {
                    type: 'CPF',
                    number: user.cpf.replace(/\D/g, ''),
                },
            } : {}),
        },
        // Habilitar TODOS os métodos de pagamento
        payment_methods: {
            installments: 12, // Até 12x no cartão de crédito
        },
        back_urls: {
            success: `${baseUrl}/dashboard/cliente?payment=success`,
            failure: `${baseUrl}/dashboard/cliente?payment=failure`,
            pending: `${baseUrl}/dashboard/cliente?payment=pending`,
        },
        auto_return: 'approved',
        external_reference: externalRef,
        notification_url: `${baseUrl}/api/webhooks/mercadopago`,
        statement_descriptor: 'ZEROKM',
        expires: true,
        expiration_date_from: new Date().toISOString(),
        expiration_date_to: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h
    };

    const mpRes = await createPreference(preference);

    if (!mpRes.ok) {
        console.error('Erro Mercado Pago:', JSON.stringify(mpRes.data));
        return NextResponse.json({ error: 'Erro ao criar preferência de pagamento' }, { status: 500 });
    }

    // Registrar Payment pendente no banco
    try {
        await Payment.create({
            userId: user._id,
            planId: plan._id,
            mpPreferenceId: mpRes.data.id,
            externalReference: externalRef,
            method: 'pending', // Será atualizado pelo webhook quando o pagamento for feito
            status: 'pending',
            amount: totalAmount,
            currency: 'BRL',
            billingType: billing,
            payerEmail: session.user.email,
            payerName: user.displayName,
        });
    } catch (err) {
        // Não bloquear o checkout se o registro falhar
        console.error('Erro ao registrar Payment pendente:', err);
    }

    return NextResponse.json({
        init_point: mpRes.data.init_point,
        sandbox_init_point: mpRes.data.sandbox_init_point,
        preference_id: mpRes.data.id,
    });
}
