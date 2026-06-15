import { AuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import CredentialsProvider from 'next-auth/providers/credentials'
import type { SessionStrategy } from 'next-auth'
import { adminAuth } from '@/lib/firebase-admin'
import { getUserAllowedProfiles, updateUserSession, validateUserSession } from '@/lib/services/userService'
import { randomUUID } from 'crypto'

export const authOptions: AuthOptions = {
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID ?? "",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        }),
        CredentialsProvider({
            name: 'Credentials',
            credentials: {},
            async authorize(credentials): Promise<any> {
                const { token, selectedProfile } = credentials as any;
                if (token) {
                    try {
                        const decodedToken = await adminAuth.verifyIdToken(token);
                        const { profiles, canViewLocation, credits, profileCompletion, daysUntilExpiry, subscriptionPlanId, subscriptionExpiresAt, subscriptionBillingType, freeTrialExpiresAt, freeTrialExpired, profileVersion } = await getUserAllowedProfiles(decodedToken.email || '');

                        // Generate new session token and update DB
                        const sessionToken = randomUUID();
                        if (decodedToken.email) {
                            await updateUserSession(decodedToken.email, sessionToken);
                        }

                        return {
                            id: decodedToken.uid,
                            email: decodedToken.email,
                            name: decodedToken.name || decodedToken.email?.split('@')[0],
                            image: decodedToken.picture,
                            selectedProfile: selectedProfile, // Pass selected profile to user object
                            allowedProfiles: profiles,
                            canViewLocation: canViewLocation,
                            sessionToken: sessionToken,
                            credits: credits,
                            profileCompletion: profileCompletion,
                            daysUntilExpiry: daysUntilExpiry,
                            subscriptionPlanId: subscriptionPlanId,
                            subscriptionExpiresAt: subscriptionExpiresAt,
                            subscriptionBillingType: subscriptionBillingType,
                            freeTrialExpiresAt: freeTrialExpiresAt,
                            freeTrialExpired: freeTrialExpired,
                            profileVersion: profileVersion,
                        }
                    } catch (error) {
                        console.error('Erro ao verificar token:', error);
                        return null;
                    }
                }
                return null;
            }
        })
    ],
    callbacks: {
        async jwt({ token, account, user, trigger, session }: any) {
            if (account && user) {
                token.uid = user.id; // Firebase UID
                token.email = user.email;
                token.name = user.name;
                token.image = user.image;
                token.allowedProfiles = user.allowedProfiles;
                token.canViewLocation = user.canViewLocation;
                token.sessionToken = user.sessionToken;
                token.credits = user.credits ?? 0;
                token.profileCompletion = user.profileCompletion ?? 0;
                token.daysUntilExpiry = user.daysUntilExpiry ?? null;
                token.subscriptionPlanId = user.subscriptionPlanId ?? null;
                token.subscriptionExpiresAt = user.subscriptionExpiresAt ?? null;
                token.subscriptionBillingType = user.subscriptionBillingType ?? null;
                token.freeTrialExpiresAt = user.freeTrialExpiresAt ?? null;
                token.freeTrialExpired = user.freeTrialExpired ?? false;
                token.profileVersion = user.profileVersion ?? 0;

                // Use the selected profile passed from authorize, or fallback to logic
                if (user.selectedProfile) {
                    token.profile = user.selectedProfile;
                } else {
                    // Fallback logic
                    let profile = 'operador';
                    const email = user.email || '';

                    if (email.includes('admin')) {
                        profile = 'administrador';
                    } else if (email.includes('dealership') || email.includes('concessionaria')) {
                        profile = 'concessionaria';
                    } else if (email.includes('client') || email.includes('cliente')) {
                        profile = 'cliente';
                    }
                    token.profile = profile;
                }
            } else if (token.email && token.sessionToken) {
                // Verify if session is still valid (single session enforcement)
                const { valid, profileVersion } = await validateUserSession(token.email, token.sessionToken);
                if (!valid) {
                    return { ...token, error: 'SessionExpired' };
                }
                // Silently refresh JWT when admin changed the user's plan
                if ((token.profileVersion ?? 0) < profileVersion) {
                    const fresh = await getUserAllowedProfiles(token.email);
                    const newProfile = fresh.profiles.includes(token.profile as any)
                        ? token.profile
                        : (fresh.profiles[0] ?? token.profile);
                    return {
                        ...token,
                        profile: newProfile,
                        allowedProfiles: fresh.profiles,
                        credits: fresh.credits,
                        daysUntilExpiry: fresh.daysUntilExpiry,
                        subscriptionPlanId: fresh.subscriptionPlanId,
                        subscriptionExpiresAt: fresh.subscriptionExpiresAt,
                        subscriptionBillingType: fresh.subscriptionBillingType,
                        profileVersion,
                    };
                }
            }

            // Handle profile update (e.g., after payment approval)
            if (trigger === "update" && session?.profile) {
                token.profile = session.profile;
                // Also update allowedProfiles if provided (e.g., gratis → cliente)
                if (session.allowedProfiles) {
                    token.allowedProfiles = session.allowedProfiles;
                }
            }
            // Handle profileCompletion refresh after profile save
            if (trigger === "update" && session?.profileCompletion !== undefined) {
                token.profileCompletion = session.profileCompletion;
            }
            if (trigger === "update" && session?.freeTrialExpired !== undefined) {
                token.freeTrialExpired = session.freeTrialExpired;
            }

            return token
        },
        async session({ session, token }: any) {
            if (token.error === 'SessionExpired') {
                // Force logout by returning null (or effectively invalid session)
                // Note: Returning null might throw error in some next-auth versions, 
                // but returning session with error allows client to handle it.
                // However, generally returning null is the way to say "no session".
                // Let's try returning a session with error field, so client can redirect.
                return { ...session, error: 'SessionExpired' };
            }

            if (token && session.user) {
                session.user.uid = token.uid as string;
                session.user.email = token.email as string;
                session.user.name = token.name as string;
                session.user.image = token.image as string;
                session.user.profile = token.profile as string;
                session.user.allowedProfiles = token.allowedProfiles as string[];
                session.user.canViewLocation = token.canViewLocation as boolean;
                session.user.credits = token.credits as number ?? 0;
                session.user.profileCompletion = token.profileCompletion as number ?? 0;
                session.user.daysUntilExpiry = token.daysUntilExpiry as number | null;
                session.user.subscriptionPlanId = token.subscriptionPlanId as string | null;
                session.user.subscriptionExpiresAt = token.subscriptionExpiresAt as string | null;
                session.user.subscriptionBillingType = token.subscriptionBillingType as 'monthly' | 'annual' | null;
                session.user.freeTrialExpiresAt = token.freeTrialExpiresAt as string | null;
                session.user.freeTrialExpired = token.freeTrialExpired as boolean ?? false;
            }
            return session
        }
    },
    pages: {
        signIn: '/login'
    },
    session: {
        strategy: 'jwt' as SessionStrategy
    }
}
