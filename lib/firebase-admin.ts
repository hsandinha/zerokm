import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import type { ServiceAccount } from 'firebase-admin';
// Importa o JSON direto. Certifique-se que o caminho está certo!
import serviceAccountJson from '../zerokm-64d2f-firebase-adminsdk-fbsvc-6ef02ecf30.json';

const normalizePrivateKey = (key?: string | null) => {
    if (!key) return undefined;
    // Se a chave já tem quebras de linha reais, retorna ela
    if (key.includes('\n')) return key;
    // Se não, corrige as quebras escapadas
    return key.replace(/\\n/g, '\n');
};

// --- A CORREÇÃO ESTÁ AQUI ---
// Estamos forçando o uso do JSON primeiro.
// Se o JSON tiver a chave, usamos ela. O process.env fica só de backup.
const privateKeyRaw = serviceAccountJson.private_key ?? process.env.FIREBASE_PRIVATE_KEY;

const resolvedServiceAccount: ServiceAccount = {
    projectId: serviceAccountJson.project_id ?? process.env.FIREBASE_PROJECT_ID,
    clientEmail: serviceAccountJson.client_email ?? process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: normalizePrivateKey(privateKeyRaw)
};

// Validação de segurança
if (!resolvedServiceAccount.projectId || !resolvedServiceAccount.clientEmail || !resolvedServiceAccount.privateKey) {
    console.error('Dados da credencial:', {
        temProjectId: !!resolvedServiceAccount.projectId,
        temEmail: !!resolvedServiceAccount.clientEmail,
        temKey: !!resolvedServiceAccount.privateKey
    });
    throw new Error('Credenciais do Firebase Admin inválidas ou ausentes.');
}

const adminApp = getApps().find(app => app?.name === 'admin') ?? initializeApp({
    credential: cert(resolvedServiceAccount),
    projectId: resolvedServiceAccount.projectId
}, 'admin');

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
export { adminApp };