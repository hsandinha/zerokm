import { adminAuth } from '@/lib/firebase-admin';
import { UserProfile } from '@/lib/types/auth';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';

export async function getUserAllowedProfiles(email: string): Promise<{ profiles: UserProfile[], forcePasswordChange: boolean }> {
    try {
        await connectDB();
        const userRecord = await adminAuth.getUserByEmail(email);
        const user = await User.findOne({ firebaseUid: userRecord.uid });

        let profiles: UserProfile[] = ['operador'];
        let forcePasswordChange = false;

        if (user) {
            if (user.allowedProfiles && Array.isArray(user.allowedProfiles)) {
                profiles = user.allowedProfiles as UserProfile[];
            }
            if (user.forcePasswordChange === true) {
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
