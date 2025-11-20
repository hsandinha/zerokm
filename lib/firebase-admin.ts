import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import type { ServiceAccount } from 'firebase-admin';
import serviceAccountJson from '../zerokm-64d2f-firebase-adminsdk-fbsvc-6ef02ecf30.json';

const normalizePrivateKey = (key?: string | null) => key ? key.replace(/\\n/g, '\n') : undefined;

const resolvedServiceAccount: ServiceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID ?? serviceAccountJson.project_id,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL ?? serviceAccountJson.client_email,
    privateKey: normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY ?? serviceAccountJson.private_key)
};

if (!resolvedServiceAccount.projectId || !resolvedServiceAccount.clientEmail || !resolvedServiceAccount.privateKey) {
    throw new Error('Firebase Admin credentials are not properly configured.');
}

const adminApp = getApps().find(app => app?.name === 'admin') ?? initializeApp({
    credential: cert(resolvedServiceAccount),
    projectId: resolvedServiceAccount.projectId
}, 'admin');

// Get Auth instance
export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
export { adminApp };