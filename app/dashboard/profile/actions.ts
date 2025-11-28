'use server';

import { adminAuth } from '@/lib/firebase-admin';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';

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
        await connectDB();
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return null;
        }

        const userRecord = await adminAuth.getUserByEmail(session.user.email);
        const user = await User.findOne({ firebaseUid: userRecord.uid }).lean();

        return {
            uid: userRecord.uid,
            email: userRecord.email || '',
            displayName: user?.displayName || userRecord.displayName || '',
            phoneNumber: user?.phoneNumber || '',
            cpf: user?.cpf || '',
            address: user?.address ? {
                street: user.address.street || '',
                number: user.address.number || '',
                complement: user.address.complement || '',
                neighborhood: user.address.neighborhood || '',
                city: user.address.city || '',
                state: user.address.state || '',
                zipCode: user.address.zipCode || ''
            } : {
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
        await connectDB();
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

        // Update MongoDB Data
        await User.findOneAndUpdate(
            { firebaseUid: uid },
            {
                $set: {
                    displayName: data.displayName,
                    phoneNumber: data.phoneNumber,
                    cpf: data.cpf,
                    address: data.address,
                    updatedAt: new Date()
                }
            },
            { upsert: true, new: true }
        );

        return { success: true };
    } catch (error) {
        console.error('Error updating user profile:', error);
        return { success: false, error: 'Failed to update profile' };
    }
}
