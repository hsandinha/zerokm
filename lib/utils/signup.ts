import { adminAuth } from '@/lib/firebase-admin';

export interface FirebaseAccountInput {
    email: string;
    password: string;
    displayName: string;
}

export interface FirebaseAccountResult {
    uid: string;
    /** true quando reaproveitamos um registro que já existia no Firebase. */
    adopted: boolean;
}

/**
 * Cria o usuário no Firebase — ou adota um registro órfão.
 *
 * Quem chama precisa ter verificado antes que NÃO existe usuário no Mongo com
 * esse e-mail. Se o Firebase disser que o e-mail já existe mesmo assim, é um
 * órfão: uma tentativa anterior criou a credencial e não conseguiu gravar o
 * documento no Mongo. Ninguém consegue usar essa conta, porque perfil, créditos
 * e trial vêm do Mongo — mas ela bloqueia o e-mail para sempre, já que toda
 * tentativa seguinte esbarra em 'auth/email-already-exists'.
 *
 * Em vez de recusar o cadastro, assumimos o registro e atualizamos as
 * credenciais para as que a pessoa está enviando agora.
 */
export async function createOrAdoptFirebaseUser({
    email,
    password,
    displayName,
}: FirebaseAccountInput): Promise<FirebaseAccountResult> {
    try {
        const record = await adminAuth.createUser({
            email,
            password,
            displayName,
            emailVerified: false,
            disabled: false,
        });
        return { uid: record.uid, adopted: false };
    } catch (error: any) {
        if (error?.code !== 'auth/email-already-exists') throw error;

        const orphan = await adminAuth.getUserByEmail(email);
        await adminAuth.updateUser(orphan.uid, { password, displayName });
        console.warn(`[signup] Registro órfão adotado no Firebase: ${email} (uid ${orphan.uid})`);
        return { uid: orphan.uid, adopted: true };
    }
}

/**
 * Grava no Mongo desfazendo o usuário do Firebase se a escrita falhar.
 *
 * Sem isso, qualquer erro no Mongo (validação, índice, queda de conexão) deixa
 * o e-mail preso: a credencial fica no Firebase, o documento não existe, e a
 * pessoa nunca mais consegue se cadastrar.
 *
 * Só apagamos o que nós mesmos criamos. Se o registro foi adotado, deixamos
 * como estava — apagar seria destruir uma credencial preexistente por causa de
 * uma falha nossa.
 */
export async function persistOrRollbackFirebaseUser<T>(
    account: FirebaseAccountResult,
    persist: () => Promise<T>
): Promise<T> {
    try {
        return await persist();
    } catch (error) {
        if (!account.adopted) {
            await adminAuth.deleteUser(account.uid).catch(rollbackError => {
                console.error(
                    `[signup] Falha ao desfazer o usuário ${account.uid} no Firebase — e-mail pode ficar preso`,
                    rollbackError
                );
            });
        }
        throw error;
    }
}
