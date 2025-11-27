import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import type { ServiceAccount } from 'firebase-admin';

const normalizePrivateKey = (key?: string | null) => {
    if (!key) return undefined;
    // Se a chave já tem quebras de linha reais, retorna ela
    if (key.includes('\n')) return key;
    // Se não, corrige as quebras escapadas
    return key.replace(/\\n/g, '\n');
};

const resolvedServiceAccount: ServiceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY)
};

// Validação de segurança
if (!resolvedServiceAccount.projectId || !resolvedServiceAccount.clientEmail || !resolvedServiceAccount.privateKey) {
    console.error('Dados da credencial:', {
        temProjectId: !!resolvedServiceAccount.projectId,
        temEmail: !!resolvedServiceAccount.clientEmail,
        temKey: !!resolvedServiceAccount.privateKey
    });
    throw new Error('Credenciais do Firebase Admin inválidas ou ausentes. Verifique as variáveis de ambiente (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY).');
}

const adminApp = getApps().find(app => app?.name === 'admin') ?? initializeApp({
    credential: cert(resolvedServiceAccount),
    projectId: resolvedServiceAccount.projectId
}, 'admin');

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
export { adminApp };