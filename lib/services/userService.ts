import { adminAuth } from '@/lib/firebase-admin';
import { UserProfile } from '@/lib/types/auth';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import Plan from '@/models/Plan';
import Invite from '@/models/Invite';
import { calculateProfileCompletion } from '@/lib/utils/profileCompletion';
import { createExpiredFreeTrialWindow, isFreeTrialExpired } from '@/lib/utils/freeTrial';

export async function getUserAllowedProfiles(email: string): Promise<{ profiles: UserProfile[], forcePasswordChange: boolean, canViewLocation: boolean, credits: number, profileCompletion: number, daysUntilExpiry: number | null, subscriptionPlanId: string | null, subscriptionExpiresAt: string | null, subscriptionBillingType: 'monthly' | 'annual' | null, freeTrialExpiresAt: string | null, freeTrialExpired: boolean, profileVersion: number, displayName: string | null }> {
    try {
        await connectDB();
        const userRecord = await adminAuth.getUserByEmail(email);
        const user = await User.findOne({ firebaseUid: userRecord.uid });

        let profiles: UserProfile[] = ['operador'];
        let forcePasswordChange = false;
        let canViewLocation = false;
        let credits = 0;
        let profileCompletion = 0;
        let daysUntilExpiry: number | null = null;
        let subscriptionPlanId: string | null = null;
        let subscriptionExpiresAt: string | null = null;
        let subscriptionBillingType: 'monthly' | 'annual' | null = null;
        let freeTrialExpiresAt: Date | null = null;
        let freeTrialExpired = false;

        if (user) {
            subscriptionPlanId = user.subscription?.planId ? String(user.subscription.planId) : null;
            subscriptionExpiresAt = user.subscription?.expiresAt ? new Date(user.subscription.expiresAt).toISOString() : null;
            subscriptionBillingType = user.subscription?.billingType === 'annual' ? 'annual' : (user.subscription?.billingType === 'monthly' ? 'monthly' : null);

            if (user.allowedProfiles && Array.isArray(user.allowedProfiles)) {
                profiles = user.allowedProfiles as UserProfile[];
            }
            if (user.forcePasswordChange === true) {
                forcePasswordChange = true;
            }
            if (user.canViewLocation === true) {
                canViewLocation = true;
            }
            credits = user.credits ?? 0;
            profileCompletion = calculateProfileCompletion({
                displayName: user.displayName,
                phoneNumber: user.phoneNumber,
                cpf: user.cpf,
                address: user.address,
                creditCard: (user as any).creditCard,
            });

            // Determine effective profile based on subscription status
            const hasPaidProfile = profiles.some(p => p === 'cliente');
            if (hasPaidProfile && user.subscription?.planId) {
                const now = new Date();
                let shouldDowngrade = false;

                // Check monthly plan expiry
                if (user.subscription.expiresAt) {
                    const expiryDate = new Date(user.subscription.expiresAt);
                    const diffMs = expiryDate.getTime() - now.getTime();
                    daysUntilExpiry = Math.ceil(diffMs / (1000 * 60 * 60 * 24)); // Calculate days left (can be negative)
                }

                // Check credits plan: if credits reached 0 and no active monthly subscription
                if (!shouldDowngrade && user.subscription.status === 'active') {
                    const plan = await Plan.findById(user.subscription.planId).lean() as any;
                    if (plan?.type === 'credits' && (user.credits ?? 0) <= 0) {
                        shouldDowngrade = true;
                    }
                }

                if (shouldDowngrade) {
                    profiles = profiles.filter(p => p !== 'cliente');
                    if (profiles.length === 0) profiles.push('gratis');
                    
                    const newDefault = user.defaultProfile === 'cliente' ? profiles[0] : user.defaultProfile;
                    credits = user.credits ?? 0;
                    
                    await User.findByIdAndUpdate(user._id, {
                        $set: {
                            allowedProfiles: profiles,
                            defaultProfile: newDefault,
                            'subscription.status': 'inactive',
                        },
                    });
                }
            } else if (hasPaidProfile && !user.subscription?.planId) {
                // Has 'cliente' profile but no subscription at all → downgrade
                profiles = profiles.filter(p => p !== 'cliente');
                if (profiles.length === 0) profiles.push('gratis');
                
                const newDefault = user.defaultProfile === 'cliente' ? profiles[0] : user.defaultProfile;
                await User.findByIdAndUpdate(user._id, {
                    $set: {
                        allowedProfiles: profiles,
                        defaultProfile: newDefault,
                    },
                });
            }

            // ── Invitee profile sync: inherit from inviter ──
            const invite = await Invite.findOne({
                inviteeUserId: user._id,
                status: 'accepted',
            }).lean() as any;

            if (invite) {
                const inviter = await User.findById(invite.inviterId).lean() as any;
                if (inviter) {
                    const inviterIsCliente = inviter.allowedProfiles?.includes('cliente');
                    if (inviterIsCliente) {
                        // Inviter has active plan → invitee gets cliente
                        if (!profiles.includes('cliente')) {
                            profiles = ['cliente'];
                            await User.findByIdAndUpdate(user._id, {
                                $set: { allowedProfiles: ['cliente'], defaultProfile: 'cliente' },
                            });
                        }
                    } else {
                        // Inviter lost paid profile → invitee goes to gratis
                        if (profiles.includes('cliente')) {
                            profiles = profiles.filter(p => p !== 'cliente');
                            if (profiles.length === 0) profiles.push('gratis');
                            
                            const newDefault = user.defaultProfile === 'cliente' ? profiles[0] : user.defaultProfile;
                            await User.findByIdAndUpdate(user._id, {
                                $set: {
                                    allowedProfiles: profiles,
                                    defaultProfile: newDefault,
                                    'subscription.status': 'inactive',
                                },
                            });
                        }
                    }
                }
            }

            const hasOnlyFreeClientAccess = profiles.includes('gratis') && !profiles.includes('cliente');
            if (hasOnlyFreeClientAccess) {
                const now = new Date();

                if (user.freeTrialExpiresAt) {
                    freeTrialExpiresAt = new Date(user.freeTrialExpiresAt);
                } else {
                    const freeTrial = createExpiredFreeTrialWindow(now);
                    freeTrialExpiresAt = freeTrial.freeTrialExpiresAt;
                    await User.findByIdAndUpdate(user._id, { $set: freeTrial });
                }

                freeTrialExpired = isFreeTrialExpired(freeTrialExpiresAt, now);
            }
        } else {
            // Fallback logic if no profiles in DB (Legacy/Hardcoded)
            if (email.includes('admin')) profiles = ['administrador'];
            else if (email.includes('dealership') || email.includes('concessionaria')) profiles = ['concessionaria'];
            else if (email.includes('client') || email.includes('cliente')) profiles = ['cliente'];
        }

        return {
            profiles,
            forcePasswordChange,
            canViewLocation,
            credits,
            profileCompletion,
            daysUntilExpiry,
            subscriptionPlanId,
            subscriptionExpiresAt,
            subscriptionBillingType,
            freeTrialExpiresAt: freeTrialExpiresAt?.toISOString() ?? null,
            freeTrialExpired,
            profileVersion: user?.profileVersion ?? 0,
            displayName: user?.displayName || null,
        };
    } catch (error) {
        console.error('Error fetching user profiles:', error);
        // Fallback logic in case of DB error
        let profiles: UserProfile[] = ['operador'];
        if (email.includes('admin')) profiles = ['administrador'];
        return { profiles, forcePasswordChange: false, canViewLocation: false, credits: 0, profileCompletion: 0, daysUntilExpiry: null, subscriptionPlanId: null, subscriptionExpiresAt: null, subscriptionBillingType: null, freeTrialExpiresAt: null, freeTrialExpired: false, profileVersion: 0, displayName: null };
    }
}

export async function updateUserSession(email: string, sessionToken: string): Promise<void> {
    await connectDB();
    // Assuming user exists because we authenticated them
    await User.findOneAndUpdate({ email }, { currentSessionToken: sessionToken });
}

export async function validateUserSession(email: string, sessionToken: string): Promise<{ valid: boolean; profileVersion: number }> {
    try {
        await connectDB();
        const user = await User.findOne({ email }).select('currentSessionToken profileVersion');
        if (!user) return { valid: false, profileVersion: 0 };
        return {
            valid: user.currentSessionToken === sessionToken,
            profileVersion: (user as any).profileVersion ?? 0,
        };
    } catch (error) {
        console.error('Error validating session:', error);
        return { valid: true, profileVersion: 0 }; // Fail open on DB errors
    }
}

export async function checkActiveSession(email: string): Promise<boolean> {
    try {
        await connectDB();
        const user = await User.findOne({ email }).select('currentSessionToken');
        return !!user?.currentSessionToken;
    } catch (error) {
        console.error('Error checking active session:', error);
        return false;
    }
}
