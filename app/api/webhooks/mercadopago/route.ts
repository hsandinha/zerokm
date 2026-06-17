import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import connectDB from '../../../../lib/mongodb';
import { getAuthorizedPayment, getPayment, getPreapproval } from '../../../../lib/mercadopago';
import Plan from '../../../../models/Plan';
import User from '../../../../models/User';
import Payment from '../../../../models/Payment';
import Transaction from '../../../../models/Transaction';
import Invite from '../../../../models/Invite';
import {
    activateSubscriptionAccess,
    addBillingPeriod,
    normalizeBillingType,
    parseSubscriptionExternalReference,
} from '../../../../lib/services/mercadoPagoSubscriptionService';
import Banner from '../../../../models/Banner';

/**
 * Webhook do Mercado Pago
 *
 * Recebe notificações de pagamento e atualiza:
 * 1. Payment (histórico de pagamentos)
 * 2. User (assinatura / créditos)
 * 3. Transaction (extrato financeiro)
 * 4. Convites (propagar assinatura)
 */
/**
 * GET /api/webhooks/mercadopago
 *
 * Validação de acessibilidade da URL pelo painel do Mercado Pago.
 * O MP faz um GET antes de registrar/testar o webhook — precisa retornar 200.
 */
export async function GET() {
    return NextResponse.json({ ok: true, service: 'zerokm-webhook' });
}

/**
 * Valida a autenticidade de um webhook do Mercado Pago via HMAC-SHA256.
 *
 * Algoritmo (conforme docs MP):
 *   manifest = `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 *   esperado = HMAC_SHA256(manifest, MP_WEBHOOK_SECRET) em hex
 *   comparar com o valor `v1=` do header `x-signature`
 *
 * Retorna true se a assinatura bate OU se o secret não está configurado
 * (fallback gracioso pra ambientes onde a chave ainda não foi setada).
 * Retorna false APENAS se o secret existe + headers existem + hash não bate
 * (indicando tentativa de forjar webhook).
 */
function validateMPSignature(req: NextRequest, body: Record<string, any>): { valid: boolean; reason?: string } {
    const secret = process.env.MP_WEBHOOK_SECRET;
    if (!secret) {
        // Secret não configurado — modo compatibilidade (não bloqueia)
        return { valid: true, reason: 'secret-not-set' };
    }

    const xSignature = req.headers.get('x-signature');
    const xRequestId = req.headers.get('x-request-id');

    if (!xSignature || !xRequestId) {
        // Sem headers de assinatura — provavelmente ping de teste ou MP legado.
        // Aceitamos (o alternativo seria bloquear todos os pings de teste).
        console.log('[Webhook] Sem headers de assinatura — aceitando request');
        return { valid: true, reason: 'no-signature-headers' };
    }

    // Parse "ts=123,v1=abc..."
    const parts = xSignature.split(',').reduce((acc, part) => {
        const [k, v] = part.trim().split('=');
        if (k && v) acc[k] = v;
        return acc;
    }, {} as Record<string, string>);

    const ts = parts.ts;
    const v1 = parts.v1;
    if (!ts || !v1) {
        return { valid: false, reason: 'malformed-signature-header' };
    }

    // O ID do recurso pode vir em três formatos diferentes, dependendo de qual
    // sistema de notificação do MP está disparando o request:
    //   1. Webhooks novo (preferido):  ?data.id=123  + body { data: { id: 123 } }
    //   2. Webhooks via body apenas:   body { data: { id: 123 } } (ping simulado)
    //   3. IPN legado:                 ?id=123&topic=payment  (quando IPN está ativo no painel)
    //
    // O MP calcula a assinatura HMAC usando SEMPRE o VALOR do ID, independente
    // do nome do parâmetro. Então usar `id` como fallback é seguro — se o hash
    // bater, é autêntico; se não bater, rejeitamos por hash-mismatch normalmente.
    const url = new URL(req.url);
    const dataIdFromUrl = url.searchParams.get('data.id');
    const legacyIdFromUrl = url.searchParams.get('id');
    const dataIdFromBody = body?.data?.id ? String(body.data.id) : '';
    const dataId = dataIdFromUrl || dataIdFromBody || legacyIdFromUrl;
    if (!dataId) {
        return { valid: false, reason: 'missing-data-id' };
    }

    const dataIdForManifest = dataIdFromUrl && /[A-Za-z]/.test(dataIdFromUrl)
        ? dataIdFromUrl.toLowerCase()
        : dataId;
    const manifest = `id:${dataIdForManifest};request-id:${xRequestId};ts:${ts};`;
    const computed = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

    try {
        const match = crypto.timingSafeEqual(
            Buffer.from(computed, 'hex') as unknown as Uint8Array,
            Buffer.from(v1, 'hex') as unknown as Uint8Array
        );
        return { valid: match, reason: match ? 'ok' : 'hash-mismatch' };
    } catch {
        // Tamanhos diferentes → Buffer.from falha no timingSafeEqual
        return { valid: false, reason: 'hash-length-mismatch' };
    }
}

async function findUserForSubscription(preapprovalId: string | null, externalReference: unknown) {
    const parsed = parseSubscriptionExternalReference(externalReference);
    if (parsed?.firebaseUid) {
        const user = await User.findOne({ firebaseUid: parsed.firebaseUid });
        if (user) return { user, parsed };
    }

    if (preapprovalId) {
        const user = await User.findOne({ 'subscription.mpPreapprovalId': preapprovalId });
        if (user) return { user, parsed: null };
    }

    return { user: null, parsed };
}

async function handleSubscriptionPreapproval(preapprovalId: string) {
    if (!preapprovalId) return NextResponse.json({ ok: true });

    const preapprovalRes = await getPreapproval(preapprovalId);
    if (!preapprovalRes.ok) {
        console.error('[Webhook] Erro ao buscar preapproval MP:', preapprovalId, preapprovalRes.data);
        return NextResponse.json({ ok: true });
    }

    await connectDB();

    const preapproval = preapprovalRes.data as any;
    const { user, parsed } = await findUserForSubscription(preapprovalId, preapproval.external_reference);
    if (!user) {
        console.error('[Webhook] Usuário da assinatura não encontrado:', preapprovalId, preapproval.external_reference);
        return NextResponse.json({ ok: true });
    }

    const planId = parsed?.planId || user.subscription?.planId;
    const billingType = normalizeBillingType(parsed?.billingType || user.subscription?.billingType);
    const preapprovalStatus = String(preapproval.status || 'pending');
    const nextPaymentDate = preapproval.next_payment_date ? new Date(preapproval.next_payment_date) : null;

    await User.findByIdAndUpdate(user._id, {
        $set: {
            'subscription.mpPreapprovalId': preapprovalId,
            'subscription.mpPreapprovalStatus': preapprovalStatus,
            'subscription.billingType': billingType,
            'subscription.activationMethod': 'card',
            ...(planId ? { 'subscription.planId': String(planId) } : {}),
            ...(nextPaymentDate ? { 'subscription.nextPaymentDate': nextPaymentDate } : {}),
        },
    });

    if ((preapprovalStatus === 'authorized' || preapproval.card_id) && planId) {
        const plan = await Plan.findById(planId);
        if (plan?.active && plan.type === 'monthly') {
            const currentExpiry = user.subscription?.expiresAt ? new Date(user.subscription.expiresAt) : null;
            const expiresAt = currentExpiry && currentExpiry.getTime() > Date.now()
                ? currentExpiry
                : addBillingPeriod(new Date(), billingType);

            await activateSubscriptionAccess({
                userId: user._id,
                planId: String(planId),
                billingType,
                expiresAt,
                activationMethod: 'card',
                mpPreapprovalId: preapprovalId,
                mpPreapprovalStatus: preapprovalStatus,
                nextPaymentDate,
            });
        }
    } else if (['cancelled', 'canceled', 'paused'].includes(preapprovalStatus)) {
        await User.findByIdAndUpdate(user._id, {
            $set: {
                'subscription.status': preapprovalStatus === 'paused' ? 'inactive' : 'cancelled',
                'subscription.mpPreapprovalStatus': preapprovalStatus,
            },
        });
    }

    return NextResponse.json({ ok: true });
}

async function handleSubscriptionAuthorizedPayment(authorizedPaymentId: string) {
    if (!authorizedPaymentId) return NextResponse.json({ ok: true });

    const authorizedRes = await getAuthorizedPayment(authorizedPaymentId);
    if (!authorizedRes.ok) {
        console.error('[Webhook] Erro ao buscar authorized_payment MP:', authorizedPaymentId, authorizedRes.data);
        return NextResponse.json({ ok: true });
    }

    await connectDB();

    const authorizedPayment = authorizedRes.data as any;
    const preapprovalId = authorizedPayment.preapproval_id ? String(authorizedPayment.preapproval_id) : null;
    const { user, parsed } = await findUserForSubscription(preapprovalId, authorizedPayment.external_reference);
    if (!user) {
        console.error('[Webhook] Usuário da fatura recorrente não encontrado:', authorizedPaymentId, authorizedPayment);
        return NextResponse.json({ ok: true });
    }

    const planId = parsed?.planId || user.subscription?.planId;
    const billingType = normalizeBillingType(parsed?.billingType || user.subscription?.billingType);
    const payment = authorizedPayment.payment || {};
    const mpPaymentId = payment.id ? String(payment.id) : `AUTH-${authorizedPaymentId}`;
    const paymentStatus = String(payment.status || authorizedPayment.status || 'pending');
    const statusDetail = payment.status_detail || '';
    const amount = Number(authorizedPayment.transaction_amount || payment.transaction_amount || 0);
    const externalReference = typeof authorizedPayment.external_reference === 'string'
        ? authorizedPayment.external_reference
        : (parsed ? `${parsed.firebaseUid}:${parsed.planId}:${parsed.billingType}` : `preapproval:${preapprovalId || authorizedPaymentId}`);

    await Payment.findOneAndUpdate(
        { mpPaymentId },
        {
            $set: {
                userId: user._id,
                ...(planId ? { planId } : {}),
                mpPaymentId,
                mpPreapprovalId: preapprovalId || undefined,
                mpAuthorizedPaymentId: String(authorizedPaymentId),
                externalReference,
                method: 'credit_card',
                methodDetail: user.creditCard?.brand,
                status: paymentStatus === 'approved' ? 'approved' : (paymentStatus === 'rejected' ? 'rejected' : 'pending'),
                statusDetail,
                amount,
                currency: authorizedPayment.currency_id || 'BRL',
                installments: 1,
                billingType,
                payerEmail: user.email,
                mpDateCreated: authorizedPayment.date_created ? new Date(authorizedPayment.date_created) : undefined,
                mpDateApproved: payment.date_approved ? new Date(payment.date_approved) : undefined,
            },
        },
        { upsert: true }
    );

    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    if (paymentStatus === 'approved' && planId) {
        const plan = await Plan.findById(planId);
        if (!plan) return NextResponse.json({ ok: true });

        const periodBase = authorizedPayment.debit_date ? new Date(authorizedPayment.debit_date) : new Date();
        const expiresAt = addBillingPeriod(periodBase, billingType);

        await activateSubscriptionAccess({
            userId: user._id,
            planId: String(planId),
            billingType,
            expiresAt,
            activationMethod: 'card',
            mpPreapprovalId: preapprovalId || undefined,
            mpPreapprovalStatus: 'authorized',
            lastAuthorizedPaymentId: String(authorizedPaymentId),
        });

        await Transaction.findOneAndUpdate(
            { referenceId: mpPaymentId },
            {
                $set: {
                    userId: user._id,
                    type: 'subscription',
                    description: `Recorrencia Mercado Pago - ${plan.name} (${billingType === 'annual' ? 'Anual' : 'Mensal'}) via Cartao`,
                    amount,
                    referenceId: mpPaymentId,
                    month,
                    status: 'paid',
                },
            },
            { upsert: true }
        );
    } else if (paymentStatus === 'rejected' || paymentStatus === 'cancelled' || paymentStatus === 'canceled') {
        const currentExpiry = user.subscription?.expiresAt ? new Date(user.subscription.expiresAt) : null;
        if (!currentExpiry || currentExpiry.getTime() <= Date.now()) {
            await User.findByIdAndUpdate(user._id, { $set: { 'subscription.status': 'inactive' } });
        }

        await Transaction.findOneAndUpdate(
            { referenceId: mpPaymentId },
            {
                $set: {
                    userId: user._id,
                    type: 'subscription',
                    description: `Recorrencia Mercado Pago recusada`,
                    amount,
                    referenceId: mpPaymentId,
                    month,
                    status: 'cancelled',
                },
            },
            { upsert: true }
        );
    }

    return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
    try {
        // Parse defensively: MP test pings send form-urlencoded (empty=%7B%7D), not JSON.
        // If JSON parsing fails we just return 200 so the test passes cleanly.
        let body: Record<string, any>;
        try {
            body = await req.json();
        } catch {
            // Not valid JSON — likely a ping/test from the MP panel
            console.log('[Webhook] Received non-JSON body (test ping) — returning ok');
            return NextResponse.json({ ok: true });
        }

        // ═══════════════════════════════════════
        // VALIDAÇÃO DE ASSINATURA HMAC (MP_WEBHOOK_SECRET)
        // ═══════════════════════════════════════
        const sig = validateMPSignature(req, body);
        if (!sig.valid) {
            console.error('[Webhook] Assinatura inválida — rejeitando:', {
                reason: sig.reason,
                type: body?.type,
                dataId: body?.data?.id,
            });
            return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
        }
        if (sig.reason && sig.reason !== 'ok') {
            // Loga o motivo do "valid" quando não foi por hash correto (secret ausente, etc.)
            // Útil pra auditar quantos webhooks estão passando sem validação real.
            console.log('[Webhook] Assinatura aceita sem validação HMAC:', sig.reason);
        }

        // Detecta o tipo do evento. MP envia notificações por dois sistemas:
        //   - Webhooks (novo): body { type: 'payment', data: { id: ... } }
        //   - IPN (legado):    query ?topic=payment&id=...  + body vazio/diferente
        // A conta pode ter AMBOS ativos simultaneamente — aceitamos os dois.
        const urlForType = new URL(req.url);
        const topicFromUrl = urlForType.searchParams.get('topic') || '';
        const idFromUrl = urlForType.searchParams.get('id') || '';
        const eventType = body.type || topicFromUrl;
        const resourceId = body.data?.id || idFromUrl || urlForType.searchParams.get('data.id') || '';

        if (eventType === 'subscription_preapproval') {
            return handleSubscriptionPreapproval(String(resourceId));
        }

        if (eventType === 'subscription_authorized_payment') {
            return handleSubscriptionAuthorizedPayment(String(resourceId));
        }

        // O MP envia diferentes tipos de notificação; só `payment` dispara o fluxo completo.
        // Os outros tipos (card updater, chargebacks, claims, fraud alerts) são apenas
        // logados por enquanto — handler completo pode ser adicionado conforme necessidade.
        if (eventType !== 'payment') {
            console.log('[Webhook] Evento não-payment recebido:', {
                type: body.type,
                topic: topicFromUrl,
                action: body.action,
                dataId: body?.data?.id || idFromUrl,
                resource: body.resource,
            });
            return NextResponse.json({ ok: true });
        }

        // Pra IPN, o paymentId vem da query string; pra Webhooks, vem do body.
        const paymentId = resourceId;
        if (!paymentId) {
            return NextResponse.json({ ok: true });
        }

        const accessToken = process.env.MP_ACCESS_TOKEN;
        if (!accessToken) {
            console.error('[Webhook] MP_ACCESS_TOKEN não configurado');
            return NextResponse.json({ ok: true });
        }

        // Buscar detalhes do pagamento no Mercado Pago
        const mpRes = await getPayment(paymentId);

        if (!mpRes.ok) {
            console.error('[Webhook] Erro ao buscar pagamento MP:', JSON.stringify(mpRes.data));
            return NextResponse.json({ ok: true });
        }

        const payment = mpRes.data;
        const mpStatus: string = payment.status;
        const mpStatusDetail: string = payment.status_detail || '';
        const paymentMethod: string = payment.payment_method_id || '';
        const paymentTypeId: string = payment.payment_type_id || '';
        const activationMethod: 'card' | 'pix' | 'boleto' | undefined =
            paymentMethod === 'pix' || paymentTypeId === 'bank_transfer'
                ? 'pix'
                : (paymentMethod === 'bolbradesco' || paymentTypeId === 'ticket'
                    ? 'boleto'
                    : (paymentTypeId === 'credit_card' || paymentTypeId === 'debit_card' ? 'card' : undefined));

        // Extrair referência externa: firebaseUid:planId:billingType
        const externalRef: string = payment.external_reference || '';
        const parts = externalRef.split(':');
        let firebaseUid = parts[0] || '';
        let planId = parts[1] || '';
        // billingType pode vir do external_reference (PIX) OU do metadata (cartão salvo).
        // O MP converte camelCase para snake_case no metadata — ambos os nomes testados
        // por segurança (defensive programming contra mudança silenciosa de comportamento).
        let billingType: 'monthly' | 'annual' =
            parts[2] === 'annual'
                ? 'annual'
                : (payment.metadata?.billing_type === 'annual' || payment.metadata?.billingType === 'annual'
                    ? 'annual'
                    : 'monthly');

        // Fallback: para pagamentos criados diretamente (PIX inline, cartão salvo),
        // o metadata contém userId (MongoDB _id) e planId
        let userByMetadata = false;
        if (!firebaseUid || !planId) {
            // MP armazena metadata em snake_case (user_id), mas defensivamente lemos também camelCase
            const metaUserId = payment.metadata?.user_id || payment.metadata?.userId;
            const metaPlanId = payment.metadata?.plan_id || payment.metadata?.planId;
            if (metaUserId && metaPlanId) {
                firebaseUid = metaUserId;
                planId = metaPlanId;
                userByMetadata = true;
            }
        }

        if (!firebaseUid || !planId) {
            // Verifica se é pagamento de Banner
            if (externalRef.startsWith('BANNER:')) {
                const bannerId = externalRef.split(':')[1];
                if (bannerId) {
                    await connectDB();
                    const bannerStatus = mpStatus === 'approved' ? 'pending' : (mpStatus === 'rejected' || mpStatus === 'cancelled' ? 'rejected' : 'awaiting_payment');
                    
                    await Banner.findByIdAndUpdate(bannerId, {
                        $set: {
                            status: bannerStatus,
                            paymentId: String(paymentId)
                        }
                    });
                    
                    console.log(`[Webhook] Banner ${bannerId} payment updated to ${bannerStatus}`);
                    return NextResponse.json({ ok: true });
                }
            }

            console.error('[Webhook] external_reference e metadata inválidos:', externalRef, payment.metadata);
            return NextResponse.json({ ok: true });
        }

        await connectDB();

        // ═══════════════════════════════════════
        // 1. REGISTRAR/ATUALIZAR PAYMENT
        // ═══════════════════════════════════════
        const user = userByMetadata
            ? await User.findById(firebaseUid)
            : await User.findOne({ firebaseUid });
        if (!user) {
            console.error('[Webhook] Usuário não encontrado:', firebaseUid, 'byMetadata:', userByMetadata);
            return NextResponse.json({ ok: true });
        }

        const paymentData: Record<string, any> = {
            userId: user._id,
            planId,
            mpPaymentId: String(paymentId),
            externalReference: externalRef,
            method: paymentTypeId || paymentMethod,
            methodDetail: paymentMethod,
            status: mpStatus,
            statusDetail: mpStatusDetail,
            amount: payment.transaction_amount || 0,
            currency: payment.currency_id || 'BRL',
            installments: payment.installments || 1,
            billingType,
            payerEmail: payment.payer?.email,
            payerName: payment.payer?.first_name
                ? `${payment.payer.first_name} ${payment.payer.last_name || ''}`.trim()
                : undefined,
            payerCpf: payment.payer?.identification?.number,
            mpDateCreated: payment.date_created ? new Date(payment.date_created) : undefined,
            mpDateApproved: payment.date_approved ? new Date(payment.date_approved) : undefined,
        };

        // PIX: salvar QR Code se disponível
        if (payment.point_of_interaction?.transaction_data) {
            const txData = payment.point_of_interaction.transaction_data;
            paymentData.pixQrCode = txData.qr_code;
            paymentData.pixQrCodeBase64 = txData.qr_code_base64;
        }

        // Boleto: salvar URL
        if (payment.transaction_details?.external_resource_url) {
            paymentData.boletoUrl = payment.transaction_details.external_resource_url;
        }
        if (payment.barcode?.content) {
            paymentData.boletoBarcode = payment.barcode.content;
        }

        await Payment.findOneAndUpdate(
            { mpPaymentId: String(paymentId) },
            { $set: paymentData },
            { upsert: true, returnDocument: 'after' }
        );

        console.log(`[Webhook] Payment ${paymentId} — status: ${mpStatus}, method: ${paymentMethod}, amount: ${payment.transaction_amount}`);

        // ═══════════════════════════════════════
        // 2. PROCESSAR STATUS
        // ═══════════════════════════════════════

        if (mpStatus === 'approved') {
            const plan = await Plan.findById(planId);
            if (!plan) {
                console.error('[Webhook] Plano não encontrado:', planId);
                return NextResponse.json({ ok: true });
            }

            // Calcular expiração baseado na data de vencimento original (não do pagamento)
            // Se venceu dia 9 e pagou dia 12, a próxima renovação é dia 09 do mês seguinte
            let expiresAt: Date;
            const currentExpiry = user.subscription?.expiresAt ? new Date(user.subscription.expiresAt) : null;
            
            if (currentExpiry && currentExpiry.getTime() < Date.now()) {
                // Plano vencido: renovar a partir da data de vencimento original
                expiresAt = new Date(currentExpiry);
                if (billingType === 'annual') {
                    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
                } else {
                    expiresAt.setDate(expiresAt.getDate() + 30);
                }
            } else {
                // Primeira assinatura ou plano ainda ativo: a partir de agora
                expiresAt = new Date();
                if (billingType === 'annual') {
                    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
                } else {
                    expiresAt.setDate(expiresAt.getDate() + 30);
                }
            }

            if (plan.type === 'monthly') {
                await User.findOneAndUpdate(
                    { _id: user._id },
                    {
                        $addToSet: { allowedProfiles: 'cliente' },
                        $set: {
                            defaultProfile: 'cliente',
                            credits: 0,
                            'subscription.planId': planId,
                            'subscription.status': 'active',
                            'subscription.expiresAt': expiresAt,
                            'subscription.billingType': billingType,
                            ...(activationMethod ? { 'subscription.activationMethod': activationMethod } : {}),
                        },
                    }
                );
                await User.findOneAndUpdate({ _id: user._id }, { $pull: { allowedProfiles: 'gratis' } });
            } else if (plan.type === 'credits' && plan.credits) {
                await User.findOneAndUpdate(
                    { _id: user._id },
                    {
                        $addToSet: { allowedProfiles: 'cliente' },
                        $set: {
                            defaultProfile: 'cliente',
                            'subscription.planId': planId,
                            'subscription.status': 'active',
                        },
                        $inc: { credits: plan.credits },
                    }
                );
                await User.findOneAndUpdate({ _id: user._id }, { $pull: { allowedProfiles: 'gratis' } });
            }

            // ═══════════════════════════════════════
            // 3. REGISTRAR TRANSACTION (extrato)
            // ═══════════════════════════════════════
            const now = new Date();
            const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

            await Transaction.findOneAndUpdate(
                { referenceId: String(paymentId) },
                {
                    $set: {
                        userId: user._id,
                        type: plan.type === 'credits' ? 'credit' : 'subscription',
                        description: `Pagamento — ${plan.name} (${billingType === 'annual' ? 'Anual' : 'Mensal'}) via ${formatPaymentMethod(paymentMethod)}`,
                        amount: payment.transaction_amount || plan.price,
                        referenceId: String(paymentId),
                        month,
                        status: 'paid',
                    },
                },
                { upsert: true }
            );

            // ═══════════════════════════════════════
            // 4. PROPAGAR PARA CONVIDADOS
            // ═══════════════════════════════════════
            try {
                const userInvites = await Invite.find({
                    inviterId: user._id,
                    status: { $in: ['accepted', 'pending'] },
                }).lean();

                const inviteeIds = userInvites
                    .map((inv: any) => inv.inviteeUserId)
                    .filter(Boolean);

                if (inviteeIds.length > 0) {
                    const updateFields: Record<string, any> = {
                        defaultProfile: 'cliente',
                        'subscription.planId': planId,
                        'subscription.status': 'active',
                        'subscription.expiresAt': expiresAt,
                        'subscription.billingType': billingType,
                    };

                    await User.updateMany(
                        { _id: { $in: inviteeIds } },
                        { 
                            $addToSet: { allowedProfiles: 'cliente' },
                            $set: updateFields 
                        }
                    );
                    
                    await User.updateMany(
                        { _id: { $in: inviteeIds } },
                        { $pull: { allowedProfiles: 'gratis' } }
                    );
                }
            } catch (inviteErr) {
                console.error('[Webhook] Erro ao propagar para convidados:', inviteErr);
            }

        } else if (mpStatus === 'refunded' || mpStatus === 'cancelled' || mpStatus === 'charged_back') {
            // Desativar assinatura se pagamento foi estornado/cancelado
            await User.findOneAndUpdate(
                { _id: user._id },
                {
                    $set: {
                        'subscription.status': 'cancelled',
                    },
                }
            );

            // Marcar qualquer Transaction pendente desse pagamento como cancelada
            await Transaction.findOneAndUpdate(
                { referenceId: String(paymentId) },
                { $set: { status: 'cancelled' } }
            );

            // Registrar no extrato o lançamento negativo de estorno
            const now = new Date();
            const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

            await Transaction.findOneAndUpdate(
                { referenceId: `refund-${paymentId}` },
                {
                    $set: {
                        userId: user._id,
                        type: 'charge',
                        description: `Estorno/Cancelamento — Pagamento #${paymentId}`,
                        amount: -(payment.transaction_amount || 0),
                        referenceId: `refund-${paymentId}`,
                        month,
                        status: 'cancelled',
                    },
                },
                { upsert: true }
            );
        } else if (mpStatus === 'rejected') {
            // Pagamento recusado pelo gateway.
            // Se havia uma Transaction criada antes (status='pending' do fluxo otimista),
            // marcá-la como 'cancelled' para desfazer a falsa impressão de "Pago".
            await Transaction.findOneAndUpdate(
                { referenceId: String(paymentId) },
                { $set: { status: 'cancelled' } }
            );
        } else if (mpStatus === 'in_process' || mpStatus === 'pending' || mpStatus === 'authorized') {
            // Em análise: garantir que a Transaction (se existir) esteja 'pending'
            // e que a assinatura NÃO tenha sido ativada prematuramente.
            await Transaction.findOneAndUpdate(
                { referenceId: String(paymentId) },
                { $set: { status: 'pending' } }
            );
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('[Webhook] Erro no webhook Mercado Pago:', error);
        // Sempre retornar 200 para não causar retentativas infinitas do MP
        return NextResponse.json({ ok: true });
    }
}

/**
 * Formata o método de pagamento para exibição.
 */
function formatPaymentMethod(method: string): string {
    const map: Record<string, string> = {
        'pix': 'PIX',
        'visa': 'Visa',
        'master': 'Mastercard',
        'elo': 'Elo',
        'amex': 'American Express',
        'hipercard': 'Hipercard',
        'debvisa': 'Visa Débito',
        'debmaster': 'Mastercard Débito',
        'debelo': 'Elo Débito',
        'bolbradesco': 'Boleto Bradesco',
        'account_money': 'Saldo Mercado Pago',
    };
    return map[method] || method;
}
