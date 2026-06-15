import User from '@/models/User';
import Invite from '@/models/Invite';

export type BillingType = 'monthly' | 'annual';

export function normalizeBillingType(value: unknown): BillingType {
    return value === 'annual' ? 'annual' : 'monthly';
}

export function buildSubscriptionExternalReference(firebaseUid: string, planId: string, billingType: BillingType): string {
    return `${firebaseUid}:${planId}:${billingType}`;
}

export function parseSubscriptionExternalReference(reference: unknown): {
    firebaseUid: string;
    planId: string;
    billingType: BillingType;
} | null {
    if (typeof reference !== 'string' || reference.length === 0) return null;
    const [firebaseUid, planId, rawBillingType] = reference.split(':');
    if (!firebaseUid || !planId) return null;
    return {
        firebaseUid,
        planId,
        billingType: normalizeBillingType(rawBillingType),
    };
}

export function getBillingPeriodConfig(billingType: BillingType): { frequency: number; frequencyType: 'months' } {
    return billingType === 'annual'
        ? { frequency: 12, frequencyType: 'months' }
        : { frequency: 1, frequencyType: 'months' };
}

export function addBillingPeriod(base: Date, billingType: BillingType): Date {
    const next = new Date(base);
    if (billingType === 'annual') {
        next.setFullYear(next.getFullYear() + 1);
    } else {
        next.setDate(next.getDate() + 30);
    }
    return next;
}

export function calculateSubscriptionAmount(plan: any, billingType: BillingType, activeInvitesCount: number) {
    const basePrice = billingType === 'annual' && typeof plan.annualPrice === 'number' && plan.annualPrice > 0
        ? plan.annualPrice
        : plan.price;
    const inviteUnitPrice = billingType === 'annual'
        ? (plan.invitePrice || 0) * 12
        : (plan.invitePrice || 0);
    const inviteesFee = inviteUnitPrice * activeInvitesCount;

    return {
        basePrice,
        inviteUnitPrice,
        inviteesFee,
        totalAmount: basePrice + inviteesFee,
    };
}

export function getPublicBaseUrl(): string {
    const raw = process.env.NEXTAUTH_URL || 'https://zerokm.vercel.app';
    return raw.includes('localhost') || raw.includes('127.0.0.1') ? 'https://zerokm.vercel.app' : raw;
}

export async function activateSubscriptionAccess(params: {
    userId: any;
    planId: string;
    billingType: BillingType;
    expiresAt: Date;
    activationMethod: 'card' | 'pix' | 'boleto';
    mpPreapprovalId?: string;
    mpPreapprovalStatus?: string;
    nextPaymentDate?: Date | null;
    lastAuthorizedPaymentId?: string;
}) {
    const setFields: Record<string, any> = {
        defaultProfile: 'cliente',
        credits: 0,
        'subscription.planId': params.planId,
        'subscription.status': 'active',
        'subscription.expiresAt': params.expiresAt,
        'subscription.billingType': params.billingType,
        'subscription.activationMethod': params.activationMethod,
    };

    if (params.mpPreapprovalId) setFields['subscription.mpPreapprovalId'] = params.mpPreapprovalId;
    if (params.mpPreapprovalStatus) setFields['subscription.mpPreapprovalStatus'] = params.mpPreapprovalStatus;
    if (params.nextPaymentDate) setFields['subscription.nextPaymentDate'] = params.nextPaymentDate;
    if (params.lastAuthorizedPaymentId) setFields['subscription.lastAuthorizedPaymentId'] = params.lastAuthorizedPaymentId;

    await User.findByIdAndUpdate(params.userId, {
        $addToSet: { allowedProfiles: 'cliente' },
        $set: setFields,
    });
    await User.findByIdAndUpdate(params.userId, { $pull: { allowedProfiles: 'gratis' } });

    const userInvites = await Invite.find({
        inviterId: params.userId,
        status: { $in: ['accepted', 'pending'] },
    }).lean();
    const inviteeIds = userInvites.map((invite: any) => invite.inviteeUserId).filter(Boolean);
    if (inviteeIds.length === 0) return;

    await User.updateMany(
        { _id: { $in: inviteeIds } },
        {
            $addToSet: { allowedProfiles: 'cliente' },
            $set: {
                defaultProfile: 'cliente',
                'subscription.planId': params.planId,
                'subscription.status': 'active',
                'subscription.expiresAt': params.expiresAt,
                'subscription.billingType': params.billingType,
            },
        }
    );
    await User.updateMany(
        { _id: { $in: inviteeIds } },
        { $pull: { allowedProfiles: 'gratis' } }
    );
}
