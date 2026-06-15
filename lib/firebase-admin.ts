import { initializeApp, getApps, cert, getApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { ServiceAccount } from 'firebase-admin';

const normalizePrivateKey = (key?: string | null) => {
    if (!key) return undefined;

    let normalizedKey = key;

    // 1. Remove aspas extras de start/end (caso existam)
    if (normalizedKey.startsWith('"') && normalizedKey.endsWith('"')) {
        normalizedKey = normalizedKey.slice(1, -1);
    }

    // 2. Garante que qualquer variação de quebra de linha (escapada ou não) vire um \n real
    // Isso cobre tanto "\\n" quanto "\n" literais que venham do .env
    return normalizedKey.replace(/\\n/g, '\n');
};

const resolvedServiceAccount: ServiceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY)
};

// Debug da chave (apenas para desenvolvimento, remover em produção)
if (process.env.NODE_ENV === 'development') {
    const key = resolvedServiceAccount.privateKey || '';
    console.log('--- DEBUG FIREBASE KEY ---');
    console.log('Key length:', key.length);
    console.log('Starts with correct header:', key.startsWith('-----BEGIN PRIVATE KEY-----'));
    console.log('Ends with correct footer:', key.trim().endsWith('-----END PRIVATE KEY-----'));
    console.log('Contains real newlines:', key.includes('\n'));
    console.log('First 50 chars:', key.substring(0, 50));
    console.log('Last 50 chars:', key.substring(key.length - 50));
    console.log('--------------------------');
}

// Validação de segurança (Log útil para debug)
if (!resolvedServiceAccount.privateKey) {
    throw new Error('FIREBASE_PRIVATE_KEY está faltando ou vazia.');
}

// CORREÇÃO PRINCIPAL: Singleton Pattern para a instância DEFAULT
// O NextAuth geralmente procura a instância padrão, não uma chamada 'admin'.
const adminApp = getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential: cert(resolvedServiceAccount),
        projectId: resolvedServiceAccount.projectId
    }); // <--- Note que removi o segundo argumento 'admin'

export const adminAuth = getAuth(adminApp);
export { adminApp };