'use server';

import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';

export interface UserProfileData {
    uid?: string;
    email?: string;
    displayName: string;
    phoneNumber?: string;
    cpf?: string;
    address?: {
        street: string;
        number: string;
        complement?: string;
        neighborhood: string;
        city: string;
        state: string;
        zipCode: string;
    };
    photoURL?: string;
}

export async function getUserProfile(): Promise<UserProfileData | null> {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return null;
        }

        const userRecord = await adminAuth.getUserByEmail(session.user.email);
        const userDoc = await adminDb.collection('users').doc(userRecord.uid).get();
        const userData = userDoc.data();

        return {
            uid: userRecord.uid,
            email: userRecord.email || '',
            displayName: userData?.displayName || userRecord.displayName || '',
            phoneNumber: userData?.phoneNumber || '',
            cpf: userData?.cpf || '',
            address: userData?.address || {
                street: '',
                number: '',
                complement: '',
                neighborhood: '',
                city: '',
                state: '',
                zipCode: ''
            },
            photoURL: userRecord.photoURL
        };
    } catch (error) {
        console.error('Error fetching user profile:', error);
        return null;
    }
}

export async function updateUserProfile(data: Partial<UserProfileData>) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return { success: false, error: 'Not authenticated' };
        }

        const userRecord = await adminAuth.getUserByEmail(session.user.email);
        const uid = userRecord.uid;

        // Update Auth Profile (Display Name)
        if (data.displayName) {
            await adminAuth.updateUser(uid, {
                displayName: data.displayName
            });
        }

        // Update Firestore Data
        await adminDb.collection('users').doc(uid).set({
            displayName: data.displayName,
            phoneNumber: data.phoneNumber,
            cpf: data.cpf,
            address: data.address,
            updatedAt: new Date()
        }, { merge: true });

        return { success: true };
    } catch (error) {
        console.error('Error updating user profile:', error);
        return { success: false, error: 'Failed to update profile' };
    }
}
