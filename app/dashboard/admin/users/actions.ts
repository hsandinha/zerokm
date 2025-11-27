'use server';

import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { UserProfile } from '@/lib/types/auth';

export interface AdminUser {
    uid: string;
    email: string;
    displayName?: string;
    photoURL?: string;
    disabled: boolean;
    lastSignInTime?: string;
    creationTime?: string;
    allowedProfiles: UserProfile[];
    defaultProfile?: UserProfile;
    dealershipId?: string;
}

export async function listAllUsers(): Promise<AdminUser[]> {
    try {
        // 1. List users from Firebase Auth
        const listUsersResult = await adminAuth.listUsers(1000); // Limit to 1000 for now

        const users: AdminUser[] = [];

        for (const userRecord of listUsersResult.users) {
            // 2. Fetch additional data from Firestore for each user
            const userDoc = await adminDb.collection('users').doc(userRecord.uid).get();
            const userData = userDoc.data();

            users.push({
                uid: userRecord.uid,
                email: userRecord.email || '',
                displayName: userRecord.displayName,
                photoURL: userRecord.photoURL,
                disabled: userRecord.disabled,
                lastSignInTime: userRecord.metadata.lastSignInTime,
                creationTime: userRecord.metadata.creationTime,
                allowedProfiles: userData?.allowedProfiles || [],
                defaultProfile: userData?.defaultProfile,
                dealershipId: userData?.dealershipId
            });
        }

        return users;
    } catch (error) {
        console.error('Error listing users:', error);
        throw new Error('Failed to list users');
    }
}

export async function updateUserProfiles(uid: string, allowedProfiles: UserProfile[], defaultProfile?: UserProfile, dealershipId?: string) {
    try {
        const updateData: any = {
            allowedProfiles,
            defaultProfile: defaultProfile || allowedProfiles[0],
            updatedAt: new Date()
        };

        if (dealershipId !== undefined) {
            updateData.dealershipId = dealershipId;
        }

        await adminDb.collection('users').doc(uid).set(updateData, { merge: true });

        // Optional: Set Custom Claims for faster access control without DB lookup
        // await adminAuth.setCustomUserClaims(uid, { allowedProfiles });

        return { success: true };
    } catch (error) {
        console.error('Error updating user profiles:', error);
        return { success: false, error: 'Failed to update user profiles' };
    }
}

export async function toggleUserStatus(uid: string, disabled: boolean) {
    try {
        await adminAuth.updateUser(uid, { disabled });
        return { success: true };
    } catch (error) {
        console.error('Error toggling user status:', error);
        return { success: false, error: 'Failed to update user status' };
    }
}

export async function createUser(data: {
    email: string;
    password?: string;
    displayName?: string;
    allowedProfiles: UserProfile[];
    dealershipId?: string;
}) {
    try {
        // 1. Create user in Firebase Auth
        const userRecord = await adminAuth.createUser({
            email: data.email,
            password: data.password || 'mudar123', // Default password if not provided
            displayName: data.displayName,
            emailVerified: true, // Auto-verify since admin created it
            disabled: false
        });

        // 2. Create user document in Firestore with profiles
        await adminDb.collection('users').doc(userRecord.uid).set({
            email: data.email,
            displayName: data.displayName,
            allowedProfiles: data.allowedProfiles,
            defaultProfile: data.allowedProfiles[0],
            dealershipId: data.dealershipId || null,
            forcePasswordChange: true, // Force password change on first login
            createdAt: new Date(),
            createdBy: 'admin' // You might want to pass the admin's ID here if available
        });

        return { success: true, uid: userRecord.uid };
    } catch (error: any) {
        console.error('Error creating user:', error);
        return { success: false, error: error.message || 'Failed to create user' };
    }
}
