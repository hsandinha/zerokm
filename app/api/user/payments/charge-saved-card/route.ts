import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import Plan from '@/models/Plan';
import Invite from '@/models/Invite';
import Payment from '@/models/Payment';
import Transaction from '@/models/Transaction';
import { validateCPF } from '@/lib/utils/cpf';
import { chargeCustomerCard, getPayment, mpGet, mpPut } from '@/lib/mercadopago';

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.uid) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { planId, cvv, cardToken, billingType: rawBillingType, deviceId } = await req.json().catch(() => ({}));

    // Captura o IP real do usuário. Crucial para o antifraude do MP quando a
    // chamada é feita server-side. Sem o IP real, o MP vê o IP da Vercel
    // e invalida o X-Meli-Session-Id (resultando em security:none e high_risk).
    const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '';

    // DEBUG: confirma quais campos chegaram do frontend (remove após resolver security:none)
    console.log('[charge-saved-card] payload recebido:', {
        hasCardToken: !!cardToken,
        hasDeviceId: !!deviceId,
        deviceIdValue: deviceId ? `${String(deviceId).slice(0, 8)}...` : 'AUSENTE',
        hasCvv: !!cvv,
        clientIp: clientIp ? `${clientIp.split(',')[0]}...` : 'AUSENTE',
    });

    if (!planId) {
        return NextResponse.json({ error: 'Faltam dados: planId' }, { status: 400 });
    }

    // Front deve preferir enviar `cardToken` (pré-gerado com MP SDK v2 no
    // browser do usuário — carrega device_id/IP reais). `cvv` fica como
    // fallback server-side (pior pro antifraude, mas mantém compatibilidade).
    if (!cardToken && !cvv) {
        return NextResponse.json({ error: 'Informe o CVV ou um token do cartão.' }, { status: 400 });
    }


    const billingType: 'monthly' | 'annual' = rawBillingType === 'annual' ? 'annual' : 'monthly';

    await connectDB();
    const user = await User.findOne({ firebaseUid: session.user.uid });
    if (!user) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

    if (!user.cpf || !validateCPF(user.cpf)) {
        return NextResponse.json({ error: 'Completar seu perfil com um CPF válido é obrigatório para faturamento.' }, { status: 400 });
    }

    if (!user.mpCustomerId || !user.creditCard?.mpCardId) {
        return NextResponse.json({ error: 'Nenhum cartão salvo encontrado.' }, { status: 400 });
    }

    const plan = await Plan.findById(planId);
    if (!plan) return NextResponse.json({ error: 'Plano não encontrado' }, { status: 404 });

    // Math for total sum exactly as Cron does
    let inviteesFee = 0;
    const activeInvitesCount = await Invite.countDocuments({
        inviterId: user._id,
        status: { $in: ['pending', 'accepted'] },
    });

    if (plan.invitePrice && activeInvitesCount > 0) {
        // Anual: taxa de convidado multiplicada por 12 meses
        const invitePriceEffective = billingType === 'annual'
            ? plan.invitePrice * 12
            : plan.invitePrice;
        inviteesFee = invitePriceEffective * activeInvitesCount;
    }

    // Preço base conforme o tipo de cobrança
    // annualPrice é o valor TOTAL anual (ex.: R$ 7.188) — usar diretamente, sem * 12.
    const hasAnnualPrice = billingType === 'annual' && typeof plan.annualPrice === 'number' && plan.annualPrice > 0;
    const basePrice = hasAnnualPrice
        ? (plan.annualPrice as number)
        : plan.price;

    const totalAmount = basePrice + inviteesFee;
    const billingLabel = billingType === 'annual' ? 'Anual' : 'Mensal';

    // Separa nome em first / last para o antifraude do MP.
    // CRÍTICO: usamos o nome do TITULAR DO CARTÃO (user.creditCard.holderName),
    // não o nome do dono da conta (user.displayName). O MP cruza o payer.first_name /
    // last_name com o nome impresso no cartão que está no token; se não bater,
    // sobe o score de risco e cai em cc_rejected_high_risk.
    // Fallback para displayName só quando o holderName não está disponível.
    const holderName = ((user.creditCard as any)?.holderName || '').trim();
    const fullName = (holderName || user.displayName || '').trim();
    const nameParts = fullName.split(/\s+/);
    const firstName = nameParts[0] || undefined;
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined;

    const baseUrlRaw = process.env.NEXTAUTH_URL || 'https://zerokm.vercel.app';
    const baseUrl = baseUrlRaw.includes('localhost') || baseUrlRaw.includes('127.0.0.1') ? 'https://zerokm.vercel.app' : baseUrlRaw;

    const itemsDescription = `Assinatura ${plan.name} (${billingLabel})`;
    const items = [
        {
            id: plan._id.toString(),
            title: itemsDescription,
            description: plan.description || itemsDescription,
            quantity: 1,
            unit_price: basePrice,
            category_id: 'services',
        },
        ...(activeInvitesCount > 0 && plan.invitePrice
            ? [{
                id: `invite-${plan._id.toString()}`,
                title: `Convidados (${activeInvitesCount})`,
                description: `Taxa por usuário convidado`,
                quantity: activeInvitesCount,
                unit_price: (billingType === 'annual' ? plan.invitePrice * 12 : plan.invitePrice),
                category_id: 'services',
            }]
            : []),
    ];

    // Valida que o mpCustomerId ainda existe no ACCESS_TOKEN atual.
    // Customers no MP são escopados POR APP (não por seller), então se
    // o merchant migrar de uma app MP para outra (ex.: CheckoutPro →
    // CheckoutTransparente), todos os customers guardados no MongoDB
    // ficam "stale" — existem no banco local, mas o MP responde 404.
    // Nesse caso, o cartão também é stale (está linkado ao customer
    // antigo), então o único caminho é pedir pro usuário re-salvar.
    const customerCheck = await mpGet(`/v1/customers/${user.mpCustomerId}`);
    if (!customerCheck.ok && customerCheck.status === 404) {
        console.warn('[charge-saved-card] mpCustomerId stale — limpando do MongoDB:', {
            stale: user.mpCustomerId,
            cardId: (user.creditCard as any)?.mpCardId,
        });
        await User.updateOne(
            { firebaseUid: session.user.uid },
            { $unset: { mpCustomerId: '', creditCard: '' } }
        );
        return NextResponse.json(
            {
                error: 'Seu cartão salvo expirou e precisa ser cadastrado novamente.',
                reason: 'stale_customer',
            },
            { status: 400 }
        );
    }

    // Sincronizar perfil do customer MP ANTES de cobrar.
    // CRÍTICO: quando cobramos com payer.type='customer' + id, o MP usa os dados
    // do perfil armazenado (email, first_name, identification, phone) para o
    // antifraude. Se o perfil estiver vazio (customer antigo criado só com
    // email), o payer sai null na resposta do /v1/payments e a transação cai
    // em cc_rejected_high_risk.
    //
    // Esta sincronização ocorre a cada cobrança porque (a) usuários podem
    // atualizar CPF/telefone/endereço no perfil após salvar o cartão, e
    // (b) customers criados antes deste fix vieram sem os campos.
    try {
        const nameFromUser = (user.displayName || '').trim().split(/\s+/);
        // NÃO incluir `email` aqui — o MP trata email como imutável em
        // PUT /v1/customers/{id} e retorna 400 "invalid parameters" se enviar.
        // Campos editáveis suportados: first_name, last_name, phone,
        // identification, address, description, default_card, default_address.
        const profileUpdate: Record<string, any> = {
            first_name: nameFromUser[0] || firstName || '',
            last_name: nameFromUser.slice(1).join(' ') || lastName || '',
        };
        const cpfDigitsForProfile = (user.cpf || '').replace(/\D/g, '');
        if (cpfDigitsForProfile.length === 11) {
            profileUpdate.identification = { type: 'CPF', number: cpfDigitsForProfile };
        }
        const phoneDigitsForProfile = (user.phoneNumber || '').replace(/\D/g, '');
        if (phoneDigitsForProfile.length >= 10) {
            profileUpdate.phone = {
                area_code: phoneDigitsForProfile.slice(0, 2),
                number: phoneDigitsForProfile.slice(2),
            };
        }
        // Endereço do customer — alguns motores antifraude do MP usam como
        // sinal adicional além de additional_info.shipments.receiver_address.
        //
        // ATENÇÃO: o MP exige `street_number` como Int64 (inteiro), não string.
        // Se o número tem letras (ex.: "177A") ou é "s/n", o parseInt pode
        // truncar ou virar NaN — nesses casos, omitimos o campo para evitar
        // 400 "bad_request". Mandar apenas zip_code + street_name ainda ajuda
        // o antifraude.
        if (user.address && (user.address.zipCode || user.address.street)) {
            const addressBlock: Record<string, any> = {
                zip_code: (user.address.zipCode || '').replace(/\D/g, ''),
                street_name: user.address.street || '',
            };
            const rawNumber = String(user.address.number || '').replace(/\D/g, '');
            if (rawNumber.length > 0) {
                const parsedNumber = parseInt(rawNumber, 10);
                if (Number.isFinite(parsedNumber) && parsedNumber > 0) {
                    addressBlock.street_number = parsedNumber;
                }
            }
            profileUpdate.address = addressBlock;
        }

        const putRes = await mpPut(`/v1/customers/${user.mpCustomerId}`, profileUpdate);
        if (!putRes.ok) {
            console.error('[charge-saved-card] Falha ao sincronizar perfil do customer MP:', JSON.stringify({
                customerId: user.mpCustomerId,
                status: putRes.status,
                response: putRes.data,
                sent: profileUpdate,
            }, null, 2));
        } else {
            console.log('[charge-saved-card] Perfil do customer MP sincronizado:', {
                customerId: user.mpCustomerId,
                email: (putRes.data as any)?.email,
                first_name: (putRes.data as any)?.first_name,
                last_name: (putRes.data as any)?.last_name,
                identification: (putRes.data as any)?.identification,
                phone: (putRes.data as any)?.phone,
            });
        }
    } catch (err) {
        // Não bloquear: se a sync falhar, o antifraude pode ainda aprovar
        // com base em additional_info.payer. Mas logar para diagnóstico.
        console.error('[charge-saved-card] Exceção ao sincronizar perfil do customer MP:', err);
    }

    // Cobrar via cartão salvo (com CVV para gerar token)
    // external_reference segue o mesmo padrão do PIX (firebaseUid:planId:billingType)
    // para permitir que o webhook saiba o billingType mesmo se o metadata falhar.
    const externalRefMP = `${session.user.uid}:${plan._id.toString()}:${billingType}`;

    // is_first_purchase_online — sinal forte para antifraude. Calcula via histórico
    // de pagamentos aprovados (não conta tentativas recusadas).
    const previousApproved = await Payment.countDocuments({
        userId: user._id,
        status: 'approved',
    });
    const isFirstPurchaseOnline = previousApproved === 0;

    const payRes = await chargeCustomerCard({
        customerId: user.mpCustomerId,
        cardId: (user.creditCard as any).mpCardId,
        paymentMethodId: (user.creditCard as any).brand || 'visa',
        // cardToken (pré-gerado no browser) tem prioridade sobre CVV (fallback).
        cardToken: typeof cardToken === 'string' && cardToken.length > 0 ? cardToken : undefined,
        securityCode: cvv || undefined,
        email: user.email,
        amount: totalAmount,
        description: `Cobrança Imediata: ${plan.name} (${billingLabel})${activeInvitesCount > 0 ? ` + ${activeInvitesCount} Convidados` : ''}`,
        metadata: { userId: user._id.toString(), planId: plan._id.toString(), type: 'manual-renewal', billing_type: billingType },
        externalReference: externalRefMP,

        // Dados adicionais para antifraude MP (reduz cc_rejected_high_risk)
        firstName,
        lastName,
        cpf: user.cpf,
        phone: user.phoneNumber,
        address: user.address
            ? {
                zipCode: user.address.zipCode,
                street: user.address.street,
                number: user.address.number,
                neighborhood: user.address.neighborhood,
                city: user.address.city,
                state: user.address.state,
            }
            : undefined,
        items,
        statementDescriptor: 'ZEROKM',
        notificationUrl: `${baseUrl}/api/webhooks/mercadopago`,
        deviceId: typeof deviceId === 'string' && deviceId.length > 0 ? deviceId : undefined,
        clientIp: clientIp ? clientIp.split(',')[0].trim() : undefined,
        registrationDate: (user as any).createdAt
            ? new Date((user as any).createdAt).toISOString()
            : undefined,
        isFirstPurchaseOnline,
    });

    let mpStatus: string | undefined = payRes.data?.status;
    let mpStatusDetail: string | undefined = payRes.data?.status_detail;
    const mpPaymentId = payRes.data?.id ? String(payRes.data.id) : '';

    // Re-check: o MP frequentemente retorna `in_process`/`pending` na resposta
    // síncrona do POST /v1/payments e, em milissegundos, atualiza para
    // `approved` ou `rejected`. Sem esse re-check, o front mostra "em análise"
    // falso por 3–5s (até o polling do /api/checkout/status pegar o status
    // real). Com o re-check, já retornamos o status final para o usuário.
    if (mpPaymentId && (mpStatus === 'in_process' || mpStatus === 'pending')) {
        // Delay breve: dá tempo do motor de risco do MP concluir a avaliação.
        await new Promise(resolve => setTimeout(resolve, 1500));
        const recheck = await getPayment(mpPaymentId);
        if (recheck.ok && recheck.data?.status) {
            mpStatus = recheck.data.status;
            mpStatusDetail = recheck.data.status_detail;
            console.log('[charge-saved-card] re-check pós POST /v1/payments:', {
                paymentId: mpPaymentId,
                statusInicial: payRes.data?.status,
                statusFinal: mpStatus,
                statusDetail: mpStatusDetail,
            });
        }
    }

    // Pagamento aprovado → ativa assinatura e registra "Pago" no extrato
    if (payRes.ok && mpStatus === 'approved') {
        // Calcular nova expiração baseada na data de vencimento original
        // Se venceu dia 9 e pagou dia 12, próxima renovação é dia 09+30 (ou +1 ano para anual)
        const currentExpiry = user.subscription?.expiresAt ? new Date(user.subscription.expiresAt) : null;
        let newExpiry: Date;

        const bumpExpiry = (base: Date) => {
            const d = new Date(base);
            if (billingType === 'annual') {
                d.setFullYear(d.getFullYear() + 1);
            } else {
                d.setDate(d.getDate() + 30);
            }
            return d;
        };

        if (currentExpiry && currentExpiry.getTime() < Date.now()) {
            // Plano vencido: renovar a partir da data de vencimento original
            newExpiry = bumpExpiry(currentExpiry);
        } else {
            // Primeira assinatura ou plano ainda ativo
            newExpiry = bumpExpiry(new Date());
        }

        await User.findByIdAndUpdate(user._id, {
            $set: {
                'subscription.planId': plan._id.toString(),
                'subscription.expiresAt': newExpiry,
                'subscription.status': 'active',
                'subscription.billingType': billingType,
                'subscription.activationMethod': 'card',
                'defaultProfile': 'cliente',
                legacyRole: 'cliente',
                credits: 0,
            },
            $addToSet: {
                allowedProfiles: 'cliente'
            }
        });

        await Payment.findOneAndUpdate(
            { mpPaymentId },
            {
                $set: {
                    userId: user._id,
                    planId: plan._id,
                    mpPaymentId,
                    externalReference: externalRefMP,
                    method: 'credit_card',
                    status: 'approved',
                    statusDetail: mpStatusDetail,
                    amount: totalAmount,
                    currency: 'BRL',
                    billingType,
                    payerEmail: user.email,
                },
            },
            { upsert: true }
        );

        // Registrar no extrato financeiro
        const now = new Date();
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        await Transaction.findOneAndUpdate(
            { referenceId: mpPaymentId },
            {
                $set: {
                    userId: user._id,
                    type: 'subscription',
                    description: `Pagamento — ${plan.name} (${billingLabel}) via Cartão de Crédito`,
                    amount: totalAmount,
                    referenceId: mpPaymentId,
                    month,
                    status: 'paid',
                },
            },
            { upsert: true }
        );

        return NextResponse.json({ ok: true, status: 'approved' });
    }

    // Pagamento em análise (antifraude, autorização pendente)
    // Não ativa assinatura, não libera perfil "cliente", registra extrato como "pendente".
    // A promoção para "paid"/"active" só acontece no webhook quando o MP confirmar.
    if (payRes.ok && (mpStatus === 'in_process' || mpStatus === 'pending' || mpStatus === 'authorized')) {
        await Payment.findOneAndUpdate(
            { mpPaymentId },
            {
                $set: {
                    userId: user._id,
                    planId: plan._id,
                    mpPaymentId,
                    externalReference: externalRefMP,
                    method: 'credit_card',
                    status: mpStatus,
                    statusDetail: mpStatusDetail,
                    amount: totalAmount,
                    currency: 'BRL',
                    billingType,
                    payerEmail: user.email,
                },
            },
            { upsert: true }
        );

        const now = new Date();
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        await Transaction.findOneAndUpdate(
            { referenceId: mpPaymentId },
            {
                $set: {
                    userId: user._id,
                    type: 'subscription',
                    description: `Pagamento — ${plan.name} (${billingLabel}) via Cartão de Crédito (em análise)`,
                    amount: totalAmount,
                    referenceId: mpPaymentId,
                    month,
                    status: 'pending',
                },
            },
            { upsert: true }
        );

        return NextResponse.json({
            ok: true,
            status: mpStatus,
            pending: true,
            paymentId: mpPaymentId,
            message: 'Pagamento em análise. Assim que aprovado, o acesso é liberado automaticamente.',
        });
    }

    // Pagamento recusado / erro — log completo para Vercel, incluindo o payload bruto
    console.error('[charge-saved-card] Pagamento recusado:', JSON.stringify({
        httpStatus: payRes.status,
        mpStatus,
        statusDetail: mpStatusDetail,
        cause: payRes.data?.cause,
        message: payRes.data?.message,
        errorCode: payRes.data?.error,
        rawData: payRes.data,
    }, null, 2));

    // Persistir o Payment recusado para rastreabilidade (se houver id do MP)
    if (mpPaymentId) {
        await Payment.findOneAndUpdate(
            { mpPaymentId },
            {
                $set: {
                    userId: user._id,
                    planId: plan._id,
                    mpPaymentId,
                    externalReference: externalRefMP,
                    method: 'credit_card',
                    status: 'rejected',
                    statusDetail: mpStatusDetail,
                    amount: totalAmount,
                    currency: 'BRL',
                    billingType,
                    payerEmail: user.email,
                },
            },
            { upsert: true }
        );
    }

    // Mapeia status_detail do Mercado Pago para mensagens em PT-BR.
    // Lista baseada em: https://www.mercadopago.com.br/developers/pt/docs/checkout-api/response-handling/collection-results
    const MP_STATUS_DETAIL_PT: Record<string, string> = {
        cc_rejected_bad_filled_card_number: 'Número do cartão inválido.',
        cc_rejected_bad_filled_date: 'Data de validade incorreta.',
        cc_rejected_bad_filled_other: 'Dados do cartão incorretos. Revise e tente novamente.',
        cc_rejected_bad_filled_security_code: 'Código de segurança (CVV) inválido.',
        cc_rejected_blacklist: 'Cartão não autorizado para esta transação.',
        cc_rejected_call_for_authorize: 'Autorização necessária — ligue para o banco emissor para autorizar o pagamento.',
        cc_rejected_card_disabled: 'Cartão inativo — entre em contato com o banco emissor.',
        cc_rejected_card_error: 'Erro ao processar o cartão. Tente novamente.',
        cc_rejected_duplicated_payment: 'Pagamento duplicado. Aguarde alguns minutos antes de tentar novamente.',
        cc_rejected_high_risk: 'Pagamento recusado por análise de risco. Tente outro cartão ou entre em contato com seu banco.',
        cc_rejected_insufficient_amount: 'Saldo ou limite insuficiente no cartão.',
        cc_rejected_invalid_installments: 'Número de parcelas não suportado pelo cartão.',
        cc_rejected_max_attempts: 'Número máximo de tentativas excedido. Tente novamente mais tarde.',
        cc_rejected_other_reason: 'Banco emissor recusou a transação. Entre em contato com seu banco ou tente outro cartão.',
        cc_rejected_3ds_mandatory: 'Autenticação adicional 3D-Secure necessária.',
        cc_rejected_3ds_challenge: 'Autenticação 3D-Secure não concluída.',
    };

    const humanReason =
        (mpStatusDetail && MP_STATUS_DETAIL_PT[mpStatusDetail])
        || payRes.data?.cause?.[0]?.description
        || payRes.data?.message
        || (mpStatusDetail ? `Pagamento recusado (${mpStatusDetail}).` : 'Falha na cobrança com este cartão.');

    return NextResponse.json({ error: humanReason, statusDetail: mpStatusDetail }, { status: 400 });
}
