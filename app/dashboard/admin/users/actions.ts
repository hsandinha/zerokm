'use server';

import { adminAuth } from '@/lib/firebase-admin';
import { UserProfile } from '@/lib/types/auth';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';

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
    canViewLocation?: boolean;
}

export async function listAllUsers(): Promise<AdminUser[]> {
    try {
        await connectDB();
        // 1. List users from Firebase Auth
        const listUsersResult = await adminAuth.listUsers(1000); // Limit to 1000 for now

        const users: AdminUser[] = [];

        // Fetch all users from MongoDB
        const dbUsers = await User.find({ firebaseUid: { $in: listUsersResult.users.map(u => u.uid) } }).lean();
        const dbUsersMap = new Map(dbUsers.map((u: any) => [u.firebaseUid, u]));

        for (const userRecord of listUsersResult.users) {
            // 2. Fetch additional data from MongoDB for each user
            const userData = dbUsersMap.get(userRecord.uid);

            users.push({
                uid: userRecord.uid,
                email: userRecord.email || '',
                displayName: userRecord.displayName,
                photoURL: userRecord.photoURL,
                disabled: userRecord.disabled,
                lastSignInTime: userRecord.metadata.lastSignInTime,
                creationTime: userRecord.metadata.creationTime,
                allowedProfiles: (userData?.allowedProfiles as UserProfile[]) || [],
                defaultProfile: userData?.defaultProfile as UserProfile,
                dealershipId: userData?.dealershipId,
                canViewLocation: userData?.canViewLocation ?? false // Ensure boolean
            });
        }

        return users;
    } catch (error) {
        console.error('Error listing users:', error);
        throw new Error('Failed to list users');
    }
}

export async function updateUserProfiles(uid: string, allowedProfiles: UserProfile[], defaultProfile?: UserProfile, dealershipId?: string, canViewLocation?: boolean) {
    try {
        await connectDB();
        const updateData: any = {
            allowedProfiles,
            defaultProfile: defaultProfile || allowedProfiles[0],
            updatedAt: new Date()
        };

        if (dealershipId !== undefined) {
            updateData.dealershipId = dealershipId;
        }

        if (canViewLocation !== undefined) {
            updateData.canViewLocation = canViewLocation;
        }

        await User.findOneAndUpdate(
            { firebaseUid: uid },
            { $set: updateData },
            { upsert: true, new: true }
        );

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
    canViewLocation?: boolean;
}) {
    try {
        await connectDB();
        // 1. Create user in Firebase Auth
        const userRecord = await adminAuth.createUser({
            email: data.email,
            password: data.password || 'mudar123', // Default password if not provided
            displayName: data.displayName,
            emailVerified: true, // Auto-verify since admin created it
            disabled: false
        });

        // 2. Create user in MongoDB
        await User.create({
            firebaseUid: userRecord.uid,
            email: data.email,
            displayName: data.displayName,
            allowedProfiles: data.allowedProfiles,
            defaultProfile: data.allowedProfiles[0],
            dealershipId: data.dealershipId || undefined,
            canViewLocation: data.canViewLocation || false,
            forcePasswordChange: true, // Force password change on first login
            createdAt: new Date()
            // createdBy: 'admin' // Not in schema yet
        });

        return { success: true, uid: userRecord.uid };
    } catch (error: any) {
        console.error('Error creating user:', error);
        return { success: false, error: error.message || 'Failed to create user' };
    }
}

export async function deleteUser(uid: string) {
    try {
        await connectDB();
        
        // 1. Delete user from Firebase Auth
        await adminAuth.deleteUser(uid);
        
        // 2. Delete user from MongoDB
        await User.findOneAndDelete({ firebaseUid: uid });
        
        return { success: true };
    } catch (error: any) {
        console.error('Error deleting user:', error);
        return { success: false, error: error.message || 'Failed to delete user' };
    }
}
