import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import Plan from '@/models/Plan';
import Invite from '@/models/Invite';
import Payment from '@/models/Payment';
import Transaction from '@/models/Transaction';
import { chargeCustomerCard, mpPut } from '@/lib/mercadopago';
import { createBoletoPayment, getBoletoExpirationDate, validateBoletoProfile } from '@/lib/services/boletoService';
import { buildBoletoEmail } from '@/lib/email/boletoEmail';
import { sendEmail } from '@/lib/email/sendEmail';

export const maxDuration = 60;

type BillingType = 'monthly' | 'annual';

const PENDING_PAYMENT_STATUSES = ['pending', 'in_process', 'authorized'];
const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

function asBillingType(value: unknown): BillingType | undefined {
    return value === 'annual' || value === 'monthly' ? value : undefined;
}

function getBaseUrl(): string {
    const raw = process.env.NEXTAUTH_URL || 'https://zerokm.vercel.app';
    return raw.includes('localhost') || raw.includes('127.0.0.1') ? 'https://zerokm.vercel.app' : raw;
}

function splitName(fullName: string): { firstName?: string; lastName?: string } {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    return {
        firstName: parts[0] || undefined,
        lastName: parts.length > 1 ? parts.slice(1).join(' ') : undefined,
    };
}

function getNextExpiry(currentExpiry: unknown, billingType: BillingType): Date {
    const fallbackBase = new Date();
    const parsedCurrent = currentExpiry ? new Date(currentExpiry as string | Date) : null;
    let next = parsedCurrent && Number.isFinite(parsedCurrent.getTime()) ? parsedCurrent : fallbackBase;

    do {
        next = new Date(next);
        if (billingType === 'annual') {
            next.setFullYear(next.getFullYear() + 1);
        } else {
            next.setDate(next.getDate() + 30);
        }
    } while (next.getTime() <= Date.now());

    return next;
}

async function syncCustomerProfile(user: any, firstName?: string, lastName?: string) {
    if (!user.mpCustomerId) return;

    const profileName = splitName((user.displayName || `${firstName || ''} ${lastName || ''}`).trim());
    const profileUpdate: Record<string, any> = {
        first_name: profileName.firstName || firstName || '',
        last_name: profileName.lastName || lastName || '',
    };

    const cpfDigits = (user.cpf || '').replace(/\D/g, '');
    if (cpfDigits.length === 11) {
        profileUpdate.identification = { type: 'CPF', number: cpfDigits };
    }

    const phoneDigits = (user.phoneNumber || '').replace(/\D/g, '');
    if (phoneDigits.length >= 10) {
        profileUpdate.phone = {
            area_code: phoneDigits.slice(0, 2),
            number: phoneDigits.slice(2),
        };
    }

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

    const res = await mpPut(`/v1/customers/${user.mpCustomerId}`, profileUpdate);
    if (!res.ok) {
        console.error('[cron/billing] Falha ao sincronizar customer MP:', {
            customerId: user.mpCustomerId,
            status: res.status,
            response: res.data,
        });
    }
}

function getExpiryKey(expiresAt: unknown): string {
    const d = expiresAt ? new Date(expiresAt as string | Date) : new Date();
    return d.toISOString().slice(0, 10);
}

async function processUpcomingBoletoRenewals(now: Date) {
    const fiveDaysFromNow = new Date(now.getTime() + FIVE_DAYS_MS);
    const boletoUsers = await User.find({
        'subscription.status': 'active',
        'subscription.activationMethod': 'boleto',
        'subscription.expiresAt': { $gt: now, $lte: fiveDaysFromNow },
        isInvitee: { $ne: true },
    }).lean();

    let generated = 0;
    let emailsSent = 0;
    let skipped = 0;

    for (const user of boletoUsers) {
        if (!user.subscription?.planId || !user.subscription?.expiresAt) {
            skipped++;
            continue;
        }

        const profileError = validateBoletoProfile(user);
        if (profileError) {
            console.error('[cron/billing] Boleto não gerado por perfil incompleto:', {
                userId: user._id,
                email: user.email,
                reason: profileError,
            });
            skipped++;
            continue;
        }

        const coveredByInvite = await Invite.exists({
            inviteeUserId: user._id,
            status: { $in: ['pending', 'accepted'] },
        });
        if (coveredByInvite) {
            skipped++;
            continue;
        }

        const plan = await Plan.findById(user.subscription.planId).lean();
        if (!plan || !plan.active || plan.type !== 'monthly') {
            skipped++;
            continue;
        }

        const billingType = asBillingType(user.subscription.billingType) || 'monthly';
        const expiryKey = getExpiryKey(user.subscription.expiresAt);
        const externalReference = `${user.firebaseUid}:${plan._id.toString()}:${billingType}:boleto-renewal:${expiryKey}`;

        let payment = await Payment.findOne({
            externalReference,
            method: 'bolbradesco',
            status: { $in: ['pending', 'in_process', 'approved'] },
        });

        if (!payment) {
            const activeInvitesCount = await Invite.countDocuments({
                inviterId: user._id,
                status: { $in: ['pending', 'accepted'] },
            });
            const expirationDate = getBoletoExpirationDate(new Date(user.subscription.expiresAt));
            const { payRes, totalAmount, boletoUrl, boletoBarcode } = await createBoletoPayment({
                user,
                plan,
                billingType,
                inviteesCount: activeInvitesCount,
                externalReference,
                expirationDate,
                metadataType: 'boleto-renewal',
            });

            if (!payRes.ok) {
                console.error('[cron/billing] Erro ao gerar boleto recorrente:', {
                    userId: user._id,
                    status: payRes.status,
                    response: payRes.data,
                });
                skipped++;
                continue;
            }

            payment = await Payment.create({
                userId: user._id,
                planId: plan._id,
                mpPaymentId: payRes.data.id?.toString(),
                externalReference,
                method: 'bolbradesco',
                methodDetail: 'bolbradesco',
                status: payRes.data.status || 'pending',
                statusDetail: payRes.data.status_detail,
                amount: totalAmount,
                currency: 'BRL',
                billingType,
                payerEmail: user.email,
                payerName: user.displayName,
                boletoUrl,
                boletoBarcode,
                mpDateCreated: payRes.data.date_created ? new Date(payRes.data.date_created) : undefined,
            });
            generated++;
        }

        if ((payment as any).status === 'approved' || (payment as any).boletoEmailSentAt) {
            skipped++;
            continue;
        }

        const emailContent = buildBoletoEmail({
            customerName: user.displayName,
            planName: plan.name,
            amount: (payment as any).amount || 0,
            dueDate: (payment as any).mpDateCreated
                ? getBoletoExpirationDate(new Date(user.subscription.expiresAt))
                : new Date(user.subscription.expiresAt),
            boletoUrl: (payment as any).boletoUrl,
            barcode: (payment as any).boletoBarcode,
        });

        const emailRes = await sendEmail({
            to: user.email,
            subject: emailContent.subject,
            html: emailContent.html,
            text: emailContent.text,
        });

        if (emailRes.ok) {
            await Payment.findByIdAndUpdate((payment as any)._id, {
                $set: { boletoEmailSentAt: new Date() },
            });
            emailsSent++;
        }
    }

    return { candidates: boletoUsers.length, generated, emailsSent, skipped };
}

export async function GET(request: Request) {
    try {
        const authHeader = request.headers.get('authorization');
        if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        await connectDB();

        const now = new Date();
        const baseUrl = getBaseUrl();
        const boletoRenewals = await processUpcomingBoletoRenewals(now);

        const expiringUsers = await User.find({
            'subscription.status': 'active',
            'subscription.expiresAt': { $lte: now },
            mpCustomerId: { $exists: true, $ne: null },
            'creditCard.mpCardId': { $exists: true, $ne: null },
            isInvitee: { $ne: true },
        }).lean();

        let attemptedCount = 0;
        let successCount = 0;
        let pendingCount = 0;
        let failCount = 0;
        let skippedCount = 0;

        for (const user of expiringUsers) {
            if (!user.subscription?.planId) {
                skippedCount++;
                continue;
            }

            if (user.subscription.mpPreapprovalId) {
                skippedCount++;
                continue;
            }

            const coveredByInvite = await Invite.exists({
                inviteeUserId: user._id,
                status: { $in: ['pending', 'accepted'] },
            });
            if (coveredByInvite) {
                skippedCount++;
                continue;
            }

            const plan = await Plan.findById(user.subscription.planId).lean();
            if (!plan || !plan.active || plan.type !== 'monthly') {
                skippedCount++;
                continue;
            }

            const latestApprovedCardPayment = await Payment.findOne({
                userId: user._id,
                planId: plan._id,
                status: 'approved',
                method: { $in: ['credit_card', 'debit_card'] },
            }).sort({ createdAt: -1 }).lean();

            const wasActivatedByCard = user.subscription.activationMethod === 'card' || !!latestApprovedCardPayment;
            if (!wasActivatedByCard) {
                skippedCount++;
                continue;
            }

            const latestApprovedPayment = latestApprovedCardPayment || await Payment.findOne({
                userId: user._id,
                planId: plan._id,
                status: 'approved',
                billingType: { $in: ['monthly', 'annual'] },
            }).sort({ createdAt: -1 }).lean();

            const billingType = asBillingType(user.subscription.billingType)
                || asBillingType((latestApprovedPayment as any)?.billingType)
                || 'monthly';
            const billingLabel = billingType === 'annual' ? 'Anual' : 'Mensal';

            const recentPendingPayment = await Payment.findOne({
                userId: user._id,
                planId: plan._id,
                method: 'credit_card',
                status: { $in: PENDING_PAYMENT_STATUSES },
                createdAt: { $gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
            }).lean();
            if (recentPendingPayment) {
                pendingCount++;
                continue;
            }

            const activeInvitesCount = await Invite.countDocuments({
                inviterId: user._id,
                status: { $in: ['pending', 'accepted'] },
            });

            const basePrice = billingType === 'annual' && typeof plan.annualPrice === 'number' && plan.annualPrice > 0
                ? plan.annualPrice
                : plan.price;
            const inviteUnitPrice = billingType === 'annual'
                ? (plan.invitePrice || 0) * 12
                : (plan.invitePrice || 0);
            const inviteesFee = inviteUnitPrice * activeInvitesCount;
            const totalAmount = basePrice + inviteesFee;

            const holderName = ((user.creditCard as any)?.holderName || '').trim();
            const { firstName, lastName } = splitName(holderName || user.displayName || '');
            const externalReference = `${user.firebaseUid}:${plan._id.toString()}:${billingType}`;
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
                ...(activeInvitesCount > 0 && inviteUnitPrice > 0
                    ? [{
                        id: `invite-${plan._id.toString()}`,
                        title: `Convidados (${activeInvitesCount})`,
                        description: 'Taxa por usuário convidado',
                        quantity: activeInvitesCount,
                        unit_price: inviteUnitPrice,
                        category_id: 'services',
                    }]
                    : []),
            ];

            try {
                await syncCustomerProfile(user, firstName, lastName);
            } catch (err) {
                console.error('[cron/billing] Exceção ao sincronizar customer MP:', err);
            }

            attemptedCount++;
            const payRes = await chargeCustomerCard({
                customerId: user.mpCustomerId as string,
                cardId: (user.creditCard as any).mpCardId,
                paymentMethodId: (user.creditCard as any).brand || 'visa',
                email: user.email as string,
                amount: totalAmount,
                description: `Renovacao Automatica: ${plan.name} (${billingLabel})${activeInvitesCount > 0 ? ` + ${activeInvitesCount} Convidados` : ''}`,
                metadata: {
                    userId: user._id.toString(),
                    planId: plan._id.toString(),
                    type: 'auto-renewal',
                    billing_type: billingType,
                },
                externalReference,
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
                registrationDate: (user as any).createdAt ? new Date((user as any).createdAt).toISOString() : undefined,
                isFirstPurchaseOnline: false,
            });

            const mpStatus: string | undefined = payRes.data?.status;
            const mpStatusDetail: string | undefined = payRes.data?.status_detail;
            const mpPaymentId = payRes.data?.id ? String(payRes.data.id) : '';
            const paymentRecordId = mpPaymentId || `ERR-${user._id}-${Date.now()}`;
            const transactionMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

            if (payRes.ok && mpStatus === 'approved') {
                const newExpiry = getNextExpiry(user.subscription.expiresAt, billingType);

                await User.findByIdAndUpdate(user._id, {
                    $set: {
                        defaultProfile: 'cliente',
                        credits: 0,
                        'subscription.planId': plan._id.toString(),
                        'subscription.expiresAt': newExpiry,
                        'subscription.status': 'active',
                        'subscription.billingType': billingType,
                        'subscription.activationMethod': 'card',
                    },
                    $addToSet: { allowedProfiles: 'cliente' },
                });
                await User.findByIdAndUpdate(user._id, { $pull: { allowedProfiles: 'gratis' } });

                await Payment.findOneAndUpdate(
                    { mpPaymentId: paymentRecordId },
                    {
                        $set: {
                            userId: user._id,
                            planId: plan._id,
                            mpPaymentId: paymentRecordId,
                            externalReference,
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

                await Transaction.findOneAndUpdate(
                    { referenceId: paymentRecordId },
                    {
                        $set: {
                            userId: user._id,
                            type: 'subscription',
                            description: `Renovacao Automatica - ${plan.name} (${billingLabel}) via Cartao`,
                            amount: totalAmount,
                            referenceId: paymentRecordId,
                            month: transactionMonth,
                            status: 'paid',
                        },
                    },
                    { upsert: true }
                );

                const userInvites = await Invite.find({
                    inviterId: user._id,
                    status: { $in: ['accepted', 'pending'] },
                }).lean();
                const inviteeIds = userInvites.map((invite: any) => invite.inviteeUserId).filter(Boolean);
                if (inviteeIds.length > 0) {
                    await User.updateMany(
                        { _id: { $in: inviteeIds } },
                        {
                            $addToSet: { allowedProfiles: 'cliente' },
                            $set: {
                                defaultProfile: 'cliente',
                                'subscription.planId': plan._id.toString(),
                                'subscription.status': 'active',
                                'subscription.expiresAt': newExpiry,
                                'subscription.billingType': billingType,
                            },
                        }
                    );
                    await User.updateMany(
                        { _id: { $in: inviteeIds } },
                        { $pull: { allowedProfiles: 'gratis' } }
                    );
                }

                successCount++;
            } else if (payRes.ok && (mpStatus === 'in_process' || mpStatus === 'pending' || mpStatus === 'authorized')) {
                await Payment.findOneAndUpdate(
                    { mpPaymentId: paymentRecordId },
                    {
                        $set: {
                            userId: user._id,
                            planId: plan._id,
                            mpPaymentId: paymentRecordId,
                            externalReference,
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

                await Transaction.findOneAndUpdate(
                    { referenceId: paymentRecordId },
                    {
                        $set: {
                            userId: user._id,
                            type: 'subscription',
                            description: `Renovacao Automatica - ${plan.name} (${billingLabel}) via Cartao (em analise)`,
                            amount: totalAmount,
                            referenceId: paymentRecordId,
                            month: transactionMonth,
                            status: 'pending',
                        },
                    },
                    { upsert: true }
                );

                pendingCount++;
            } else {
                await User.findByIdAndUpdate(user._id, {
                    $set: { 'subscription.status': 'inactive' },
                });

                await Payment.findOneAndUpdate(
                    { mpPaymentId: paymentRecordId },
                    {
                        $set: {
                            userId: user._id,
                            planId: plan._id,
                            mpPaymentId: paymentRecordId,
                            externalReference,
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

                failCount++;
            }
        }

        return NextResponse.json({
            ok: true,
            candidates: expiringUsers.length,
            processed: attemptedCount,
            successful: successCount,
            pending: pendingCount,
            failed: failCount,
            skipped: skippedCount,
            boletoRenewals,
        });
    } catch (error: any) {
        console.error('CRON Billing Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
