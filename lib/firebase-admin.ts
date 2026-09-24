import { initializeApp, getApps, cert, getApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import type { ServiceAccount } from 'firebase-admin';

// A chave privada é um PEM multilinha guardado numa variável de ambiente —
// e é aí que ela costuma chegar destruída. Três estragos são comuns:
//
//   1. aspas grudadas pelo shell ou pelo painel;
//   2. as quebras viram `\n` literais (ou `\\n`, quando alguém escapa duas vezes);
//   3. as quebras SOMEM (viram espaço, ou nada) num copiar-e-colar — e aí o
//      OpenSSL responde `error:1E08010C:DECODER routines::unsupported`, que
//      não diz a ninguém o que aconteceu.
//
// Os três são reparáveis aqui, sem depender de quem cola a variável acertar o
// formato. Para fugir do problema de vez, `FIREBASE_PRIVATE_KEY_BASE64` aceita
// o PEM inteiro em base64 — nenhum shell mexe nisso.

/** Remonta um PEM cujas quebras de linha se perderam pelo caminho. */
const rewrapPem = (flat: string): string => {
    const match = flat.match(/-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END \1-----/);
    if (!match) return flat;
    const [, tipo, corpo] = match;
    const base64 = corpo.replace(/\s+/g, "");
    const linhas = base64.match(/.{1,64}/g) ?? [];
    return `-----BEGIN ${tipo}-----\n${linhas.join("\n")}\n-----END ${tipo}-----\n`;
};

const normalizePrivateKey = (raw?: string | null): string | undefined => {
    if (!raw) return undefined;
    let key = raw.trim();

    // 1. Aspas de sobra.
    if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
        key = key.slice(1, -1).trim();
    }

    // 2. PEM inteiro em base64 (não tem "BEGIN" à vista): decodifica.
    if (!key.includes("BEGIN")) {
        try {
            const decodificado = Buffer.from(key, "base64").toString("utf8");
            if (decodificado.includes("BEGIN")) key = decodificado.trim();
        } catch {
            /* não era base64 — segue com o valor original */
        }
    }

    // 3. Quebras escapadas viram quebras de verdade. A ordem importa: quem
    //    escapou duas vezes (`\\n`) precisa perder uma barra ANTES, senão sobra
    //    uma barra solta colada na quebra e o PEM continua inválido.
    key = key
        .replace(/\\\\n/g, "\\n")
        .replace(/\\r\\n|\\n/g, "\n")
        .replace(/\r\n/g, "\n")
        .replace(/\\\n/g, "\n");

    // 4. Ficou tudo numa linha só: remonta o PEM a partir do corpo.
    if (!key.includes("\n")) key = rewrapPem(key);

    return key;
};

/**
 * Retrato da chave para diagnóstico — só formato, NUNCA conteúdo. É o que
 * permite dizer "faltam as quebras de linha" em vez de "credencial inválida".
 */
export const privateKeyShape = () => {
    const bruta = process.env.FIREBASE_PRIVATE_KEY_BASE64 || process.env.FIREBASE_PRIVATE_KEY || "";
    const key = normalizePrivateKey(bruta) ?? "";
    return {
        definida: Boolean(bruta),
        origem: process.env.FIREBASE_PRIVATE_KEY_BASE64 ? "base64" : "texto",
        tamanho: key.length,
        cabecalhoOk: key.startsWith("-----BEGIN PRIVATE KEY-----"),
        rodapeOk: key.trim().endsWith("-----END PRIVATE KEY-----"),
        linhas: key ? key.trim().split("\n").length : 0,
        barraNLiteral: /\\n/.test(bruta),
        aspas: /^["'].*["']$/s.test(bruta.trim()),
    };
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
        privateKey: normalizePrivateKey(
            process.env.FIREBASE_PRIVATE_KEY_BASE64 || process.env.FIREBASE_PRIVATE_KEY
        )
    };

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
