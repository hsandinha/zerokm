import NextAuth, { DefaultSession } from "next-auth"

declare module "next-auth" {
    interface Session {
        error?: string;
        user: {
            id: string
            uid?: string
            profile?: string
            allowedProfiles?: string[]
            canViewLocation?: boolean
            credits?: number
            profileCompletion?: number
            daysUntilExpiry?: number | null
            subscriptionPlanId?: string | null
            subscriptionExpiresAt?: string | null
            subscriptionBillingType?: 'monthly' | 'annual' | null
            freeTrialExpiresAt?: string | null
            freeTrialExpired?: boolean
        } & DefaultSession["user"]
    }

    interface User {
        id: string
        profile?: string
        allowedProfiles?: string[]
        selectedProfile?: string
        canViewLocation?: boolean
        sessionToken?: string;
        credits?: number;
        profileCompletion?: number;
        daysUntilExpiry?: number | null;
        subscriptionPlanId?: string | null;
        subscriptionExpiresAt?: string | null;
        subscriptionBillingType?: 'monthly' | 'annual' | null;
        freeTrialExpiresAt?: string | null;
        freeTrialExpired?: boolean;
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        id: string
        uid?: string
        profile?: string
        allowedProfiles?: string[]
        sessionToken?: string;
        error?: string;
        credits?: number;
        profileCompletion?: number;
        daysUntilExpiry?: number | null;
        subscriptionPlanId?: string | null;
        subscriptionExpiresAt?: string | null;
        subscriptionBillingType?: 'monthly' | 'annual' | null;
        freeTrialExpiresAt?: string | null;
        freeTrialExpired?: boolean;
    }
}
