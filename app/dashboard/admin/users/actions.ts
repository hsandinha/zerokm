'use server';

import { adminAuth } from '@/lib/firebase-admin';
import { UserProfile } from '@/lib/types/auth';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { isClientOnly } from '@/lib/utils/userProfiles';
import Invite from '@/models/Invite';

const USER_MANAGEMENT_PROFILES = ['admin', 'administrador', 'administrativo'];

async function canManageUsers() {
    const session = await getServerSession(authOptions);
    const profile = (session?.user as any)?.profile;
    return !!profile && USER_MANAGEMENT_PROFILES.includes(profile);
}

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
    invitedBy?: {
        name: string;
        email: string;
    };
    invitedUsers?: {
        name: string;
        email: string;
    }[];
}

export async function listAllUsers(): Promise<AdminUser[]> {
    try {
        if (!(await canManageUsers())) {
            throw new Error('Unauthorized');
        }

        await connectDB();
        // 1. List users from Firebase Auth
        const listUsersResult = await adminAuth.listUsers(1000); // Limit to 1000 for now

        const users: AdminUser[] = [];

        // Fetch all users from MongoDB
        const dbUsers = await User.find({ firebaseUid: { $in: listUsersResult.users.map(u => u.uid) } }).lean();
        const dbUsersMap = new Map(dbUsers.map((u: any) => [u.firebaseUid, u]));
        const dbUserIdMap = new Map(dbUsers.map((u: any) => [u._id.toString(), u]));

        // Fetch Invites for tracing
        const invites = await Invite.find({ status: 'accepted' }).lean();
        const invitedByMap = new Map(
            invites
                .filter(i => i.inviteeUserId)
                .map(i => [i.inviteeUserId!.toString(), i.inviterId.toString()])
        );
        const invitedUsersMap = new Map<string, { name: string, email: string }[]>();
        for (const inv of invites) {
            const inviterIdStr = inv.inviterId.toString();
            if (!invitedUsersMap.has(inviterIdStr)) invitedUsersMap.set(inviterIdStr, []);
            invitedUsersMap.get(inviterIdStr)!.push({ name: inv.inviteeName, email: inv.inviteeEmail });
        }

        for (const userRecord of listUsersResult.users) {
            // 2. Fetch additional data from MongoDB for each user
            const userData = dbUsersMap.get(userRecord.uid);
            let invitedBy;
            let invitedUsers;

            if (userData) {
                const uidStr = userData._id.toString();
                const inviterIdStr = invitedByMap.get(uidStr);
                if (inviterIdStr) {
                    const inviterData = dbUserIdMap.get(inviterIdStr);
                    if (inviterData) {
                        invitedBy = {
                            name: inviterData.displayName || 'Sem nome',
                            email: inviterData.email,
                        };
                    }
                }
                invitedUsers = invitedUsersMap.get(uidStr);
            }

            // Cliente puro (só cliente/gratis) é gerido no CRM — a tela de
            // usuários passou a ser exclusiva da equipe interna.
            if (isClientOnly(userData?.allowedProfiles)) continue;

            users.push({
                uid: userRecord.uid,
                email: userRecord.email || '',
                // Mongo é a fonte canônica do nome (é o que o CRM edita);
                // o Firebase só cobre usuário ainda sem documento no banco.
                displayName: userData?.displayName || userRecord.displayName,
                photoURL: userRecord.photoURL,
                disabled: userRecord.disabled,
                lastSignInTime: userRecord.metadata.lastSignInTime,
                creationTime: userRecord.metadata.creationTime,
                allowedProfiles: (userData?.allowedProfiles as UserProfile[]) || [],
                defaultProfile: userData?.defaultProfile as UserProfile,
                dealershipId: userData?.dealershipId,
                canViewLocation: userData?.canViewLocation ?? false,
                invitedBy,
                invitedUsers,
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
        if (!(await canManageUsers())) {
            return { success: false, error: 'Unauthorized' };
        }

        await connectDB();

        // Garante que o administrador não tenha também o perfil de gerente simultaneamente
        if (allowedProfiles.includes('administrador' as UserProfile)) {
            allowedProfiles = allowedProfiles.filter(p => p !== 'gerente');
        }

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
            { upsert: true, returnDocument: 'after' }
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
        if (!(await canManageUsers())) {
            return { success: false, error: 'Unauthorized' };
        }

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
        if (!(await canManageUsers())) {
            return { success: false, error: 'Unauthorized' };
        }

        await connectDB();

        // Garante que o administrador não tenha também o perfil de gerente simultaneamente
        if (data.allowedProfiles.includes('administrador' as UserProfile)) {
            data.allowedProfiles = data.allowedProfiles.filter(p => p !== 'gerente');
        }

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

/** Login de uma concessionária, na tela Concessionárias. */
export interface UsuarioDaLoja {
    uid: string;
    email: string;
    displayName?: string;
    disabled: boolean;
    lastSignInTime?: string;
}

/**
 * Usuários vinculados a uma concessionária. A tela Concessionárias lista e cria
 * o login da loja sem passar pela Equipe (onde eles se misturavam com a equipe).
 */
export async function listarUsuariosDaLoja(dealershipId: string): Promise<{ success: boolean; usuarios?: UsuarioDaLoja[]; error?: string }> {
    try {
        if (!(await canManageUsers())) return { success: false, error: 'Unauthorized' };
        await connectDB();
        const docs = await User.find({ dealershipId }).select('firebaseUid email displayName').lean() as any[];
        const usuarios: UsuarioDaLoja[] = [];
        for (const doc of docs) {
            const registro = doc.firebaseUid ? await adminAuth.getUser(doc.firebaseUid).catch(() => null) : null;
            usuarios.push({
                uid: doc.firebaseUid,
                email: doc.email,
                displayName: doc.displayName || registro?.displayName,
                disabled: registro?.disabled ?? false,
                lastSignInTime: registro?.metadata.lastSignInTime,
            });
        }
        return { success: true, usuarios };
    } catch (error: any) {
        console.error('Error listing dealership users:', error);
        return { success: false, error: error.message || 'Falha ao listar usuários da loja' };
    }
}

/**
 * Cria o login da concessionária já vinculado à loja. Se o e-mail já existe,
 * só vincula (e garante o perfil concessionária), sem criar outra conta.
 */
export async function criarUsuarioDaLoja(data: { dealershipId: string; email: string; displayName?: string; password?: string }) {
    try {
        if (!(await canManageUsers())) return { success: false, error: 'Unauthorized' };
        const email = (data.email || '').trim().toLowerCase();
        if (!email.includes('@')) return { success: false, error: 'E-mail inválido.' };
        if (data.password && data.password.length < 6) return { success: false, error: 'A senha precisa ter pelo menos 6 caracteres.' };
        await connectDB();

        const existente = await User.findOne({ email });
        if (existente) {
            if (existente.dealershipId && existente.dealershipId !== data.dealershipId) {
                return { success: false, error: 'Este e-mail já é usuário de outra concessionária.' };
            }
            const perfis = Array.from(new Set([...(existente.allowedProfiles || []), 'concessionaria']));
            await User.updateOne({ _id: existente._id }, { $set: { dealershipId: data.dealershipId, allowedProfiles: perfis } });
            return { success: true, vinculado: true };
        }

        const senha = data.password || 'mudar123';
        const userRecord = await adminAuth.createUser({
            email,
            password: senha,
            displayName: data.displayName?.trim() || undefined,
            emailVerified: true,
            disabled: false,
        });
        await User.create({
            firebaseUid: userRecord.uid,
            email,
            displayName: data.displayName?.trim() || undefined,
            allowedProfiles: ['concessionaria'],
            defaultProfile: 'concessionaria',
            dealershipId: data.dealershipId,
            forcePasswordChange: true,
        });
        return { success: true, vinculado: false, senhaProvisoria: data.password ? undefined : senha };
    } catch (error: any) {
        console.error('Error creating dealership user:', error);
        const jaExiste = error?.code === 'auth/email-already-exists';
        return { success: false, error: jaExiste ? 'Este e-mail já tem login no Firebase. Vincule pela tela Equipe.' : (error.message || 'Falha ao criar usuário') };
    }
}

/** Tira o vínculo do usuário com a concessionária (e o perfil de loja). Não apaga o login. */
export async function desvincularUsuarioDaLoja(uid: string) {
    try {
        if (!(await canManageUsers())) return { success: false, error: 'Unauthorized' };
        await connectDB();
        const doc = await User.findOne({ firebaseUid: uid });
        if (!doc) return { success: false, error: 'Usuário não encontrado' };
        const perfis = (doc.allowedProfiles || []).filter((p: string) => p !== 'concessionaria' && p !== 'dealership');
        await User.updateOne({ _id: doc._id }, { $unset: { dealershipId: '' }, $set: { allowedProfiles: perfis } });
        // Sem nenhum perfil, o login fica desativado para não entrar num painel vazio.
        if (perfis.length === 0) await adminAuth.updateUser(uid, { disabled: true }).catch(() => undefined);
        return { success: true };
    } catch (error: any) {
        console.error('Error unlinking dealership user:', error);
        return { success: false, error: error.message || 'Falha ao desvincular' };
    }
}

export async function deleteUser(uid: string) {
    try {
        if (!(await canManageUsers())) {
            return { success: false, error: 'Unauthorized' };
        }

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

/**
 * Estado de acesso de um usuário, para a seção Acessos do CRM.
 * O `disabled` vive só no Firebase Auth; a listagem do CRM vem do Mongo e não
 * o carrega — o modal busca sob demanda ao abrir.
 */
export async function getUserAccessStatus(uid: string): Promise<{ success: boolean; disabled?: boolean; allowedProfiles?: string[]; error?: string }> {
    try {
        if (!(await canManageUsers())) {
            return { success: false, error: 'Unauthorized' };
        }
        const record = await adminAuth.getUser(uid);
        await connectDB();
        const doc = await User.findOne({ firebaseUid: uid }).select('allowedProfiles').lean() as any;
        return { success: true, disabled: record.disabled, allowedProfiles: doc?.allowedProfiles ?? [] };
    } catch (error: any) {
        console.error('Error fetching access status:', error);
        return { success: false, error: error?.message || 'Falha ao consultar acesso' };
    }
}
