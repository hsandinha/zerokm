import { initializeApp, getApps, cert, getApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
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

// Inicialização preguiçosa (lazy): só resolve credenciais, valida e inicializa
// o Firebase Admin no PRIMEIRO uso em runtime — nunca no momento do import.
// Isso evita que o `next build` quebre em ambientes (ex.: CI) onde a
// FIREBASE_PRIVATE_KEY não está disponível, já que o build apenas importa o
// módulo ao coletar dados das rotas, sem chamar nada de fato.
let cachedApp: App | undefined;

const getAdminApp = (): App => {
    if (cachedApp) return cachedApp;
    if (getApps().length > 0) {
        cachedApp = getApp();
        return cachedApp;
    }

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

    // Validação de segurança (agora em runtime, não no import)
    if (!resolvedServiceAccount.privateKey) {
        throw new Error('FIREBASE_PRIVATE_KEY está faltando ou vazia.');
    }

    cachedApp = initializeApp({
        credential: cert(resolvedServiceAccount),
        projectId: resolvedServiceAccount.projectId
    });
    return cachedApp;
};

// Proxy sobre o Auth: a instância do Firebase Admin só é criada quando uma
// propriedade/método de `adminAuth` é realmente acessado em runtime. A
// assinatura pública (`import { adminAuth }`) permanece idêntica.
let cachedAuth: Auth | undefined;
const getAdminAuth = (): Auth => {
    if (!cachedAuth) cachedAuth = getAuth(getAdminApp());
    return cachedAuth;
};

export const adminAuth: Auth = new Proxy({} as Auth, {
    get(_target, prop, receiver) {
        const auth = getAdminAuth();
        const value = Reflect.get(auth, prop, receiver);
        return typeof value === 'function' ? value.bind(auth) : value;
    }
});

export const adminApp: App = new Proxy({} as App, {
    get(_target, prop, receiver) {
        const app = getAdminApp();
        const value = Reflect.get(app, prop, receiver);
        return typeof value === 'function' ? value.bind(app) : value;
    }
});
