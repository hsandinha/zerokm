'use server';

import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { UserProfile } from '@/lib/types/auth';
import { getUserAllowedProfiles as getUserAllowedProfilesService } from '@/lib/services/userService';

export async function getUserAllowedProfiles(email: string): Promise<{ profiles: UserProfile[], forcePasswordChange: boolean }> {
    return getUserAllowedProfilesService(email);
}

export async function markUserAsSetup(email: string) {
    try {
        const userRecord = await adminAuth.getUserByEmail(email);
        await adminDb.collection('users').doc(userRecord.uid).update({
            forcePasswordChange: false
        });
        return { success: true };
    } catch (error) {
        console.error('Error marking user as setup:', error);
        return { success: false };
    }
}

export async function checkUserAndLogin(formData: FormData) {
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    // PASSO 1: Verificar se o usuário existe (usando Admin SDK)
    try {
        await adminAuth.getUserByEmail(email);
    } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
            return {
                success: false,
                type: 'USER_NOT_FOUND',
                message: 'Este usuário não está cadastrado.'
            };
        }
        // Outros erros de sistema no Admin
        console.error('Erro ao verificar usuário:', error);
        return { success: false, message: 'Erro ao verificar cadastro.' };
    }

    // PASSO 2: Se o usuário existe, verificar a senha (usando Client SDK)
    try {
        // Tenta logar no lado do cliente (mas rodando no server action)
        // Nota: O Client SDK precisa estar configurado
        await signInWithEmailAndPassword(auth, email, password);

        return { success: true };

    } catch (error: any) {
        // Se chegou aqui, o email existe, então o erro só pode ser senha
        return {
            success: false,
            type: 'WRONG_PASSWORD',
            message: 'A senha informada está incorreta.'
        };
    }
}
