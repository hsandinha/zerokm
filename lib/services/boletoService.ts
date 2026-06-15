import { mpPost } from '@/lib/mercadopago';
import { calculateSubscriptionAmount, getPublicBaseUrl, normalizeBillingType } from '@/lib/services/mercadoPagoSubscriptionService';
import type { BillingType } from '@/lib/services/mercadoPagoSubscriptionService';

type CreateBoletoPaymentParams = {
    user: any;
    plan: any;
    billingType: BillingType;
    inviteesCount: number;
    externalReference: string;
    expirationDate: Date;
    metadataType: string;
    clientIp?: string;
};

function splitName(fullName: string) {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    return {
        firstName: parts[0] || '',
        lastName: parts.length > 1 ? parts.slice(1).join(' ') : '',
    };
}

function cleanDigits(value: unknown): string {
    return String(value || '').replace(/\D/g, '');
}

export function getBoletoExpirationDate(preferredDate?: Date | null): Date {
    const now = new Date();
    const minimum = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const maximum = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    if (preferredDate && preferredDate.getTime() >= minimum.getTime() && preferredDate.getTime() <= maximum.getTime()) {
        const d = new Date(preferredDate);
        d.setHours(23, 59, 59, 0);
        return d;
    }

    minimum.setHours(23, 59, 59, 0);
    return minimum;
}

export function validateBoletoProfile(user: any): string | null {
    if (!user?.email) return 'E-mail obrigatório para gerar boleto.';
    if (cleanDigits(user.cpf).length !== 11) return 'CPF válido obrigatório para gerar boleto.';
    if (!user.address?.zipCode) return 'CEP obrigatório para gerar boleto.';
    if (!user.address?.street) return 'Rua obrigatória para gerar boleto.';
    if (!user.address?.number) return 'Número obrigatório para gerar boleto.';
    if (!user.address?.neighborhood) return 'Bairro obrigatório para gerar boleto.';
    if (!user.address?.city) return 'Cidade obrigatória para gerar boleto.';
    if (!user.address?.state || String(user.address.state).trim().length !== 2) return 'UF obrigatória para gerar boleto.';
    return null;
}

export async function createBoletoPayment({
    user,
    plan,
    billingType,
    inviteesCount,
    externalReference,
    expirationDate,
    metadataType,
    clientIp,
}: CreateBoletoPaymentParams) {
    const normalizedBilling = normalizeBillingType(billingType);
    const billingLabel = normalizedBilling === 'annual' ? 'Anual' : 'Mensal';
    const { basePrice, inviteUnitPrice, totalAmount } = calculateSubscriptionAmount(plan, normalizedBilling, inviteesCount);
    const { firstName, lastName } = splitName(user.displayName || '');
    const cpfDigits = cleanDigits(user.cpf);
    const phoneDigits = cleanDigits(user.phoneNumber);
    const phoneObj = phoneDigits.length >= 10
        ? { area_code: phoneDigits.slice(0, 2), number: phoneDigits.slice(2) }
        : undefined;
    const address = {
        zip_code: cleanDigits(user.address?.zipCode),
        street_name: user.address?.street || '',
        street_number: user.address?.number || 'S/N',
        neighborhood: user.address?.neighborhood || '',
        city: user.address?.city || '',
        federal_unit: String(user.address?.state || '').toUpperCase(),
    };

    const items: Array<Record<string, any>> = [
        {
            id: plan._id.toString(),
            title: `Assinatura ${plan.name} (${billingLabel})`,
            description: plan.description || `Assinatura ${plan.name} (${billingLabel})`,
            quantity: 1,
            unit_price: basePrice,
            category_id: 'services',
        },
    ];
    if (inviteesCount > 0 && inviteUnitPrice > 0) {
        items.push({
            id: `invite-${plan._id.toString()}`,
            title: `Convidados (${inviteesCount})`,
            description: 'Taxa por usuário convidado',
            quantity: inviteesCount,
            unit_price: inviteUnitPrice,
            category_id: 'services',
        });
    }

    const baseUrl = getPublicBaseUrl();
    const paymentBody: Record<string, any> = {
        transaction_amount: totalAmount,
        description: `${plan.name} (${billingLabel})${inviteesCount > 0 ? ` + ${inviteesCount} Convidados` : ''} - Boleto`,
        payment_method_id: 'bolbradesco',
        date_of_expiration: expirationDate.toISOString(),
        payer: {
            email: user.email,
            ...(firstName ? { first_name: firstName } : {}),
            ...(lastName ? { last_name: lastName } : {}),
            identification: { type: 'CPF', number: cpfDigits },
            address,
            ...(phoneObj ? { phone: phoneObj } : {}),
        },
        external_reference: externalReference,
        notification_url: `${baseUrl}/api/webhooks/mercadopago`,
        statement_descriptor: 'ZEROKM',
        additional_info: {
            items,
            payer: {
                ...(firstName ? { first_name: firstName } : {}),
                ...(lastName ? { last_name: lastName } : {}),
                ...(phoneObj ? { phone: phoneObj } : {}),
                ...((user as any).createdAt ? { registration_date: new Date((user as any).createdAt).toISOString() } : {}),
                address: {
                    zip_code: address.zip_code,
                    street_name: address.street_name,
                    street_number: address.street_number,
                },
            },
            shipments: {
                receiver_address: {
                    zip_code: address.zip_code,
                    street_name: address.street_name,
                    street_number: address.street_number,
                    city_name: address.city,
                    state_name: address.federal_unit,
                },
            },
        },
        metadata: {
            userId: user._id.toString(),
            planId: plan._id.toString(),
            type: metadataType,
            billing_type: normalizedBilling,
        },
    };

    const extraHeaders: Record<string, string> = {};
    if (clientIp) extraHeaders['X-Forwarded-For'] = clientIp;

    const payRes = await mpPost('/v1/payments', paymentBody, undefined, extraHeaders);
    const boletoUrl = payRes.data?.transaction_details?.external_resource_url || null;
    const boletoBarcode = payRes.data?.barcode?.content || null;

    return {
        payRes,
        totalAmount,
        boletoUrl,
        boletoBarcode,
    };
}
