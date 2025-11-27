import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { UserProfile } from '@/lib/types/auth';

export async function getUserAllowedProfiles(email: string): Promise<{ profiles: UserProfile[], forcePasswordChange: boolean }> {
    try {
        const userRecord = await adminAuth.getUserByEmail(email);
        const userDoc = await adminDb.collection('users').doc(userRecord.uid).get();
        const userData = userDoc.data();

        let profiles: UserProfile[] = ['operador'];
        let forcePasswordChange = false;

        if (userData) {
            if (userData.allowedProfiles && Array.isArray(userData.allowedProfiles)) {
                profiles = userData.allowedProfiles;
            }
            if (userData.forcePasswordChange === true) {
                forcePasswordChange = true;
            }
        } else {
            // Fallback logic if no profiles in DB (Legacy/Hardcoded)
            if (email.includes('admin')) profiles = ['administrador'];
            else if (email.includes('dealership') || email.includes('concessionaria')) profiles = ['concessionaria'];
            else if (email.includes('client') || email.includes('cliente')) profiles = ['cliente'];
        }

        return { profiles, forcePasswordChange };
    } catch (error) {
        console.error('Error fetching user profiles:', error);
        // Fallback logic in case of DB error
        let profiles: UserProfile[] = ['operador'];
        if (email.includes('admin')) profiles = ['administrador'];
        return { profiles, forcePasswordChange: false };
    }
}
